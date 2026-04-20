import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { ActualizarTareaDto } from './dto/actualizar-tarea.dto';
import { CrearEpicaDto } from './dto/crear-epica.dto';
import { CrearTareaDto } from './dto/crear-tarea.dto';

export interface ProyectoResumen {
  proyecto_id: string;
  equipo_id: string;
  nombre: string;
  slug: string;
  descripcion: string | null;
  estado: 'activo' | 'archivado' | 'pausado';
  rol: 'propietario' | 'lider' | 'miembro' | 'espectador';
  actualizado_en: string;
}

export interface ColumnaTablero {
  columna_id: string;
  proyecto_id: string;
  nombre: string;
  posicion: number;
  color: string | null;
  es_estado_final: boolean;
}

export interface TareaTablero {
  tarea_id: string;
  proyecto_id: string;
  epica_id: string | null;
  tarea_padre_id: string | null;
  columna_id: string;
  titulo: string;
  descripcion: string | null;
  tipo: 'tarea' | 'subtarea' | 'error';
  prioridad: 'critica' | 'alta' | 'media' | 'baja';
  posicion: number;
  responsable_id: string | null;
  creado_por: string;
  fecha_limite: string | null;
  creado_en: string;
  actualizado_en: string;
  completado_en: string | null;
}

export interface EpicaResumen {
  epica_id: string;
  titulo: string;
  estado: string;
}

export interface MiembroProyectoResumen {
  usuario_id: string;
  nombre_visible: string;
  correo: string;
  rol: string;
}

@Injectable()
export class TableroService {
  constructor(private readonly db: DatabaseService) {}

