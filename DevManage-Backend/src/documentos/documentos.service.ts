import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { ActualizarPaginaDto } from './dto/actualizar-pagina.dto';
import { CrearPaginaDto } from './dto/crear-pagina.dto';

export interface PaginaResumen {
  pagina_id: string;
  proyecto_id: string;
  pagina_padre_id: string | null;
  titulo: string;
  slug: string;
  posicion: number;
  actualizado_en: string;
}

export interface PaginaDetalle extends PaginaResumen {
  contenido_md: string | null;
  creado_por: string;
  editado_por: string;
  creado_en: string;
}

@Injectable()
export class DocumentosService {
  constructor(private readonly db: DatabaseService) {}

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

  async obtenerPaginasPorProyecto(
    proyectoId: string,
    usuarioId: string,
  ): Promise<PaginaResumen[]> {
    await this.validarAccesoProyecto(proyectoId, usuarioId);

    return this.db.query<PaginaResumen>(
      `SELECT
        pagina_id,
        proyecto_id,
        pagina_padre_id,
        titulo,
        slug,
        posicion,
        actualizado_en
      FROM documentos.Paginas
      WHERE proyecto_id = @proyecto_id
      ORDER BY posicion ASC, creado_en ASC`,
      { proyecto_id: proyectoId },
    );
  }

  async obtenerPaginaPorId(paginaId: string, usuarioId: string): Promise<PaginaDetalle> {
    const pagina = await this.db.queryOne<PaginaDetalle>(
      `SELECT TOP 1
        p.pagina_id,
        p.proyecto_id,
        p.pagina_padre_id,
        p.titulo,
        p.slug,
        p.posicion,
        p.contenido_md,
        p.creado_por,
        p.editado_por,
        p.creado_en,
        p.actualizado_en
      FROM documentos.Paginas p
      WHERE p.pagina_id = @pagina_id`,
      { pagina_id: paginaId },
    );

    if (!pagina) {
      throw new NotFoundException('Página no encontrada');
    }

    await this.validarAccesoProyecto(pagina.proyecto_id, usuarioId);
    return pagina;
  }

  async crearPagina(dto: CrearPaginaDto, usuarioId: string): Promise<PaginaDetalle> {
    await this.validarAccesoProyecto(dto.proyecto_id, usuarioId);

    const posicionActual =
      (await this.db.queryOne<{ max_posicion: number | null }>(
        `SELECT MAX(posicion) AS max_posicion
        FROM documentos.Paginas
        WHERE proyecto_id = @proyecto_id
          AND (
            (pagina_padre_id IS NULL AND @pagina_padre_id IS NULL)
            OR pagina_padre_id = @pagina_padre_id
          )`,
        {
          proyecto_id: dto.proyecto_id,
          pagina_padre_id: dto.pagina_padre_id ?? null,
        },
      ))?.max_posicion ?? -1;

    const pagina = await this.db.queryOne<PaginaDetalle>(
      `INSERT INTO documentos.Paginas (
        proyecto_id,
        pagina_padre_id,
        titulo,
        slug,
        contenido_md,
        creado_por,
        editado_por,
        posicion
      )
      OUTPUT
        INSERTED.pagina_id,
        INSERTED.proyecto_id,
        INSERTED.pagina_padre_id,
        INSERTED.titulo,
        INSERTED.slug,
        INSERTED.posicion,
        INSERTED.contenido_md,
        INSERTED.creado_por,
        INSERTED.editado_por,
        INSERTED.creado_en,
        INSERTED.actualizado_en
      VALUES (
        @proyecto_id,
        @pagina_padre_id,
        @titulo,
        @slug,
        @contenido_md,
        @creado_por,
        @editado_por,
        @posicion
      )`,
      {
        proyecto_id: dto.proyecto_id,
        pagina_padre_id: dto.pagina_padre_id ?? null,
        titulo: dto.titulo,
        slug: dto.slug,
        contenido_md: dto.contenido_md ?? null,
        creado_por: usuarioId,
        editado_por: usuarioId,
        posicion: posicionActual + 1,
      },
    );

    if (!pagina) {
      throw new NotFoundException('No se pudo crear la página');
    }

    return pagina;
  }

  async actualizarPagina(
    paginaId: string,
    dto: ActualizarPaginaDto,
    usuarioId: string,
  ): Promise<PaginaDetalle> {
    const actual = await this.obtenerPaginaPorId(paginaId, usuarioId);

    const pagina = await this.db.queryOne<PaginaDetalle>(
      `UPDATE documentos.Paginas
      SET
        titulo = @titulo,
        slug = @slug,
        contenido_md = @contenido_md,
        editado_por = @editado_por,
        actualizado_en = SYSUTCDATETIME()
      OUTPUT
        INSERTED.pagina_id,
        INSERTED.proyecto_id,
        INSERTED.pagina_padre_id,
        INSERTED.titulo,
        INSERTED.slug,
        INSERTED.posicion,
        INSERTED.contenido_md,
        INSERTED.creado_por,
        INSERTED.editado_por,
        INSERTED.creado_en,
        INSERTED.actualizado_en
      WHERE pagina_id = @pagina_id`,
      {
        pagina_id: paginaId,
        titulo: dto.titulo ?? actual.titulo,
        slug: dto.slug ?? actual.slug,
        contenido_md: dto.contenido_md ?? actual.contenido_md,
        editado_por: usuarioId,
      },
    );

    if (!pagina) {
      throw new NotFoundException('Página no encontrada');
    }

    return pagina;
  }

  async vincularPaginaConTarea(
    paginaId: string,
    tareaId: string,
    usuarioId: string,
  ): Promise<{ mensaje: string }> {
    const pagina = await this.obtenerPaginaPorId(paginaId, usuarioId);

    const tarea = await this.db.queryOne<{ tarea_id: string; proyecto_id: string }>(
      `SELECT TOP 1 tarea_id, proyecto_id
      FROM tablero.Tareas
      WHERE tarea_id = @tarea_id`,
      { tarea_id: tareaId },
    );

    if (!tarea) {
      throw new NotFoundException('Tarea no encontrada');
    }

    if (tarea.proyecto_id !== pagina.proyecto_id) {
      throw new ForbiddenException('La tarea y la página deben pertenecer al mismo proyecto');
    }

    const yaExiste = await this.db.queryOne<{ existe: number }>(
      `SELECT TOP 1 1 AS existe
      FROM documentos.VinculosPaginaTarea
      WHERE pagina_id = @pagina_id
        AND tarea_id = @tarea_id`,
      {
        pagina_id: paginaId,
        tarea_id: tareaId,
      },
    );

    if (!yaExiste) {
      await this.db.query(
        `INSERT INTO documentos.VinculosPaginaTarea (pagina_id, tarea_id)
        VALUES (@pagina_id, @tarea_id)`,
        {
          pagina_id: paginaId,
          tarea_id: tareaId,
        },
      );
    }

    return { mensaje: 'Vínculo página-tarea registrado correctamente' };
  }
}
