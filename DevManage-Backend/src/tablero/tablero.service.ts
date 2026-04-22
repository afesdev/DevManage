import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { ActualizarEtiquetaDto } from './dto/actualizar-etiqueta.dto';
import { ActualizarTareaDto } from './dto/actualizar-tarea.dto';
import { CrearEpicaDto } from './dto/crear-epica.dto';
import { CrearEtiquetaDto } from './dto/crear-etiqueta.dto';
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

export interface EtiquetaResumen {
  etiqueta_id: string;
  proyecto_id: string;
  nombre: string;
  color: string;
}

export interface TareaEtiquetaResumen {
  tarea_id: string;
  etiqueta_id: string;
}

export interface ComentarioTareaResumen {
  comentario_id: string;
  tarea_id: string;
  autor_id: string;
  autor_nombre: string;
  contenido: string;
  creado_en: string;
  editado_en: string | null;
}

export interface TareaActividadResumen {
  actividad_id: string;
  tarea_id: string;
  actor_id: string;
  actor_nombre: string;
  tipo_accion: string;
  valor_anterior: string | null;
  valor_nuevo: string | null;
  ocurrido_en: string;
}

@Injectable()
export class TableroService {
  constructor(private readonly db: DatabaseService) {}

  private recortarActividad(valor: string | null | undefined): string | null {
    if (valor === undefined || valor === null) return null;
    const limpio = valor.trim();
    if (!limpio) return null;
    return limpio.slice(0, 500);
  }

  private async registrarActividad(args: {
    tareaId: string;
    actorId: string;
    tipoAccion: string;
    valorAnterior?: string | null;
    valorNuevo?: string | null;
  }): Promise<void> {
    await this.db.query(
      `INSERT INTO tablero.Actividad (tarea_id, actor_id, tipo_accion, valor_anterior, valor_nuevo)
      VALUES (@tarea_id, @actor_id, @tipo_accion, @valor_anterior, @valor_nuevo)`,
      {
        tarea_id: args.tareaId,
        actor_id: args.actorId,
        tipo_accion: args.tipoAccion,
        valor_anterior: this.recortarActividad(args.valorAnterior),
        valor_nuevo: this.recortarActividad(args.valorNuevo),
      },
    );
  }

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

  async obtenerEtiquetasPorProyecto(
    proyectoId: string,
    usuarioId: string,
  ): Promise<EtiquetaResumen[]> {
    await this.validarAccesoProyecto(proyectoId, usuarioId);
    return this.db.query<EtiquetaResumen>(
      `SELECT
        etiqueta_id,
        proyecto_id,
        nombre,
        color
      FROM tablero.Etiquetas
      WHERE proyecto_id = @proyecto_id
      ORDER BY nombre ASC`,
      { proyecto_id: proyectoId },
    );
  }

  async crearEtiqueta(
    proyectoId: string,
    dto: CrearEtiquetaDto,
    usuarioId: string,
  ): Promise<EtiquetaResumen> {
    await this.validarAccesoProyecto(proyectoId, usuarioId);
    const nombre = dto.nombre.trim();
    if (!nombre) {
      throw new BadRequestException('El nombre de la etiqueta es obligatorio');
    }
    const etiqueta = await this.db.queryOne<EtiquetaResumen>(
      `INSERT INTO tablero.Etiquetas (
        proyecto_id,
        nombre,
        color
      )
      OUTPUT
        INSERTED.etiqueta_id,
        INSERTED.proyecto_id,
        INSERTED.nombre,
        INSERTED.color
      VALUES (
        @proyecto_id,
        @nombre,
        @color
      )`,
      {
        proyecto_id: proyectoId,
        nombre,
        color: dto.color ?? '#888780',
      },
    );
    if (!etiqueta) {
      throw new NotFoundException('No se pudo crear la etiqueta');
    }
    return etiqueta;
  }

  async obtenerEtiquetasPorTarea(
    proyectoId: string,
    usuarioId: string,
  ): Promise<TareaEtiquetaResumen[]> {
    await this.validarAccesoProyecto(proyectoId, usuarioId);
    return this.db.query<TareaEtiquetaResumen>(
      `SELECT te.tarea_id, te.etiqueta_id
      FROM tablero.TareasEtiquetas te
      INNER JOIN tablero.Tareas t ON t.tarea_id = te.tarea_id
      WHERE t.proyecto_id = @proyecto_id`,
      { proyecto_id: proyectoId },
    );
  }