  private async actualizarPosicionesColumna(columnaId: string, tareasIds: string[]): Promise<void> {
    if (!tareasIds.length) {
      return;
    }

    const whenClauses: string[] = [];
    const inClauses: string[] = [];
    const params: Record<string, unknown> = {};

    tareasIds.forEach((tareaId, index) => {
      const key = `tarea_${index}`;
      params[key] = tareaId;
      whenClauses.push(`WHEN @${key} THEN ${index}`);
      inClauses.push(`@${key}`);
    });

    await this.db.query(
      `UPDATE tablero.Tareas
      SET posicion = CASE tarea_id
        ${whenClauses.join('\n        ')}
        ELSE posicion
      END,
      actualizado_en = SYSUTCDATETIME()
      WHERE columna_id = @columna_id
        AND tarea_id IN (${inClauses.join(', ')})`,
      {
        columna_id: columnaId,
        ...params,
      },
    );
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

  obtenerProyectosPorUsuario(usuarioId: string): Promise<ProyectoResumen[]> {
    return this.db.query<ProyectoResumen>(
      `SELECT
        p.proyecto_id,
        p.equipo_id,
        p.nombre,
        p.slug,
        p.descripcion,
        p.estado,
        mp.rol,
        p.actualizado_en
      FROM nucleo.MiembrosProyecto mp
      INNER JOIN nucleo.Proyectos p ON p.proyecto_id = mp.proyecto_id
      WHERE mp.usuario_id = @usuario_id
      ORDER BY p.actualizado_en DESC`,
      { usuario_id: usuarioId },
    );
  }

  obtenerColumnasPorProyecto(
    proyectoId: string,
    usuarioId: string,
  ): Promise<ColumnaTablero[]> {
    return this.db.query<ColumnaTablero>(
      `SELECT
        c.columna_id,
        c.proyecto_id,
        c.nombre,
        c.posicion,
        c.color,
        c.es_estado_final
      FROM tablero.Columnas c
      WHERE c.proyecto_id = @proyecto_id
        AND EXISTS (
          SELECT 1
          FROM nucleo.MiembrosProyecto mp
          WHERE mp.proyecto_id = c.proyecto_id
            AND mp.usuario_id = @usuario_id
        )
      ORDER BY c.posicion ASC`,
      {
        proyecto_id: proyectoId,
        usuario_id: usuarioId,
      },
    );
  }

  obtenerTareasPorProyecto(proyectoId: string, usuarioId: string): Promise<TareaTablero[]> {
    return this.db.query<TareaTablero>(
      `SELECT
        t.tarea_id,
        t.proyecto_id,
        t.epica_id,
        t.tarea_padre_id,
        t.columna_id,
        t.titulo,
        t.descripcion,
        t.tipo,
        t.prioridad,
        t.posicion,
        t.responsable_id,
        t.creado_por,
        t.fecha_limite,
        t.creado_en,
        t.actualizado_en,
        t.completado_en
      FROM tablero.Tareas t
      WHERE t.proyecto_id = @proyecto_id
        AND EXISTS (
          SELECT 1
          FROM nucleo.MiembrosProyecto mp
          WHERE mp.proyecto_id = t.proyecto_id
            AND mp.usuario_id = @usuario_id
        )
      ORDER BY t.columna_id ASC, t.posicion ASC`,
      {
        proyecto_id: proyectoId,
        usuario_id: usuarioId,
      },
    );
  }

  obtenerEpicasPorProyecto(proyectoId: string, usuarioId: string): Promise<EpicaResumen[]> {
    return this.db.query<EpicaResumen>(
      `SELECT
        e.epica_id,
        e.titulo,
        e.estado
      FROM tablero.Epicas e
      WHERE e.proyecto_id = @proyecto_id
        AND EXISTS (
          SELECT 1
          FROM nucleo.MiembrosProyecto mp
          WHERE mp.proyecto_id = e.proyecto_id
            AND mp.usuario_id = @usuario_id
        )
      ORDER BY e.titulo ASC`,
      { proyecto_id: proyectoId, usuario_id: usuarioId },
    );
  }

  async crearEpica(
    proyectoId: string,
    dto: CrearEpicaDto,
    usuarioId: string,
  ): Promise<EpicaResumen> {
    await this.validarAccesoProyecto(proyectoId, usuarioId);

    const titulo = dto.titulo.trim();
    if (!titulo) {
      throw new BadRequestException('El título de la épica es obligatorio');
    }

    const estado = dto.estado ?? 'abierta';
    const descripcion =
      dto.descripcion !== undefined && dto.descripcion !== null
        ? dto.descripcion.trim() || null
        : null;

    const creada = await this.db.queryOne<EpicaResumen>(
      `INSERT INTO tablero.Epicas (
        proyecto_id,
        titulo,
        descripcion,
        estado,
        creado_por
      )
      OUTPUT
        INSERTED.epica_id,
        INSERTED.titulo,
        INSERTED.estado
      VALUES (
        @proyecto_id,
        @titulo,
        @descripcion,
        @estado,
        @creado_por
      )`,
      {
        proyecto_id: proyectoId,
        titulo,
        descripcion,
        estado,
        creado_por: usuarioId,
      },
    );

    if (!creada) {
      throw new NotFoundException('No se pudo crear la épica');
    }

    return creada;
  }

  obtenerMiembrosProyecto(proyectoId: string, usuarioId: string): Promise<MiembroProyectoResumen[]> {
    return this.db.query<MiembroProyectoResumen>(
      `SELECT
        u.usuario_id,
        u.nombre_visible,
        u.correo,
        mp.rol
      FROM nucleo.MiembrosProyecto mp
      INNER JOIN nucleo.Usuarios u ON u.usuario_id = mp.usuario_id
      WHERE mp.proyecto_id = @proyecto_id
        AND EXISTS (
          SELECT 1
          FROM nucleo.MiembrosProyecto mp2
          WHERE mp2.proyecto_id = @proyecto_id
            AND mp2.usuario_id = @actor_id
        )
      ORDER BY u.nombre_visible ASC`,
      { proyecto_id: proyectoId, actor_id: usuarioId },
    );
  }

  async crearTarea(dto: CrearTareaDto, usuarioId: string): Promise<TareaTablero> {
    await this.validarAccesoProyecto(dto.proyecto_id, usuarioId);

    const columna = await this.db.queryOne<{ columna_id: string }>(
      `SELECT TOP 1 columna_id
      FROM tablero.Columnas
      WHERE columna_id = @columna_id
        AND proyecto_id = @proyecto_id`,
      {
        columna_id: dto.columna_id,
        proyecto_id: dto.proyecto_id,
      },
    );
    if (!columna) {
      throw new NotFoundException('La columna no existe para ese proyecto');
    }

    const posicionActual =
      (await this.db.queryOne<{ max_posicion: number | null }>(
        `SELECT MAX(posicion) AS max_posicion
        FROM tablero.Tareas
        WHERE columna_id = @columna_id`,
        { columna_id: dto.columna_id },
      ))?.max_posicion ?? -1;

    const posicion = posicionActual + 1;

    const tareaCreada = await this.db.queryOne<TareaTablero>(
      `INSERT INTO tablero.Tareas (
        proyecto_id,
        epica_id,
        tarea_padre_id,
        columna_id,
        titulo,
        descripcion,
        tipo,
        prioridad,
        posicion,
        responsable_id,
        creado_por,
        fecha_limite
      )
      OUTPUT
        INSERTED.tarea_id,
        INSERTED.proyecto_id,
        INSERTED.epica_id,
        INSERTED.tarea_padre_id,
        INSERTED.columna_id,
        INSERTED.titulo,
        INSERTED.descripcion,
        INSERTED.tipo,
        INSERTED.prioridad,
        INSERTED.posicion,
        INSERTED.responsable_id,
        INSERTED.creado_por,
        INSERTED.fecha_limite,
        INSERTED.creado_en,
        INSERTED.actualizado_en,
        INSERTED.completado_en
      VALUES (
        @proyecto_id,
        @epica_id,
        @tarea_padre_id,
        @columna_id,
        @titulo,
        @descripcion,
        @tipo,
        @prioridad,
        @posicion,
        @responsable_id,
        @creado_por,
        @fecha_limite
      )`,
      {
        proyecto_id: dto.proyecto_id,
        epica_id: dto.epica_id ?? null,
        tarea_padre_id: dto.tarea_padre_id ?? null,
        columna_id: dto.columna_id,
        titulo: dto.titulo,
        descripcion: dto.descripcion ?? null,
        tipo: dto.tipo ?? 'tarea',
        prioridad: dto.prioridad ?? 'media',
        posicion,
        responsable_id: dto.responsable_id ?? null,
        creado_por: usuarioId,
        fecha_limite: dto.fecha_limite ?? null,
      },
    );

    if (!tareaCreada) {
      throw new NotFoundException('No se pudo crear la tarea');
    }

    return tareaCreada;
  }

  async moverTarea(
    tareaId: string,
    nuevaColumnaId: string,
    usuarioId: string,
  ): Promise<{ mensaje: string }> {
    const tarea = await this.db.queryOne<{ proyecto_id: string }>(
      `SELECT TOP 1 proyecto_id
      FROM tablero.Tareas
      WHERE tarea_id = @tarea_id`,
      { tarea_id: tareaId },
    );

    if (!tarea) {
      throw new NotFoundException('Tarea no encontrada');
    }

    await this.validarAccesoProyecto(tarea.proyecto_id, usuarioId);

    await this.db.execute('tablero.pa_MoverTarea', {
      tarea_id: tareaId,
      nueva_columna: nuevaColumnaId,
      actor_id: usuarioId,
    });

    return { mensaje: 'Tarea movida correctamente' };
  }

  async reordenarTarea(
    tareaId: string,
    columnaDestinoId: string,
    posicionDestino: number,
    usuarioId: string,
  ): Promise<{ mensaje: string }> {
    const tarea = await this.db.queryOne<{ proyecto_id: string; columna_id: string }>(
      `SELECT TOP 1 proyecto_id, columna_id
      FROM tablero.Tareas
      WHERE tarea_id = @tarea_id`,
      { tarea_id: tareaId },
    );
    if (!tarea) {
      throw new NotFoundException('Tarea no encontrada');
    }

    await this.validarAccesoProyecto(tarea.proyecto_id, usuarioId);

    const columnaDestino = await this.db.queryOne<{ columna_id: string }>(
      `SELECT TOP 1 columna_id
      FROM tablero.Columnas
      WHERE columna_id = @columna_id
        AND proyecto_id = @proyecto_id`,
      {
        columna_id: columnaDestinoId,
        proyecto_id: tarea.proyecto_id,
      },
    );
    if (!columnaDestino) {
      throw new NotFoundException('La columna destino no existe para el proyecto');
    }

    const esMismaColumna = tarea.columna_id === columnaDestinoId;
    const tareasOrigen = await this.db.query<{ tarea_id: string; posicion: number }>(
      `SELECT tarea_id, posicion
      FROM tablero.Tareas
      WHERE columna_id = @columna_id
      ORDER BY posicion ASC, tarea_id ASC`,
      { columna_id: tarea.columna_id },
    );
    const tareasDestino = esMismaColumna
      ? tareasOrigen
      : await this.db.query<{ tarea_id: string; posicion: number }>(
          `SELECT tarea_id, posicion
          FROM tablero.Tareas
          WHERE columna_id = @columna_id
          ORDER BY posicion ASC, tarea_id ASC`,
          { columna_id: columnaDestinoId },
        );

    const origenSinTarea = tareasOrigen
      .map((item) => item.tarea_id)
      .filter((id) => id !== tareaId);
    const destinoSinTarea = tareasDestino
      .map((item) => item.tarea_id)
      .filter((id) => id !== tareaId);

    const indiceNormalizado = Math.max(0, Math.min(posicionDestino, destinoSinTarea.length));
    const destinoReordenado = [...destinoSinTarea];
    destinoReordenado.splice(indiceNormalizado, 0, tareaId);

    if (!esMismaColumna) {
      await this.db.query(
        `UPDATE tablero.Tareas
        SET columna_id = @columna_id,
            actualizado_en = SYSUTCDATETIME(),
            completado_en = CASE
              WHEN (SELECT es_estado_final FROM tablero.Columnas WHERE columna_id = @columna_id) = 1
              THEN SYSUTCDATETIME()
              ELSE NULL
            END
        WHERE tarea_id = @tarea_id`,
        { tarea_id: tareaId, columna_id: columnaDestinoId },
      );
      await this.actualizarPosicionesColumna(tarea.columna_id, origenSinTarea);
    }

    await this.actualizarPosicionesColumna(columnaDestinoId, destinoReordenado);

    return { mensaje: 'Tarea reordenada correctamente' };
  }

  private dtoTieneAlgunCampo(dto: ActualizarTareaDto): boolean {
    return (
      dto.titulo !== undefined ||
      dto.descripcion !== undefined ||
      dto.tipo !== undefined ||
      dto.prioridad !== undefined ||
      dto.fecha_limite !== undefined ||
      dto.epica_id !== undefined ||
      dto.tarea_padre_id !== undefined ||
      dto.responsable_id !== undefined ||
      dto.columna_id !== undefined
    );
  }

  private normalizarUuidOpcional(valor: string | undefined): string | null | undefined {
    if (valor === undefined) {
      return undefined;
    }
    const t = valor.trim();
    return t === '' ? null : t;
  }

  async actualizarTarea(
    tareaId: string,
    dto: ActualizarTareaDto,
    usuarioId: string,
  ): Promise<TareaTablero> {
    if (!this.dtoTieneAlgunCampo(dto)) {
      throw new BadRequestException('Debes enviar al menos un campo para actualizar');
    }

    const curr = await this.db.queryOne<TareaTablero>(
      `SELECT
        t.tarea_id,
        t.proyecto_id,
        t.epica_id,
        t.tarea_padre_id,
        t.columna_id,
        t.titulo,
        t.descripcion,
        t.tipo,
        t.prioridad,
        t.posicion,
        t.responsable_id,
        t.creado_por,
        t.fecha_limite,
        t.creado_en,
        t.actualizado_en,
        t.completado_en
      FROM tablero.Tareas t
      WHERE t.tarea_id = @tarea_id`,
      { tarea_id: tareaId },
    );

    if (!curr) {
      throw new NotFoundException('Tarea no encontrada');
    }

    await this.validarAccesoProyecto(curr.proyecto_id, usuarioId);

    if (dto.columna_id !== undefined) {
      const nuevaCol = dto.columna_id.trim();
      if (nuevaCol !== '' && nuevaCol !== curr.columna_id) {
        const destinoCount =
          (await this.db.queryOne<{ c: number }>(
            `SELECT COUNT(*) AS c
            FROM tablero.Tareas
            WHERE columna_id = @columna_id
              AND tarea_id <> @tarea_id`,
            { columna_id: nuevaCol, tarea_id: tareaId },
          ))?.c ?? 0;
        await this.reordenarTarea(tareaId, nuevaCol, destinoCount, usuarioId);
      }
    }

    const titulo = dto.titulo !== undefined ? dto.titulo.trim() : curr.titulo;
    if (!titulo) {
      throw new BadRequestException('El titulo no puede quedar vacio');
    }

    const descripcion =
      dto.descripcion !== undefined ? (dto.descripcion.trim() || null) : curr.descripcion;
    const tipo = dto.tipo ?? curr.tipo;
    const prioridad = dto.prioridad ?? curr.prioridad;
    const fecha_limite =
      dto.fecha_limite !== undefined
        ? dto.fecha_limite.trim() === ''
          ? null
          : dto.fecha_limite
        : curr.fecha_limite;

    const epicaId =
      dto.epica_id !== undefined ? this.normalizarUuidOpcional(dto.epica_id) : curr.epica_id;
    const tareaPadreId =
      dto.tarea_padre_id !== undefined
        ? this.normalizarUuidOpcional(dto.tarea_padre_id)
        : curr.tarea_padre_id;
    const responsableId =
      dto.responsable_id !== undefined
        ? this.normalizarUuidOpcional(dto.responsable_id)
        : curr.responsable_id;

    if (tareaPadreId === tareaId) {
      throw new BadRequestException('La tarea no puede ser padre de si misma');
    }

    const actualizada = await this.db.queryOne<TareaTablero>(
      `UPDATE tablero.Tareas
      SET titulo = @titulo,
          descripcion = @descripcion,
          tipo = @tipo,
          prioridad = @prioridad,
          fecha_limite = @fecha_limite,
          epica_id = @epica_id,
          tarea_padre_id = @tarea_padre_id,
          responsable_id = @responsable_id,
          actualizado_en = SYSUTCDATETIME()
      OUTPUT
        INSERTED.tarea_id,
        INSERTED.proyecto_id,
        INSERTED.epica_id,
        INSERTED.tarea_padre_id,
        INSERTED.columna_id,
        INSERTED.titulo,
        INSERTED.descripcion,
        INSERTED.tipo,
        INSERTED.prioridad,
        INSERTED.posicion,
        INSERTED.responsable_id,
        INSERTED.creado_por,
        INSERTED.fecha_limite,
        INSERTED.creado_en,
        INSERTED.actualizado_en,
        INSERTED.completado_en
      WHERE tarea_id = @tarea_id`,
      {
        tarea_id: tareaId,
        titulo,
        descripcion,
        tipo,
        prioridad,
        fecha_limite: fecha_limite ?? null,
        epica_id: epicaId ?? null,
        tarea_padre_id: tareaPadreId ?? null,
        responsable_id: responsableId ?? null,
      },
    );

    if (!actualizada) {
      throw new NotFoundException('No se pudo actualizar la tarea');
    }

    return actualizada;
  }

  async eliminarTarea(tareaId: string, usuarioId: string): Promise<{ mensaje: string }> {
    const tarea = await this.db.queryOne<{ proyecto_id: string; columna_id: string }>(
      `SELECT TOP 1 proyecto_id, columna_id
      FROM tablero.Tareas
      WHERE tarea_id = @tarea_id`,
      { tarea_id: tareaId },
    );

    if (!tarea) {
      throw new NotFoundException('Tarea no encontrada');
    }

    await this.validarAccesoProyecto(tarea.proyecto_id, usuarioId);

    await this.db.query(
      `UPDATE tablero.Tareas
      SET tarea_padre_id = NULL
      WHERE tarea_padre_id = @tarea_id`,
      { tarea_id: tareaId },
    );

    const restantesIds = (
      await this.db.query<{ tarea_id: string }>(
        `SELECT tarea_id
        FROM tablero.Tareas
        WHERE columna_id = @columna_id
          AND tarea_id <> @tarea_id
        ORDER BY posicion ASC, tarea_id ASC`,
        { columna_id: tarea.columna_id, tarea_id: tareaId },
      )
    ).map((row) => row.tarea_id);

    const eliminada = await this.db.queryOne<{ tarea_id: string }>(
      `DELETE FROM tablero.Tareas
      OUTPUT DELETED.tarea_id
      WHERE tarea_id = @tarea_id`,
      { tarea_id: tareaId },
    );

    if (!eliminada) {
      throw new NotFoundException('No se pudo eliminar la tarea');
    }

    await this.actualizarPosicionesColumna(tarea.columna_id, restantesIds);

    return { mensaje: 'Tarea eliminada correctamente' };
  }
}
