import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac, timingSafeEqual } from 'crypto';
import { DatabaseService } from '../database/database.service';
import { VincularRepositorioDto } from './dto/vincular-repositorio.dto';

interface RepositorioGithub {
  repositorio_id: string;
  nombre_completo_github?: string;
}

export interface RepositorioResumen {
  repositorio_id: string;
  proyecto_id: string;
  nombre_completo_github: string;
  id_github: number;
  rama_principal: string;
  esta_activo: boolean;
  sincronizado_en: string | null;
  creado_en: string;
}

export interface RamaResumen {
  rama_id: string;
  repositorio_id: string;
  nombre: string;
  sha_cabeza: string;
  esta_activa: boolean;
  ultimo_push_en: string | null;
}

export interface SolicitudIntegracionResumen {
  solicitud_id: string;
  repositorio_id: string;
  numero_github: number;
  titulo: string;
  estado: 'abierta' | 'cerrada' | 'integrada';
  rama_origen: string;
  rama_destino: string;
  usuario_github_autor: string | null;
  abierta_en: string;
  integrada_en: string | null;
  cerrada_en: string | null;
}

/** Datos públicos desde api.github.com (repos visibles sin token). */
export interface RepositorioGithubPublico {
  id_github: number;
  nombre_completo_github: string;
  rama_principal: string;
  descripcion: string | null;
  html_url: string;
}

export interface RepositorioGithubUsuario extends RepositorioGithubPublico {
  privado: boolean;
  actualizado_en: string;
  vinculado_en_devmanage: boolean;
  repositorio_devmanage_id: string | null;
}

export interface ArchivoPullRequestGithub {
  nombre_archivo: string;
  estado: string;
  adiciones: number;
  eliminaciones: number;
  cambios: number;
  patch: string | null;
  es_binario: boolean;
}

interface RamaGithub {
  rama_id: string;
}

interface PushCommitPayload {
  id: string;
  message: string;
  timestamp: string;
  author?: {
    name?: string;
    username?: string;
  };
  added?: string[];
  removed?: string[];
  modified?: string[];
}

interface PushPayload {
  ref?: string;
  after?: string;
  repository?: {
    id?: number;
    full_name?: string;
  };
  sender?: {
    login?: string;
  };
  commits?: PushCommitPayload[];
}

interface PullRequestPayload {
  repository?: {
    id?: number;
    full_name?: string;
  };
  pull_request?: {
    number?: number;
    title?: string;
    state?: string;
    merged?: boolean;
    head?: { ref?: string };
    base?: { ref?: string };
    user?: { login?: string };
    body?: string;
    commits?: number;
    comments?: number;
    additions?: number;
    deletions?: number;
    changed_files?: number;
    draft?: boolean;
    created_at?: string;
    merged_at?: string | null;
    closed_at?: string | null;
  };
}

@Injectable()
export class GithubService {
  constructor(
    private readonly db: DatabaseService,
    private readonly config: ConfigService,
  ) {}

  verificarFirma(rawBody: Buffer, firmaWebhook: string | undefined): boolean {
    const secreto = this.config.get<string>('github.webhookSecret') ?? '';
    if (!secreto || !firmaWebhook?.startsWith('sha256=')) {
      return false;
    }

    const esperado = `sha256=${createHmac('sha256', secreto).update(rawBody).digest('hex')}`;
    const firmaBuffer = Buffer.from(firmaWebhook, 'utf8');
    const esperadoBuffer = Buffer.from(esperado, 'utf8');

    if (firmaBuffer.length !== esperadoBuffer.length) {
      return false;
    }

    return timingSafeEqual(firmaBuffer, esperadoBuffer);
  }