  async actualizarEtiqueta(
    proyectoId: string,
    etiquetaId: string,
    dto: ActualizarEtiquetaDto,
    usuarioId: string,
  ): Promise<EtiquetaResumen> {
    await this.validarAccesoProyecto(proyectoId, usuarioId);
    const actual = await this.db.queryOne<EtiquetaResumen>(
      `SELECT TOP 1 etiqueta_id, proyecto_id, nombre, color
      FROM tablero.Etiquetas
      WHERE etiqueta_id = @etiqueta_id
        AND proyecto_id = @proyecto_id`,
      { etiqueta_id: etiquetaId, proyecto_id: proyectoId },
    );
    if (!actual) throw new NotFoundException('Etiqueta no encontrada');

    const nombre = dto.nombre !== undefined ? dto.nombre.trim() : actual.nombre;
    const color = dto.color ?? actual.color;
    if (!nombre) throw new BadRequestException('El nombre de la etiqueta es obligatorio');

    const actualizada = await this.db.queryOne<EtiquetaResumen>(
      `UPDATE tablero.Etiquetas
      SET nombre = @nombre,
          color = @color
      OUTPUT INSERTED.etiqueta_id, INSERTED.proyecto_id, INSERTED.nombre, INSERTED.color
      WHERE etiqueta_id = @etiqueta_id
        AND proyecto_id = @proyecto_id`,
      {
        etiqueta_id: etiquetaId,
        proyecto_id: proyectoId,
        nombre,
        color,
      },
    );
    if (!actualizada) throw new NotFoundException('No se pudo actualizar la etiqueta');
    return actualizada;
  }

