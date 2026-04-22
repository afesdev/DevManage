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
  proyecto_id?: string;
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

export interface EstadoDespliegueRepositorio {
  rama_desarrollo: { nombre: string; sha: string | null; ultimo_push_en: string | null };
  rama_main_prueba: { nombre: string; sha: string | null; ultimo_push_en: string | null };
  rama_main: { nombre: string; sha: string | null; ultimo_push_en: string | null };
  prs_abiertas: { a_desarrollo: number; a_main_prueba: number; a_main: number };
}

export interface CommitGithubResumen {
  sha: string;
  mensaje: string;
  usuario_github_autor: string | null;
  nombre_autor: string | null;
  confirmado_en: string;
  rama: string | null;
}

export interface TrazabilidadTareaEvento {
  tipo:
    | 'rama_creada'
    | 'commit'
    | 'pr_desarrollo'
    | 'pr_main_prueba'
    | 'pr_main'
    | 'pr_otra';
  ocurrido_en: string;
  rama: string | null;
  sha: string | null;
  pr_numero: number | null;
  titulo: string;
  estado_pr: string | null;
  rama_destino: string | null;
}

export interface EventoProduccionResumen {
  pr_numero: number;
  titulo: string;
  rama_origen: string;
  rama_destino: string;
  merge_commit_sha: string | null;
  integrada_en: string | null;
  usuario_github_autor: string | null;
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
  head_commit?: {
    timestamp?: string;
  };
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
    merge_commit_sha?: string | null;
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

  private headersGithub(token: string): Record<string, string> {
    return {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${token}`,
      'X-GitHub-Api-Version': '2022-11-28',
    };
  }

  private async obtenerFechaUltimoCommitRama(
    fullName: string,
    rama: string,
    token: string,
  ): Promise<string | null> {
    const encoded = encodeURI(fullName);
    const res = await fetch(
      `https://api.github.com/repos/${encoded}/commits?sha=${encodeURIComponent(rama)}&per_page=1`,
      { headers: this.headersGithub(token) },
    );
    if (!res.ok) return null;
    const json = (await res.json()) as Array<{
      commit?: { author?: { date?: string } };
    }>;
    return json[0]?.commit?.author?.date ?? null;
  }

  private async fetchGithubPaginado<T>(url: string, token: string, maxPaginas = 10): Promise<T[]> {
    let nextUrl: string | null = url;
    const acumulado: T[] = [];
    let pagina = 0;
    while (nextUrl && pagina < maxPaginas) {
      const res = await fetch(nextUrl, { headers: this.headersGithub(token) });
      if (!res.ok) {
        throw new BadRequestException(`GitHub respondió ${res.status} al paginar ${url}`);
      }
      const json = (await res.json()) as T[];
      acumulado.push(...json);
      const link = res.headers.get('link') ?? '';
      const match = link.match(/<([^>]+)>;\s*rel="next"/);
      nextUrl = match?.[1] ?? null;
      pagina += 1;
    }
    return acumulado;
  }