  /**
   * Resuelve propietario/repo contra la API de GitHub.
   * Orden de token: OAuth del usuario (si se pasa), luego GITHUB_TOKEN del servidor.
   */
  async resolverRepositorio(
    fullName: string,
    tokenUsuarioOAuth?: string | null,
  ): Promise<RepositorioGithubPublico> {
    const normalizado = fullName.trim().replace(/^\/+|\/+$/g, '');
    if (!normalizado || normalizado.includes('..') || !/^[^/]+\/[^/]+$/.test(normalizado)) {
      throw new BadRequestException('Usa el formato propietario/repositorio (ej. octocat/Hello-World)');
    }

    const tokenUsuario = (tokenUsuarioOAuth ?? '').trim();
    const tokenServidor = (this.config.get<string>('github.apiToken') ?? '').trim();
    const token = tokenUsuario || tokenServidor;
    const encoded = encodeURI(normalizado);
    const cabeceras: Record<string, string> = {
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
    };
    if (token) {
      cabeceras.Authorization = `Bearer ${token}`;
    }

    const respuesta = await fetch(`https://api.github.com/repos/${encoded}`, {
      headers: cabeceras,
    });

    if (respuesta.status === 401) {
      throw new BadRequestException(
        'GitHub rechazó el token. Reconecta GitHub en DevManage o revisa GITHUB_TOKEN del servidor.',
      );
    }
    if (respuesta.status === 404) {
      if (!token) {
        throw new NotFoundException(
          'Repositorio no encontrado o es privado. Conecta tu cuenta de GitHub en esta app o configura GITHUB_TOKEN en el servidor.',
        );
      }
      throw new NotFoundException(
        'Repositorio no encontrado o sin acceso con tu cuenta. Comprueba el nombre owner/repo y que tengas permiso en GitHub.',
      );
    }
    if (!respuesta.ok) {
      throw new BadRequestException(`GitHub respondió ${respuesta.status}`);
    }

    const cuerpo = (await respuesta.json()) as {
      id?: number;
      full_name?: string;
      default_branch?: string;
      description?: string | null;
      html_url?: string;
    };

    if (typeof cuerpo.id !== 'number' || !cuerpo.full_name) {
      throw new BadRequestException('Respuesta inesperada de GitHub');
    }

    return {
      id_github: cuerpo.id,
      nombre_completo_github: cuerpo.full_name,
      rama_principal: cuerpo.default_branch ?? 'main',
      descripcion: cuerpo.description ?? null,
      html_url: cuerpo.html_url ?? `https://github.com/${cuerpo.full_name}`,
    };
  }

  private async validarAccesoProyecto(proyectoId: string, usuarioId: string): Promise<void> {
    const miembro = await this.db.queryOne<{ existe: number }>(
      `SELECT TOP 1 1 AS existe
      FROM nucleo.MiembrosProyecto
      WHERE proyecto_id = @proyecto_id
        AND usuario_id = @usuario_id`,
      {
        proyecto_id: proyectoId,
        usuario_id: usuarioId,
      },
    );

    if (!miembro) {
      throw new ForbiddenException('No tienes acceso a este proyecto');
    }
  }

  async vincularRepositorio(
    dto: VincularRepositorioDto,
    usuarioId: string,
    tokenGithub?: string,
  ): Promise<RepositorioResumen> {
    await this.validarAccesoProyecto(dto.proyecto_id, usuarioId);

    await this.db.query(
      `MERGE github.Repositorios AS destino
      USING (
        SELECT @id_github AS id_github
      ) AS origen
      ON destino.id_github = origen.id_github
      WHEN MATCHED THEN
        UPDATE SET
          proyecto_id = @proyecto_id,
          nombre_completo_github = @nombre_completo_github,
          rama_principal = @rama_principal,
          esta_activo = 1,
          sincronizado_en = SYSUTCDATETIME()
      WHEN NOT MATCHED THEN
        INSERT (proyecto_id, nombre_completo_github, id_github, rama_principal, esta_activo, sincronizado_en)
        VALUES (@proyecto_id, @nombre_completo_github, @id_github, @rama_principal, 1, SYSUTCDATETIME());`,
      {
        proyecto_id: dto.proyecto_id,
        nombre_completo_github: dto.nombre_completo_github,
        id_github: dto.id_github,
        rama_principal: dto.rama_principal ?? 'main',
      },
    );

    const repositorio = await this.db.queryOne<RepositorioResumen>(
      `SELECT TOP 1
        repositorio_id,
        proyecto_id,
        nombre_completo_github,
        id_github,
        rama_principal,
        esta_activo,
        sincronizado_en,
        creado_en
      FROM github.Repositorios
      WHERE id_github = @id_github`,
      { id_github: dto.id_github },
    );

    if (!repositorio) {
      throw new ForbiddenException('No fue posible vincular el repositorio');
    }

    if (tokenGithub) {
      await this.sincronizarRepositorio(repositorio.repositorio_id, tokenGithub, usuarioId);
    }

    return repositorio;
  }