  async eliminarEtiqueta(
    proyectoId: string,
    etiquetaId: string,
    usuarioId: string,
  ): Promise<{ mensaje: string }> {
    await this.validarAccesoProyecto(proyectoId, usuarioId);

    const etiqueta = await this.db.queryOne<{ etiqueta_id: string }>(
      `SELECT TOP 1 etiqueta_id
      FROM tablero.Etiquetas
      WHERE etiqueta_id = @etiqueta_id
        AND proyecto_id = @proyecto_id`,
      { etiqueta_id: etiquetaId, proyecto_id: proyectoId },
    );
    if (!etiqueta) throw new NotFoundException('Etiqueta no encontrada');

    await this.db.query(
      `DELETE FROM tablero.TareasEtiquetas
      WHERE etiqueta_id = @etiqueta_id`,
      { etiqueta_id: etiquetaId },
    );
    await this.db.query(
      `DELETE FROM tablero.Etiquetas
      WHERE etiqueta_id = @etiqueta_id
        AND proyecto_id = @proyecto_id`,
      { etiqueta_id: etiquetaId, proyecto_id: proyectoId },
    );
    return { mensaje: 'Etiqueta eliminada correctamente' };
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

    await this.registrarActividad({
      tareaId: tareaCreada.tarea_id,
      actorId: usuarioId,
      tipoAccion: 'tarea_creada',
      valorNuevo: tareaCreada.titulo,
    });

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
      const colOrigen = await this.db.queryOne<{ nombre: string }>(
        `SELECT TOP 1 nombre FROM tablero.Columnas WHERE columna_id = @columna_id`,
        { columna_id: tarea.columna_id },
      );
      const colDestino = await this.db.queryOne<{ nombre: string }>(
        `SELECT TOP 1 nombre FROM tablero.Columnas WHERE columna_id = @columna_id`,
        { columna_id: columnaDestinoId },
      );
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
      await this.registrarActividad({
        tareaId,
        actorId: usuarioId,
        tipoAccion: 'columna_cambiada',
        valorAnterior: colOrigen?.nombre ?? null,
        valorNuevo: colDestino?.nombre ?? null,
      });
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

    if (curr.titulo !== actualizada.titulo) {
      await this.registrarActividad({
        tareaId,
        actorId: usuarioId,
        tipoAccion: 'titulo_cambiado',
        valorAnterior: curr.titulo,
        valorNuevo: actualizada.titulo,
      });
    }
    if ((curr.descripcion ?? '') !== (actualizada.descripcion ?? '')) {
      await this.registrarActividad({
        tareaId,
        actorId: usuarioId,
        tipoAccion: 'descripcion_cambiada',
        valorAnterior: curr.descripcion,
        valorNuevo: actualizada.descripcion,
      });
    }
    if (curr.prioridad !== actualizada.prioridad) {
      await this.registrarActividad({
        tareaId,
        actorId: usuarioId,
        tipoAccion: 'prioridad_cambiada',
        valorAnterior: curr.prioridad,
        valorNuevo: actualizada.prioridad,
      });
    }
    if ((curr.responsable_id ?? '') !== (actualizada.responsable_id ?? '')) {
      await this.registrarActividad({
        tareaId,
        actorId: usuarioId,
        tipoAccion: 'responsable_cambiado',
        valorAnterior: curr.responsable_id,
        valorNuevo: actualizada.responsable_id,
      });
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

    await this.registrarActividad({
      tareaId,
      actorId: usuarioId,
      tipoAccion: 'tarea_eliminada',
      valorAnterior: tareaId,
    });

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

  async asignarEtiquetaATarea(
    tareaId: string,
    etiquetaId: string,
    usuarioId: string,
  ): Promise<{ mensaje: string }> {
    const tarea = await this.db.queryOne<{ proyecto_id: string }>(
      `SELECT TOP 1 proyecto_id FROM tablero.Tareas WHERE tarea_id = @tarea_id`,
      { tarea_id: tareaId },
    );
    if (!tarea) throw new NotFoundException('Tarea no encontrada');
    await this.validarAccesoProyecto(tarea.proyecto_id, usuarioId);

    const etiqueta = await this.db.queryOne<{ etiqueta_id: string }>(
      `SELECT TOP 1 etiqueta_id
      FROM tablero.Etiquetas
      WHERE etiqueta_id = @etiqueta_id
        AND proyecto_id = @proyecto_id`,
      { etiqueta_id: etiquetaId, proyecto_id: tarea.proyecto_id },
    );
    if (!etiqueta) {
      throw new BadRequestException('La etiqueta no pertenece al proyecto de la tarea');
    }

    await this.db.query(
      `IF NOT EXISTS (
        SELECT 1
        FROM tablero.TareasEtiquetas
        WHERE tarea_id = @tarea_id
          AND etiqueta_id = @etiqueta_id
      )
      BEGIN
        INSERT INTO tablero.TareasEtiquetas (tarea_id, etiqueta_id)
        VALUES (@tarea_id, @etiqueta_id)
      END`,
      { tarea_id: tareaId, etiqueta_id: etiquetaId },
    );

    const etiquetaNombre = await this.db.queryOne<{ nombre: string }>(
      `SELECT TOP 1 nombre FROM tablero.Etiquetas WHERE etiqueta_id = @etiqueta_id`,
      { etiqueta_id: etiquetaId },
    );
    await this.registrarActividad({
      tareaId,
      actorId: usuarioId,
      tipoAccion: 'etiqueta_agregada',
      valorNuevo: etiquetaNombre?.nombre ?? etiquetaId,
    });

    return { mensaje: 'Etiqueta asignada correctamente' };
  }

  async quitarEtiquetaDeTarea(
    tareaId: string,
    etiquetaId: string,
    usuarioId: string,
  ): Promise<{ mensaje: string }> {
    const tarea = await this.db.queryOne<{ proyecto_id: string }>(
      `SELECT TOP 1 proyecto_id FROM tablero.Tareas WHERE tarea_id = @tarea_id`,
      { tarea_id: tareaId },
    );
    if (!tarea) throw new NotFoundException('Tarea no encontrada');
    await this.validarAccesoProyecto(tarea.proyecto_id, usuarioId);

    const etiquetaNombre = await this.db.queryOne<{ nombre: string }>(
      `SELECT TOP 1 nombre FROM tablero.Etiquetas WHERE etiqueta_id = @etiqueta_id`,
      { etiqueta_id: etiquetaId },
    );
    await this.db.query(
      `DELETE FROM tablero.TareasEtiquetas
      WHERE tarea_id = @tarea_id
        AND etiqueta_id = @etiqueta_id`,
      { tarea_id: tareaId, etiqueta_id: etiquetaId },
    );
    await this.registrarActividad({
      tareaId,
      actorId: usuarioId,
      tipoAccion: 'etiqueta_removida',
      valorAnterior: etiquetaNombre?.nombre ?? etiquetaId,
    });

    return { mensaje: 'Etiqueta removida correctamente' };
  }

  async obtenerComentariosPorTarea(
    tareaId: string,
    usuarioId: string,
  ): Promise<ComentarioTareaResumen[]> {
    const tarea = await this.db.queryOne<{ proyecto_id: string }>(
      `SELECT TOP 1 proyecto_id FROM tablero.Tareas WHERE tarea_id = @tarea_id`,
      { tarea_id: tareaId },
    );
    if (!tarea) throw new NotFoundException('Tarea no encontrada');
    await this.validarAccesoProyecto(tarea.proyecto_id, usuarioId);

    return this.db.query<ComentarioTareaResumen>(
      `SELECT
        c.comentario_id,
        c.tarea_id,
        c.autor_id,
        COALESCE(u.nombre_visible, u.correo) AS autor_nombre,
        c.contenido,
        c.creado_en,
        c.editado_en
      FROM tablero.Comentarios c
      INNER JOIN nucleo.Usuarios u ON u.usuario_id = c.autor_id
      WHERE c.tarea_id = @tarea_id
      ORDER BY c.creado_en DESC`,
      { tarea_id: tareaId },
    );
  }

  async crearComentarioEnTarea(
    tareaId: string,
    contenidoRaw: string,
    usuarioId: string,
  ): Promise<ComentarioTareaResumen> {
    const tarea = await this.db.queryOne<{ proyecto_id: string }>(
      `SELECT TOP 1 proyecto_id FROM tablero.Tareas WHERE tarea_id = @tarea_id`,
      { tarea_id: tareaId },
    );
    if (!tarea) throw new NotFoundException('Tarea no encontrada');
    await this.validarAccesoProyecto(tarea.proyecto_id, usuarioId);

    const contenido = contenidoRaw.trim();
    if (!contenido) throw new BadRequestException('El comentario no puede estar vacio');

    const comentario = await this.db.queryOne<ComentarioTareaResumen>(
      `INSERT INTO tablero.Comentarios (tarea_id, autor_id, contenido)
      OUTPUT
        INSERTED.comentario_id,
        INSERTED.tarea_id,
        INSERTED.autor_id,
        CAST('' AS NVARCHAR(200)) AS autor_nombre,
        INSERTED.contenido,
        INSERTED.creado_en,
        INSERTED.editado_en
      VALUES (@tarea_id, @autor_id, @contenido)`,
      { tarea_id: tareaId, autor_id: usuarioId, contenido },
    );
    if (!comentario) throw new NotFoundException('No se pudo crear el comentario');

    await this.registrarActividad({
      tareaId,
      actorId: usuarioId,
      tipoAccion: 'comentario_agregado',
      valorNuevo: contenido,
    });

    const autor = await this.db.queryOne<{ autor_nombre: string }>(
      `SELECT COALESCE(nombre_visible, correo) AS autor_nombre
      FROM nucleo.Usuarios
      WHERE usuario_id = @usuario_id`,
      { usuario_id: usuarioId },
    );
    return { ...comentario, autor_nombre: autor?.autor_nombre ?? 'Usuario' };
  }

  async actualizarComentarioDeTarea(
    tareaId: string,
    comentarioId: string,
    contenidoRaw: string,
    usuarioId: string,
  ): Promise<ComentarioTareaResumen> {
    const comentarioActual = await this.db.queryOne<{
      tarea_id: string;
      autor_id: string;
      proyecto_id: string;
      contenido: string;
    }>(
      `SELECT TOP 1 c.tarea_id, c.autor_id, t.proyecto_id, c.contenido
      FROM tablero.Comentarios c
      INNER JOIN tablero.Tareas t ON t.tarea_id = c.tarea_id
      WHERE c.comentario_id = @comentario_id`,
      { comentario_id: comentarioId },
    );
    if (!comentarioActual || comentarioActual.tarea_id !== tareaId) {
      throw new NotFoundException('Comentario no encontrado');
    }
    await this.validarAccesoProyecto(comentarioActual.proyecto_id, usuarioId);
    if (comentarioActual.autor_id !== usuarioId) {
      throw new ForbiddenException('Solo el autor puede editar su comentario');
    }

    const contenido = contenidoRaw.trim();
    if (!contenido) throw new BadRequestException('El comentario no puede estar vacio');

    const actualizado = await this.db.queryOne<ComentarioTareaResumen>(
      `UPDATE tablero.Comentarios
      SET contenido = @contenido,
          editado_en = SYSUTCDATETIME()
      OUTPUT
        INSERTED.comentario_id,
        INSERTED.tarea_id,
        INSERTED.autor_id,
        CAST('' AS NVARCHAR(200)) AS autor_nombre,
        INSERTED.contenido,
        INSERTED.creado_en,
        INSERTED.editado_en
      WHERE comentario_id = @comentario_id
        AND tarea_id = @tarea_id`,
      { comentario_id: comentarioId, tarea_id: tareaId, contenido },
    );
    if (!actualizado) throw new NotFoundException('No se pudo actualizar el comentario');

    await this.registrarActividad({
      tareaId,
      actorId: usuarioId,
      tipoAccion: 'comentario_editado',
      valorAnterior: comentarioActual.contenido,
      valorNuevo: contenido,
    });

    const autor = await this.db.queryOne<{ autor_nombre: string }>(
      `SELECT COALESCE(nombre_visible, correo) AS autor_nombre
      FROM nucleo.Usuarios
      WHERE usuario_id = @usuario_id`,
      { usuario_id: usuarioId },
    );
    return { ...actualizado, autor_nombre: autor?.autor_nombre ?? 'Usuario' };
  }

  async eliminarComentarioDeTarea(
    tareaId: string,
    comentarioId: string,
    usuarioId: string,
  ): Promise<{ mensaje: string }> {
    const comentarioActual = await this.db.queryOne<{
      tarea_id: string;
      autor_id: string;
      proyecto_id: string;
      contenido: string;
    }>(
      `SELECT TOP 1 c.tarea_id, c.autor_id, t.proyecto_id, c.contenido
      FROM tablero.Comentarios c
      INNER JOIN tablero.Tareas t ON t.tarea_id = c.tarea_id
      WHERE c.comentario_id = @comentario_id`,
      { comentario_id: comentarioId },
    );
    if (!comentarioActual || comentarioActual.tarea_id !== tareaId) {
      throw new NotFoundException('Comentario no encontrado');
    }
    await this.validarAccesoProyecto(comentarioActual.proyecto_id, usuarioId);
    if (comentarioActual.autor_id !== usuarioId) {
      throw new ForbiddenException('Solo el autor puede eliminar su comentario');
    }

    await this.db.query(
      `DELETE FROM tablero.Comentarios
      WHERE comentario_id = @comentario_id
        AND tarea_id = @tarea_id`,
      { comentario_id: comentarioId, tarea_id: tareaId },
    );

    await this.registrarActividad({
      tareaId,
      actorId: usuarioId,
      tipoAccion: 'comentario_eliminado',
      valorAnterior: comentarioActual.contenido,
    });

    return { mensaje: 'Comentario eliminado correctamente' };
  }

  async obtenerActividadPorTarea(
    tareaId: string,
    usuarioId: string,
  ): Promise<TareaActividadResumen[]> {
    const tarea = await this.db.queryOne<{ proyecto_id: string }>(
      `SELECT TOP 1 proyecto_id FROM tablero.Tareas WHERE tarea_id = @tarea_id`,
      { tarea_id: tareaId },
    );
    if (!tarea) throw new NotFoundException('Tarea no encontrada');
    await this.validarAccesoProyecto(tarea.proyecto_id, usuarioId);

    return this.db.query<TareaActividadResumen>(
      `SELECT
        a.actividad_id,
        a.tarea_id,
        a.actor_id,
        COALESCE(u.nombre_visible, u.correo) AS actor_nombre,
        a.tipo_accion,
        a.valor_anterior,
        a.valor_nuevo,
        a.ocurrido_en
      FROM tablero.Actividad a
      INNER JOIN nucleo.Usuarios u ON u.usuario_id = a.actor_id
      WHERE a.tarea_id = @tarea_id
      ORDER BY a.ocurrido_en DESC`,
      { tarea_id: tareaId },
    );
  }
}