  private normalizarTexto(texto: string): string {
    return texto
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9\s-]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  private extraerCandidatosTarea(texto: string): { idsCortos: Set<string>; idsCompletos: Set<string> } {
    const raw = texto.toLowerCase();
    const idsCortos = new Set<string>();
    const idsCompletos = new Set<string>();

    const reDm = /\bdm-([0-9a-f]{8})\b/g;
    let m = reDm.exec(raw);
    while (m) {
      idsCortos.add(m[1]);
      m = reDm.exec(raw);
    }

    const reUuid = /\b([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\b/g;
    let u = reUuid.exec(raw);
    while (u) {
      idsCompletos.add(u[1]);
      idsCortos.add(u[1].slice(0, 8));
      u = reUuid.exec(raw);
    }

    return { idsCortos, idsCompletos };
  }

  private async autoVincularTareasPorPullRequest(args: {
    repositorioId: string;
    proyectoId: string;
    solicitudId: string;
    ramaOrigen: string;
    textoBusqueda: string;
    actorId?: string;
    numeroPullRequest?: number;
  }): Promise<void> {
    const tareas = await this.db.query<{ tarea_id: string; titulo: string }>(
      `SELECT tarea_id, titulo
      FROM tablero.Tareas
      WHERE proyecto_id = @proyecto_id`,
      { proyecto_id: args.proyectoId },
    );
    if (!tareas.length) return;

    const rama = await this.db.queryOne<{ rama_id: string }>(
      `SELECT TOP 1 rama_id
      FROM github.Ramas
      WHERE repositorio_id = @repositorio_id
        AND nombre = @rama_origen`,
      { repositorio_id: args.repositorioId, rama_origen: args.ramaOrigen },
    );

    const candidatos = this.extraerCandidatosTarea(args.textoBusqueda);
    const textoRama = this.normalizarTexto(args.ramaOrigen.replace(/[-_/]/g, ' '));
    const textoBusqueda = this.normalizarTexto(args.textoBusqueda);
    const actorId = args.actorId ?? (await this.resolverActorProyecto(args.proyectoId));
    if (!actorId) return;

    const tareasObjetivo = new Set<string>();
    for (const tarea of tareas) {
      const id = tarea.tarea_id.toLowerCase();
      const idCorto = id.slice(0, 8);
      const matchDeterministico =
        candidatos.idsCompletos.has(id) || candidatos.idsCortos.has(idCorto);
      if (matchDeterministico) {
        tareasObjetivo.add(tarea.tarea_id);
      }
    }

    // Fallback para convenciones sin ID (ej: Ajustes/Usuario-Descripcion):
    // intenta por similitud del título de tarea en rama/título de PR.
    // Solo aplica si no hubo match determinístico y si el match textual es único.
    if (tareasObjetivo.size === 0) {
      const candidatosTexto: Array<{ tarea_id: string; score: number }> = [];
      for (const tarea of tareas) {
        const tituloNorm = this.normalizarTexto(tarea.titulo);
        const tokens = tituloNorm.split(' ').filter((t) => t.length >= 5);
        if (tokens.length < 2) continue;
        const presentes = tokens.filter(
          (t) => textoBusqueda.includes(t) || textoRama.includes(t),
        ).length;
        const score = presentes / tokens.length;
        if (score >= 0.6 && presentes >= 2) {
          candidatosTexto.push({ tarea_id: tarea.tarea_id, score });
        }
      }
      candidatosTexto.sort((a, b) => b.score - a.score);
      if (
        candidatosTexto.length === 1 ||
        (candidatosTexto.length > 1 &&
          candidatosTexto[0].score >= 0.85 &&
          candidatosTexto[0].score > candidatosTexto[1].score)
      ) {
        tareasObjetivo.add(candidatosTexto[0].tarea_id);
      }
    }

    if (tareasObjetivo.size === 0) return;

    for (const tarea of tareas) {
      if (!tareasObjetivo.has(tarea.tarea_id)) continue;

      const existe = await this.db.queryOne<{ existe: number }>(
        `SELECT TOP 1 1 AS existe
        FROM github.VinculosTareaGithub
        WHERE tarea_id = @tarea_id
          AND solicitud_id = @solicitud_id`,
        { tarea_id: tarea.tarea_id, solicitud_id: args.solicitudId },
      );
      if (existe) continue;

      // Si ya existe vínculo para la misma tarea+rama, mantener solo la PR más reciente.
      if (rama?.rama_id && args.numeroPullRequest) {
        const vinculoRama = await this.db.queryOne<{
          vinculo_id: string;
          numero_github: number | null;
        }>(
          `SELECT TOP 1 v.vinculo_id, si.numero_github
          FROM github.VinculosTareaGithub v
          LEFT JOIN github.SolicitudesIntegracion si ON si.solicitud_id = v.solicitud_id
          WHERE v.tarea_id = @tarea_id
            AND v.rama_id = @rama_id
            AND v.solicitud_id IS NOT NULL
          ORDER BY ISNULL(si.numero_github, 0) DESC`,
          { tarea_id: tarea.tarea_id, rama_id: rama.rama_id },
        );

        if (vinculoRama?.vinculo_id) {
          if ((vinculoRama.numero_github ?? 0) >= args.numeroPullRequest) {
            continue;
          }
          await this.db.query(
            `UPDATE github.VinculosTareaGithub
            SET solicitud_id = @solicitud_id,
                vinculado_por = @vinculado_por,
                vinculado_en = SYSUTCDATETIME()
            WHERE vinculo_id = @vinculo_id`,
            {
              vinculo_id: vinculoRama.vinculo_id,
              solicitud_id: args.solicitudId,
              vinculado_por: actorId,
            },
          );
          continue;
        }
      }

      await this.db.query(
        `INSERT INTO github.VinculosTareaGithub (tarea_id, rama_id, solicitud_id, vinculado_por)
        VALUES (@tarea_id, @rama_id, @solicitud_id, @vinculado_por)`,
        {
          tarea_id: tarea.tarea_id,
          rama_id: rama?.rama_id ?? null,
          solicitud_id: args.solicitudId,
          vinculado_por: actorId,
        },
      );
    }
  }

  private async resolverActorProyecto(proyectoId: string): Promise<string | null> {
    return (
      (
        await this.db.queryOne<{ usuario_id: string }>(
          `SELECT TOP 1 usuario_id
          FROM nucleo.MiembrosProyecto
          WHERE proyecto_id = @proyecto_id
          ORDER BY CASE WHEN rol = 'propietario' THEN 0 ELSE 1 END, unido_en ASC`,
          { proyecto_id: proyectoId },
        )
      )?.usuario_id ?? null
    );
  }

  private async autoVincularTareasPorRama(args: {
    repositorioId: string;
    proyectoId: string;
    ramaId: string;
    nombreRama: string;
  }): Promise<void> {
    const tareas = await this.db.query<{ tarea_id: string; titulo: string }>(
      `SELECT tarea_id, titulo
      FROM tablero.Tareas
      WHERE proyecto_id = @proyecto_id`,
      { proyecto_id: args.proyectoId },
    );
    if (!tareas.length) return;

    const textoRama = this.normalizarTexto(args.nombreRama.replace(/[-_/]/g, ' '));
    const actorId = await this.resolverActorProyecto(args.proyectoId);
    if (!actorId) return;

    const candidatosTexto: Array<{ tarea_id: string; score: number }> = [];
    for (const tarea of tareas) {
      const tituloNorm = this.normalizarTexto(tarea.titulo);
      const tokens = tituloNorm.split(' ').filter((t) => t.length >= 5);
      if (tokens.length < 2) continue;
      const presentes = tokens.filter((t) => textoRama.includes(t)).length;
      const score = presentes / tokens.length;
      if (score >= 0.6 && presentes >= 2) {
        candidatosTexto.push({ tarea_id: tarea.tarea_id, score });
      }
    }
    candidatosTexto.sort((a, b) => b.score - a.score);
    const targets: string[] = [];
    if (
      candidatosTexto.length === 1 ||
      (candidatosTexto.length > 1 &&
        candidatosTexto[0].score >= 0.85 &&
        candidatosTexto[0].score > candidatosTexto[1].score)
    ) {
      targets.push(candidatosTexto[0].tarea_id);
    }

    for (const tareaId of targets) {
      const vinculoExistente = await this.db.queryOne<{
        vinculo_id: string;
        rama_id: string | null;
      }>(
        `SELECT TOP 1 v.vinculo_id, v.rama_id
        FROM github.VinculosTareaGithub v
        LEFT JOIN github.Ramas r ON r.rama_id = v.rama_id
        WHERE v.tarea_id = @tarea_id
          AND r.repositorio_id = @repositorio_id
          AND v.solicitud_id IS NULL
        ORDER BY v.vinculado_en DESC`,
        { tarea_id: tareaId, repositorio_id: args.repositorioId },
      );

      // Si ya hay vínculo de rama para esta tarea en el repo:
      // - misma rama: no hacer nada
      // - distinta rama: reemplazar por la nueva (evita mezclar commits de ramas viejas)
      if (vinculoExistente?.vinculo_id) {
        if (vinculoExistente.rama_id === args.ramaId) continue;
        await this.db.query(
          `UPDATE github.VinculosTareaGithub
          SET rama_id = @rama_id,
              vinculado_por = @vinculado_por,
              vinculado_en = SYSUTCDATETIME()
          WHERE vinculo_id = @vinculo_id`,
          {
            vinculo_id: vinculoExistente.vinculo_id,
            rama_id: args.ramaId,
            vinculado_por: actorId,
          },
        );
        continue;
      }

      await this.db.query(
        `INSERT INTO github.VinculosTareaGithub (tarea_id, rama_id, vinculado_por)
        VALUES (@tarea_id, @rama_id, @vinculado_por)`,
        { tarea_id: tareaId, rama_id: args.ramaId, vinculado_por: actorId },
      );
    }
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
    const ramas = await this.fetchGithubPaginado<{ name?: string; commit?: { sha?: string } }>(
      `https://api.github.com/repos/${encoded}/branches?per_page=100`,
      tokenGithub,
      20,
    );
    for (const rama of ramas) {
      if (!rama.name) continue;
      const ultimoPush = await this.obtenerFechaUltimoCommitRama(
        repo.nombre_completo_github,
        rama.name,
        tokenGithub,
      );
      await this.db.query(
        `MERGE github.Ramas AS destino
        USING (SELECT @repositorio_id AS repositorio_id, @nombre AS nombre) AS origen
        ON destino.repositorio_id = origen.repositorio_id
           AND destino.nombre = origen.nombre
        WHEN MATCHED THEN
          UPDATE SET
            sha_cabeza = @sha_cabeza,
            esta_activa = 1,
            ultimo_push_en = COALESCE(@ultimo_push_en, SYSUTCDATETIME())
        WHEN NOT MATCHED THEN
          INSERT (repositorio_id, nombre, sha_cabeza, esta_activa, ultimo_push_en)
          VALUES (@repositorio_id, @nombre, @sha_cabeza, 1, COALESCE(@ultimo_push_en, SYSUTCDATETIME()));`,
        {
          repositorio_id: repo.repositorio_id,
          nombre: rama.name,
          sha_cabeza: rama.commit?.sha ?? '',
          ultimo_push_en: ultimoPush,
        },
      );
    }

    // Backfill de commits para que la pestaña de commits tenga datos
    // aun cuando no hayan llegado webhooks recientes.
    for (const rama of ramas.slice(0, 25)) {
      if (!rama.name) continue;
      const commitsRama = await this.fetchGithubPaginado<{
        sha?: string;
        commit?: {
          message?: string;
          author?: { name?: string; date?: string };
        };
        author?: { login?: string };
      }>(
        `https://api.github.com/repos/${encoded}/commits?sha=${encodeURIComponent(rama.name)}&per_page=20`,
        tokenGithub,
        1,
      );
      const ramaDb = await this.db.queryOne<{ rama_id: string }>(
        `SELECT TOP 1 rama_id
        FROM github.Ramas
        WHERE repositorio_id = @repositorio_id
          AND nombre = @nombre`,
        { repositorio_id: repo.repositorio_id, nombre: rama.name },
      );
      if (!ramaDb?.rama_id) continue;
      for (const c of commitsRama) {
        if (!c.sha) continue;
        await this.db.execute('github.pa_InsertarConfirmacion', {
          repositorio_id: repo.repositorio_id,
          rama_id: ramaDb.rama_id,
          sha: c.sha,
          mensaje: c.commit?.message ?? '',
          usuario_github_autor: c.author?.login ?? null,
          nombre_autor: c.commit?.author?.name ?? null,
          lineas_agregadas: 0,
          lineas_eliminadas: 0,
          archivos_cambiados: 0,
          confirmado_en: c.commit?.author?.date ?? new Date().toISOString(),
        });
      }
    }

    const prs = await this.fetchGithubPaginado<{
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
    }>(`https://api.github.com/repos/${encoded}/pulls?state=all&per_page=100`, tokenGithub, 20);
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

      const solicitud = await this.db.queryOne<{ solicitud_id: string }>(
        `SELECT TOP 1 solicitud_id
        FROM github.SolicitudesIntegracion
        WHERE repositorio_id = @repositorio_id
          AND numero_github = @numero_github`,
        { repositorio_id: repo.repositorio_id, numero_github: pr.number },
      );
      if (solicitud?.solicitud_id) {
        await this.autoVincularTareasPorPullRequest({
          repositorioId: repo.repositorio_id,
          proyectoId: repo.proyecto_id,
          solicitudId: solicitud.solicitud_id,
          ramaOrigen: pr.head?.ref ?? '',
          textoBusqueda: `${pr.title ?? ''} ${pr.body ?? ''} ${pr.head?.ref ?? ''}`,
          actorId: usuarioId,
          numeroPullRequest: pr.number,
        });
      }
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

  async obtenerCommitsPorRepositorio(
    repositorioId: string,
    usuarioId: string,
    params?: { rama?: string; q?: string; limit?: number },
  ): Promise<CommitGithubResumen[]> {
    const repo = await this.db.queryOne<{ proyecto_id: string }>(
      `SELECT TOP 1 proyecto_id
      FROM github.Repositorios
      WHERE repositorio_id = @repositorio_id`,
      { repositorio_id: repositorioId },
    );
    if (!repo) throw new NotFoundException('Repositorio no encontrado');
    await this.validarAccesoProyecto(repo.proyecto_id, usuarioId);

    const limit = Math.min(Math.max(params?.limit ?? 200, 1), 500);
    const q = (params?.q ?? '').trim().toLowerCase();

    const rows = await this.db.query<CommitGithubResumen>(
      `SELECT TOP (${limit})
        c.sha,
        c.mensaje,
        c.usuario_github_autor,
        c.nombre_autor,
        c.confirmado_en,
        r.nombre AS rama
      FROM github.Confirmaciones c
      LEFT JOIN github.Ramas r ON r.rama_id = c.rama_id
      WHERE c.repositorio_id = @repositorio_id
        AND (@rama IS NULL OR r.nombre = @rama)
        AND (
          @q = ''
          OR LOWER(c.sha) LIKE '%' + @q + '%'
          OR LOWER(c.mensaje) LIKE '%' + @q + '%'
          OR LOWER(ISNULL(c.usuario_github_autor, '')) LIKE '%' + @q + '%'
          OR LOWER(ISNULL(c.nombre_autor, '')) LIKE '%' + @q + '%'
        )
      ORDER BY c.confirmado_en DESC`,
      { repositorio_id: repositorioId, rama: params?.rama ?? null, q },
    );
    return rows;
  }

  async obtenerCommitsPullRequest(
    repositorioId: string,
    numeroPullRequest: number,
    tokenGithub: string,
    usuarioId: string,
  ): Promise<CommitGithubResumen[]> {
    const repo = await this.db.queryOne<{
      proyecto_id: string;
      nombre_completo_github: string;
    }>(
      `SELECT TOP 1 proyecto_id, nombre_completo_github
      FROM github.Repositorios
      WHERE repositorio_id = @repositorio_id`,
      { repositorio_id: repositorioId },
    );
    if (!repo) throw new NotFoundException('Repositorio no encontrado');
    await this.validarAccesoProyecto(repo.proyecto_id, usuarioId);

    const encoded = encodeURI(repo.nombre_completo_github);
    const commits = await this.fetchGithubPaginado<{
      sha?: string;
      commit?: {
        message?: string;
        author?: { name?: string; date?: string };
      };
      author?: { login?: string };
    }>(
      `https://api.github.com/repos/${encoded}/pulls/${numeroPullRequest}/commits?per_page=100`,
      tokenGithub,
      10,
    );

    return commits.map((c) => ({
      sha: c.sha ?? '',
      mensaje: c.commit?.message ?? '',
      usuario_github_autor: c.author?.login ?? null,
      nombre_autor: c.commit?.author?.name ?? null,
      confirmado_en: c.commit?.author?.date ?? new Date().toISOString(),
      rama: null,
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

  async obtenerEstadoDespliegue(
    repositorioId: string,
    usuarioId: string,
  ): Promise<EstadoDespliegueRepositorio> {
    const repo = await this.db.queryOne<{ proyecto_id: string }>(
      `SELECT TOP 1 proyecto_id
      FROM github.Repositorios
      WHERE repositorio_id = @repositorio_id`,
      { repositorio_id: repositorioId },
    );
    if (!repo) {
      throw new NotFoundException('Repositorio no encontrado');
    }
    await this.validarAccesoProyecto(repo.proyecto_id, usuarioId);

    const ramas = await this.db.query<{ nombre: string; sha_cabeza: string; ultimo_push_en: string | null }>(
      `SELECT nombre, sha_cabeza, ultimo_push_en
      FROM github.Ramas
      WHERE repositorio_id = @repositorio_id`,
      { repositorio_id: repositorioId },
    );

    const pick = (...nombres: string[]) => {
      const match = ramas.find((r) => nombres.some((n) => r.nombre.toLowerCase() === n.toLowerCase()));
      return {
        nombre: match?.nombre ?? nombres[0],
        sha: match?.sha_cabeza ?? null,
        ultimo_push_en: match?.ultimo_push_en ?? null,
      };
    };

    const conteos = await this.db.queryOne<{
      a_desarrollo: number;
      a_main_prueba: number;
      a_main: number;
    }>(
      `SELECT
        SUM(CASE WHEN LOWER(rama_destino) = 'desarrollo' AND estado = 'abierta' THEN 1 ELSE 0 END) AS a_desarrollo,
        SUM(CASE WHEN LOWER(rama_destino) IN ('main-prueba', 'main prueba', 'main_prueba') AND estado = 'abierta' THEN 1 ELSE 0 END) AS a_main_prueba,
        SUM(CASE WHEN LOWER(rama_destino) = 'main' AND estado = 'abierta' THEN 1 ELSE 0 END) AS a_main
      FROM github.SolicitudesIntegracion
      WHERE repositorio_id = @repositorio_id`,
      { repositorio_id: repositorioId },
    );

    return {
      rama_desarrollo: pick('desarrollo', 'development', 'dev'),
      rama_main_prueba: pick('main-prueba', 'main prueba', 'main_prueba'),
      rama_main: pick('main', 'master'),
      prs_abiertas: {
        a_desarrollo: conteos?.a_desarrollo ?? 0,
        a_main_prueba: conteos?.a_main_prueba ?? 0,
        a_main: conteos?.a_main ?? 0,
      },
    };
  }

  async obtenerVinculosTareas(
    repositorioId: string,
    usuarioId: string,
  ): Promise<Array<{ tarea_id: string; titulo: string; solicitud_numero: number | null; rama: string | null }>> {
    const repo = await this.db.queryOne<{ proyecto_id: string }>(
      `SELECT TOP 1 proyecto_id
      FROM github.Repositorios
      WHERE repositorio_id = @repositorio_id`,
      { repositorio_id: repositorioId },
    );
    if (!repo) throw new NotFoundException('Repositorio no encontrado');
    await this.validarAccesoProyecto(repo.proyecto_id, usuarioId);

    return this.db.query(
      `SELECT
        t.tarea_id,
        t.titulo,
        si.numero_github AS solicitud_numero,
        r.nombre AS rama
      FROM github.VinculosTareaGithub v
      INNER JOIN tablero.Tareas t ON t.tarea_id = v.tarea_id
      LEFT JOIN github.SolicitudesIntegracion si ON si.solicitud_id = v.solicitud_id
      LEFT JOIN github.Ramas r ON r.rama_id = v.rama_id
      WHERE (
          si.repositorio_id = @repositorio_id
          OR r.repositorio_id = @repositorio_id
      )
      ORDER BY t.actualizado_en DESC`,
      { repositorio_id: repositorioId },
    );
  }

  async obtenerTrazabilidadTarea(
    repositorioId: string,
    tareaId: string,
    usuarioId: string,
  ): Promise<TrazabilidadTareaEvento[]> {
    const repo = await this.db.queryOne<{ proyecto_id: string }>(
      `SELECT TOP 1 proyecto_id
      FROM github.Repositorios
      WHERE repositorio_id = @repositorio_id`,
      { repositorio_id: repositorioId },
    );
    if (!repo) throw new NotFoundException('Repositorio no encontrado');
    await this.validarAccesoProyecto(repo.proyecto_id, usuarioId);

    const eventos = await this.db.query<{
      tipo: TrazabilidadTareaEvento['tipo'];
      ocurrido_en: string;
      rama: string | null;
      sha: string | null;
      pr_numero: number | null;
      titulo: string;
      estado_pr: string | null;
      rama_destino: string | null;
    }>(
      `SELECT
        'rama_creada' AS tipo,
        MIN(r.ultimo_push_en) AS ocurrido_en,
        r.nombre AS rama,
        NULL AS sha,
        NULL AS pr_numero,
        CONCAT('Rama detectada: ', r.nombre) AS titulo,
        NULL AS estado_pr,
        NULL AS rama_destino
      FROM github.VinculosTareaGithub v
      INNER JOIN github.Ramas r ON r.rama_id = v.rama_id
      WHERE v.tarea_id = @tarea_id
        AND v.solicitud_id IS NULL
        AND r.repositorio_id = @repositorio_id
      GROUP BY r.nombre

      UNION ALL

      SELECT DISTINCT
        'commit' AS tipo,
        c.confirmado_en AS ocurrido_en,
        r.nombre AS rama,
        c.sha AS sha,
        NULL AS pr_numero,
        c.mensaje AS titulo,
        NULL AS estado_pr,
        NULL AS rama_destino
      FROM github.VinculosTareaGithub v
      INNER JOIN github.Ramas r ON r.rama_id = v.rama_id
      INNER JOIN github.Confirmaciones c ON c.rama_id = r.rama_id
      WHERE v.tarea_id = @tarea_id
        AND v.solicitud_id IS NULL
        AND r.repositorio_id = @repositorio_id
        AND c.confirmado_en >= DATEADD(DAY, -1, v.vinculado_en)

      UNION ALL

      SELECT
        CASE
          WHEN LOWER(si.rama_destino) = 'desarrollo' THEN 'pr_desarrollo'
          WHEN LOWER(si.rama_destino) IN ('main-prueba', 'main prueba', 'main_prueba') THEN 'pr_main_prueba'
          WHEN LOWER(si.rama_destino) IN ('main', 'master') THEN 'pr_main'
          ELSE 'pr_otra'
        END AS tipo,
        COALESCE(si.integrada_en, si.cerrada_en, si.abierta_en) AS ocurrido_en,
        si.rama_origen AS rama,
        NULL AS sha,
        si.numero_github AS pr_numero,
        si.titulo AS titulo,
        si.estado AS estado_pr,
        si.rama_destino AS rama_destino
      FROM github.VinculosTareaGithub v
      INNER JOIN github.SolicitudesIntegracion si ON si.solicitud_id = v.solicitud_id
      WHERE v.tarea_id = @tarea_id
        AND si.repositorio_id = @repositorio_id`,
      { tarea_id: tareaId, repositorio_id: repositorioId },
    );

    return eventos.sort(
      (a, b) => new Date(a.ocurrido_en).getTime() - new Date(b.ocurrido_en).getTime(),
    );
  }

  async obtenerEventosProduccion(
    repositorioId: string,
    tokenGithub: string,
    usuarioId: string,
  ): Promise<EventoProduccionResumen[]> {
    const repo = await this.db.queryOne<{
      proyecto_id: string;
      nombre_completo_github: string;
    }>(
      `SELECT TOP 1 proyecto_id, nombre_completo_github
      FROM github.Repositorios
      WHERE repositorio_id = @repositorio_id`,
      { repositorio_id: repositorioId },
    );
    if (!repo) throw new NotFoundException('Repositorio no encontrado');
    await this.validarAccesoProyecto(repo.proyecto_id, usuarioId);

    const prsMain = await this.db.query<{
      numero_github: number;
      titulo: string;
      rama_origen: string;
      rama_destino: string;
      integrada_en: string | null;
      usuario_github_autor: string | null;
    }>(
      `SELECT TOP 100
        numero_github,
        titulo,
        rama_origen,
        rama_destino,
        integrada_en,
        usuario_github_autor
      FROM github.SolicitudesIntegracion
      WHERE repositorio_id = @repositorio_id
        AND estado = 'integrada'
        AND LOWER(rama_destino) IN ('main', 'master')
      ORDER BY integrada_en DESC`,
      { repositorio_id: repositorioId },
    );

    const encoded = encodeURI(repo.nombre_completo_github);
    const detalles = await Promise.all(
      prsMain.map(async (pr) => {
        const res = await fetch(
          `https://api.github.com/repos/${encoded}/pulls/${pr.numero_github}`,
          { headers: this.headersGithub(tokenGithub) },
        );
        if (!res.ok) {
          return { pr_numero: pr.numero_github, merge_commit_sha: null as string | null };
        }
        const json = (await res.json()) as { number?: number; merge_commit_sha?: string | null };
        return {
          pr_numero: json.number ?? pr.numero_github,
          merge_commit_sha: json.merge_commit_sha ?? null,
        };
      }),
    );
    const shaPorPr = new Map(detalles.map((d) => [d.pr_numero, d.merge_commit_sha]));

    return prsMain.map((pr) => ({
      pr_numero: pr.numero_github,
      titulo: pr.titulo,
      rama_origen: pr.rama_origen,
      rama_destino: pr.rama_destino,
      merge_commit_sha: shaPorPr.get(pr.numero_github) ?? null,
      integrada_en: pr.integrada_en,
      usuario_github_autor: pr.usuario_github_autor,
    }));
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
      `SELECT TOP 1 repositorio_id, proyecto_id
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
          ultimo_push_en = COALESCE(@ultimo_push_en, SYSUTCDATETIME())
      WHEN NOT MATCHED THEN
        INSERT (repositorio_id, nombre, sha_cabeza, esta_activa, ultimo_push_en)
        VALUES (@repositorio_id, @nombre, @sha_cabeza, 1, COALESCE(@ultimo_push_en, SYSUTCDATETIME()));`,
      {
        repositorio_id: repo.repositorio_id,
        nombre: nombreRama,
        sha_cabeza: shaCabeza,
        ultimo_push_en: payload.head_commit?.timestamp ?? null,
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

    if (repo.proyecto_id) {
      await this.autoVincularTareasPorRama({
        repositorioId: repo.repositorio_id,
        proyectoId: repo.proyecto_id,
        ramaId: rama.rama_id,
        nombreRama,
      });
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

    const solicitud = await this.db.queryOne<{ solicitud_id: string; proyecto_id: string }>(
      `SELECT TOP 1 si.solicitud_id, r.proyecto_id
      FROM github.SolicitudesIntegracion si
      INNER JOIN github.Repositorios r ON r.repositorio_id = si.repositorio_id
      WHERE si.repositorio_id = @repositorio_id
        AND si.numero_github = @numero_github`,
      { repositorio_id: repo.repositorio_id, numero_github: pr.number },
    );
    if (solicitud?.solicitud_id) {
      await this.autoVincularTareasPorPullRequest({
        repositorioId: repo.repositorio_id,
        proyectoId: solicitud.proyecto_id,
        solicitudId: solicitud.solicitud_id,
        ramaOrigen: pr.head?.ref ?? '',
        textoBusqueda: `${pr.title ?? ''} ${pr.body ?? ''} ${pr.head?.ref ?? ''}`,
        numeroPullRequest: pr.number,
      });
    }

    return { procesado: true, detalle: `PR #${pr.number} procesado` };
  }
}