  async sincronizarRepositorio(
    repositorioId: string,
    tokenGithub: string,
    usuarioId: string,
  ): Promise<{ ramas: number; prs: number }> {
    const repo = await this.db.queryOne<{
      repositorio_id: string;
      proyecto_id: string;
      nombre_completo_github: string;
    }>(
      `SELECT TOP 1 repositorio_id, proyecto_id, nombre_completo_github
      FROM github.Repositorios
      WHERE repositorio_id = @repositorio_id`,
      { repositorio_id: repositorioId },
    );
    if (!repo) throw new NotFoundException('Repositorio no encontrado en DevManage');

    await this.validarAccesoProyecto(repo.proyecto_id, usuarioId);
    const fullName = repo.nombre_completo_github;
    const encoded = encodeURI(fullName);
    const headers: Record<string, string> = {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${tokenGithub}`,
      'X-GitHub-Api-Version': '2022-11-28',
    };

    const ramasRes = await fetch(`https://api.github.com/repos/${encoded}/branches?per_page=100`, { headers });
    if (ramasRes.status === 401) {
      throw new BadRequestException('Tu sesión de GitHub expiró. Desconecta y conecta de nuevo.');
    }
    if (!ramasRes.ok) {
      throw new BadRequestException(`No se pudieron leer ramas de GitHub (${ramasRes.status})`);
    }
    const ramas = (await ramasRes.json()) as Array<{ name?: string; commit?: { sha?: string } }>;
    for (const rama of ramas) {
      if (!rama.name) continue;
      await this.db.query(
        `MERGE github.Ramas AS destino
        USING (SELECT @repositorio_id AS repositorio_id, @nombre AS nombre) AS origen
        ON destino.repositorio_id = origen.repositorio_id
           AND destino.nombre = origen.nombre
        WHEN MATCHED THEN
          UPDATE SET
            sha_cabeza = @sha_cabeza,
            esta_activa = 1,
            ultimo_push_en = SYSUTCDATETIME()
        WHEN NOT MATCHED THEN
          INSERT (repositorio_id, nombre, sha_cabeza, esta_activa, ultimo_push_en)
          VALUES (@repositorio_id, @nombre, @sha_cabeza, 1, SYSUTCDATETIME());`,
        {
          repositorio_id: repo.repositorio_id,
          nombre: rama.name,
          sha_cabeza: rama.commit?.sha ?? '',
        },
      );
    }

    const prsRes = await fetch(`https://api.github.com/repos/${encoded}/pulls?state=all&per_page=100`, { headers });
    if (!prsRes.ok) {
      throw new BadRequestException(`No se pudieron leer pull requests de GitHub (${prsRes.status})`);
    }
    const prs = (await prsRes.json()) as Array<{
      number?: number;
      title?: string;
      state?: string;
      merged_at?: string | null;
      head?: { ref?: string };
      base?: { ref?: string };
      user?: { login?: string };
      body?: string;
      comments?: number;
      draft?: boolean;
      created_at?: string;
      closed_at?: string | null;
    }>;
    for (const pr of prs) {
      if (!pr.number) continue;
      const estado = pr.merged_at ? 'integrada' : pr.state === 'open' ? 'abierta' : 'cerrada';
      await this.db.execute('github.pa_InsertarSolicitudIntegracion', {
        repositorio_id: repo.repositorio_id,
        numero_github: pr.number,
        titulo: pr.title ?? '',
        estado,
        rama_origen: pr.head?.ref ?? '',
        rama_destino: pr.base?.ref ?? '',
        usuario_github_autor: pr.user?.login ?? null,
        resumen_descripcion: (pr.body ?? '').slice(0, 1000),
        total_confirmaciones: 0,
        total_comentarios: pr.comments ?? 0,
        lineas_agregadas: 0,
        lineas_eliminadas: 0,
        archivos_cambiados: 0,
        es_borrador: pr.draft ? 1 : 0,
        abierta_en: pr.created_at ?? new Date().toISOString(),
        integrada_en: pr.merged_at ?? null,
        cerrada_en: pr.closed_at ?? null,
      });
    }

    return { ramas: ramas.length, prs: prs.length };
  }

  async obtenerArchivosPullRequest(
    repositorioId: string,
    numeroPullRequest: number,
    tokenGithub: string,
    usuarioId: string,
  ): Promise<ArchivoPullRequestGithub[]> {
    const repo = await this.db.queryOne<{
      repositorio_id: string;
      proyecto_id: string;
      nombre_completo_github: string;
    }>(
      `SELECT TOP 1 repositorio_id, proyecto_id, nombre_completo_github
      FROM github.Repositorios
      WHERE repositorio_id = @repositorio_id`,
      { repositorio_id: repositorioId },
    );
    if (!repo) throw new NotFoundException('Repositorio no encontrado en DevManage');
    await this.validarAccesoProyecto(repo.proyecto_id, usuarioId);

    const encoded = encodeURI(repo.nombre_completo_github);
    const res = await fetch(
      `https://api.github.com/repos/${encoded}/pulls/${numeroPullRequest}/files?per_page=100`,
      {
        headers: {
          Accept: 'application/vnd.github+json',
          Authorization: `Bearer ${tokenGithub}`,
          'X-GitHub-Api-Version': '2022-11-28',
        },
      },
    );
    if (!res.ok) {
      throw new BadRequestException(
        `No se pudieron leer archivos del PR #${numeroPullRequest} (${res.status})`,
      );
    }
    const data = (await res.json()) as Array<{
      filename?: string;
      status?: string;
      additions?: number;
      deletions?: number;
      changes?: number;
      patch?: string;
    }>;
    return data.map((f) => ({
      nombre_archivo: f.filename ?? '',
      estado: f.status ?? 'modified',
      adiciones: f.additions ?? 0,
      eliminaciones: f.deletions ?? 0,
      cambios: f.changes ?? 0,
      patch: f.patch ?? null,
      es_binario: !f.patch,
    }));
  }

  async obtenerRepositoriosPorProyecto(
    proyectoId: string,
    usuarioId: string,
  ): Promise<RepositorioResumen[]> {
    await this.validarAccesoProyecto(proyectoId, usuarioId);
    return this.db.query<RepositorioResumen>(
      `SELECT
        repositorio_id,
        proyecto_id,
        nombre_completo_github,
        id_github,
        rama_principal,
        esta_activo,
        sincronizado_en,
        creado_en
      FROM github.Repositorios
      WHERE proyecto_id = @proyecto_id
      ORDER BY creado_en DESC`,
      { proyecto_id: proyectoId },
    );
  }

  async listarRepositoriosUsuario(
    tokenGithub: string,
    proyectoId?: string,
    usuarioId?: string,
  ): Promise<RepositorioGithubUsuario[]> {
    if (proyectoId && usuarioId) {
      await this.validarAccesoProyecto(proyectoId, usuarioId);
    }

    const respuesta = await fetch(
      'https://api.github.com/user/repos?per_page=100&sort=updated&type=all',
      {
        headers: {
          Accept: 'application/vnd.github+json',
          Authorization: `Bearer ${tokenGithub}`,
          'X-GitHub-Api-Version': '2022-11-28',
        },
      },
    );

    if (respuesta.status === 401) {
      throw new BadRequestException('Tu sesión de GitHub expiró. Desconecta y conecta de nuevo.');
    }
    if (!respuesta.ok) {
      throw new BadRequestException(`No se pudo listar repositorios de GitHub (${respuesta.status})`);
    }

    const repos = (await respuesta.json()) as Array<{
      id: number;
      full_name: string;
      default_branch: string | null;
      description: string | null;
      html_url: string;
      private: boolean;
      updated_at: string;
    }>;

    if (!repos.length) return [];

    const params: Record<string, unknown> = {};
    const inClauses: string[] = [];
    repos.forEach((r, index) => {
      const key = `id_${index}`;
      params[key] = r.id;
      inClauses.push(`@${key}`);
    });

    const vinculados = await this.db.query<{
      id_github: number;
      repositorio_id: string;
      proyecto_id: string;
    }>(
      `SELECT id_github, repositorio_id, proyecto_id
      FROM github.Repositorios
      WHERE id_github IN (${inClauses.join(', ')})`,
      params,
    );

    const vinculadosPorId = new Map(vinculados.map((v) => [v.id_github, v]));

    return repos.map((r) => {
      const vinculado = vinculadosPorId.get(r.id);
      const correspondeProyecto = proyectoId ? vinculado?.proyecto_id === proyectoId : Boolean(vinculado);
      return {
        id_github: r.id,
        nombre_completo_github: r.full_name,
        rama_principal: r.default_branch ?? 'main',
        descripcion: r.description ?? null,
        html_url: r.html_url,
        privado: Boolean(r.private),
        actualizado_en: r.updated_at,
        vinculado_en_devmanage: correspondeProyecto,
        repositorio_devmanage_id: vinculado?.repositorio_id ?? null,
      };
    });
  }

  async obtenerRamasPorRepositorio(
    repositorioId: string,
    usuarioId: string,
  ): Promise<RamaResumen[]> {
    const repo = await this.db.queryOne<{ proyecto_id: string }>(
      `SELECT TOP 1 proyecto_id
      FROM github.Repositorios
      WHERE repositorio_id = @repositorio_id`,
      { repositorio_id: repositorioId },
    );
    if (!repo) {
      return [];
    }

    await this.validarAccesoProyecto(repo.proyecto_id, usuarioId);

    return this.db.query<RamaResumen>(
      `SELECT
        rama_id,
        repositorio_id,
        nombre,
        sha_cabeza,
        esta_activa,
        ultimo_push_en
      FROM github.Ramas
      WHERE repositorio_id = @repositorio_id
      ORDER BY esta_activa DESC, ultimo_push_en DESC, nombre ASC`,
      { repositorio_id: repositorioId },
    );
  }

  async obtenerSolicitudesIntegracionPorRepositorio(
    repositorioId: string,
    usuarioId: string,
  ): Promise<SolicitudIntegracionResumen[]> {
    const repo = await this.db.queryOne<{ proyecto_id: string }>(
      `SELECT TOP 1 proyecto_id
      FROM github.Repositorios
      WHERE repositorio_id = @repositorio_id`,
      { repositorio_id: repositorioId },
    );
    if (!repo) {
      return [];
    }

    await this.validarAccesoProyecto(repo.proyecto_id, usuarioId);

    return this.db.query<SolicitudIntegracionResumen>(
      `SELECT
        solicitud_id,
        repositorio_id,
        numero_github,
        titulo,
        estado,
        rama_origen,
        rama_destino,
        usuario_github_autor,
        abierta_en,
        integrada_en,
        cerrada_en
      FROM github.SolicitudesIntegracion
      WHERE repositorio_id = @repositorio_id
      ORDER BY abierta_en DESC`,
      { repositorio_id: repositorioId },
    );
  }

  async procesarEvento(evento: string, payload: unknown): Promise<{ procesado: boolean; detalle: string }> {
    if (evento === 'push') {
      return this.procesarPush(payload as PushPayload);
    }
    if (evento === 'pull_request') {
      return this.procesarPullRequest(payload as PullRequestPayload);
    }
    return { procesado: false, detalle: `Evento no manejado: ${evento}` };
  }

  private async buscarRepositorio(
    idGithub: number | undefined,
    nombreCompleto: string | undefined,
  ): Promise<RepositorioGithub | null> {
    if (!idGithub && !nombreCompleto) {
      return null;
    }

    return this.db.queryOne<RepositorioGithub>(
      `SELECT TOP 1 repositorio_id
      FROM github.Repositorios
      WHERE (@id_github IS NOT NULL AND id_github = @id_github)
         OR (@nombre_completo IS NOT NULL AND nombre_completo_github = @nombre_completo)`,
      {
        id_github: idGithub ?? null,
        nombre_completo: nombreCompleto ?? null,
      },
    );
  }

  private async procesarPush(
    payload: PushPayload,
  ): Promise<{ procesado: boolean; detalle: string }> {
    const repo = await this.buscarRepositorio(payload.repository?.id, payload.repository?.full_name);
    if (!repo) {
      return { procesado: false, detalle: 'Repositorio no vinculado en DevManage' };
    }

    const nombreRama = (payload.ref ?? '').replace('refs/heads/', '');
    if (!nombreRama) {
      return { procesado: false, detalle: 'Push sin referencia de rama' };
    }

    const shaCabeza = payload.after ?? '';
    await this.db.query(
      `MERGE github.Ramas AS destino
      USING (
        SELECT @repositorio_id AS repositorio_id, @nombre AS nombre
      ) AS origen
      ON destino.repositorio_id = origen.repositorio_id
         AND destino.nombre = origen.nombre
      WHEN MATCHED THEN
        UPDATE SET
          sha_cabeza = @sha_cabeza,
          esta_activa = 1,
          ultimo_push_en = SYSUTCDATETIME()
      WHEN NOT MATCHED THEN
        INSERT (repositorio_id, nombre, sha_cabeza, esta_activa, ultimo_push_en)
        VALUES (@repositorio_id, @nombre, @sha_cabeza, 1, SYSUTCDATETIME());`,
      {
        repositorio_id: repo.repositorio_id,
        nombre: nombreRama,
        sha_cabeza: shaCabeza,
      },
    );

    const rama = await this.db.queryOne<RamaGithub>(
      `SELECT TOP 1 rama_id
      FROM github.Ramas
      WHERE repositorio_id = @repositorio_id
        AND nombre = @nombre`,
      {
        repositorio_id: repo.repositorio_id,
        nombre: nombreRama,
      },
    );

    if (!rama) {
      return { procesado: false, detalle: 'No se pudo determinar la rama del push' };
    }

    for (const commit of payload.commits ?? []) {
      const archivosCambiados =
        (commit.added?.length ?? 0) +
        (commit.modified?.length ?? 0) +
        (commit.removed?.length ?? 0);

      await this.db.execute('github.pa_InsertarConfirmacion', {
        repositorio_id: repo.repositorio_id,
        rama_id: rama.rama_id,
        sha: commit.id,
        mensaje: commit.message ?? '',
        usuario_github_autor: commit.author?.username ?? payload.sender?.login ?? null,
        nombre_autor: commit.author?.name ?? null,
        lineas_agregadas: 0,
        lineas_eliminadas: 0,
        archivos_cambiados: archivosCambiados,
        confirmado_en: commit.timestamp ?? new Date().toISOString(),
      });
    }

    return { procesado: true, detalle: `Push procesado en rama ${nombreRama}` };
  }

  private async procesarPullRequest(
    payload: PullRequestPayload,
  ): Promise<{ procesado: boolean; detalle: string }> {
    const repo = await this.buscarRepositorio(payload.repository?.id, payload.repository?.full_name);
    if (!repo) {
      return { procesado: false, detalle: 'Repositorio no vinculado en DevManage' };
    }

    const pr = payload.pull_request;
    if (!pr?.number) {
      return { procesado: false, detalle: 'Payload de pull_request incompleto' };
    }

    const estado = pr.merged ? 'integrada' : pr.state === 'open' ? 'abierta' : 'cerrada';

    await this.db.execute('github.pa_InsertarSolicitudIntegracion', {
      repositorio_id: repo.repositorio_id,
      numero_github: pr.number,
      titulo: pr.title ?? '',
      estado,
      rama_origen: pr.head?.ref ?? '',
      rama_destino: pr.base?.ref ?? '',
      usuario_github_autor: pr.user?.login ?? null,
      resumen_descripcion: (pr.body ?? '').slice(0, 1000),
      total_confirmaciones: pr.commits ?? 0,
      total_comentarios: pr.comments ?? 0,
      lineas_agregadas: pr.additions ?? 0,
      lineas_eliminadas: pr.deletions ?? 0,
      archivos_cambiados: pr.changed_files ?? 0,
      es_borrador: pr.draft ? 1 : 0,
      abierta_en: pr.created_at ?? new Date().toISOString(),
      integrada_en: pr.merged_at ?? null,
      cerrada_en: pr.closed_at ?? null,
    });

    return { procesado: true, detalle: `PR #${pr.number} procesado` };
  }
}
