import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { DatabaseService } from '../database/database.service';
import { ActualizarProyectoDto } from './dto/actualizar-proyecto.dto';
import { CrearProyectoDto } from './dto/crear-proyecto.dto';

export interface ProyectoCreado {
  proyecto_id: string;
  equipo_id: string;
  nombre: string;
  slug: string;
  descripcion: string | null;
  estado: 'activo' | 'archivado' | 'pausado';
  rol: 'propietario' | 'lider' | 'miembro' | 'espectador';
  actualizado_en: string;
}

@Injectable()
export class ProyectosService {
  constructor(private readonly db: DatabaseService) {}

  private async validarPermisoPropietario(
    proyectoId: string,
    usuarioId: string,
  ): Promise<{ equipo_id: string }> {
    const acceso = await this.db.queryOne<{ equipo_id: string; rol: string }>(
      `SELECT TOP 1 p.equipo_id, mp.rol
      FROM nucleo.Proyectos p
      INNER JOIN nucleo.MiembrosProyecto mp ON mp.proyecto_id = p.proyecto_id
      WHERE p.proyecto_id = @proyecto_id
        AND mp.usuario_id = @usuario_id`,
      {
        proyecto_id: proyectoId,
        usuario_id: usuarioId,
      },
    );

    if (!acceso) {
      throw new NotFoundException('Proyecto no encontrado o sin acceso');
    }
    if (acceso.rol !== 'propietario') {
      throw new ForbiddenException('Solo el propietario puede editar o eliminar el proyecto');
    }

    return { equipo_id: acceso.equipo_id };
  }

  private normalizarSlug(texto: string): string {
    return texto
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 70);
  }

  async crearProyecto(
    dto: CrearProyectoDto,
    usuarioId: string,
  ): Promise<ProyectoCreado> {
    const baseSlug = this.normalizarSlug(dto.nombre) || 'proyecto';
    const sufijo = randomUUID().slice(0, 8);

    let equipo = await this.db.queryOne<{ equipo_id: string }>(
      `SELECT TOP 1 me.equipo_id
      FROM nucleo.MiembrosEquipo me
      WHERE me.usuario_id = @usuario_id
      ORDER BY me.unido_en ASC`,
      { usuario_id: usuarioId },
    );

    if (!equipo) {
      const equipoNombre = `Equipo ${dto.nombre}`.slice(0, 100);
      const equipoSlug = `equipo-${baseSlug}-${sufijo}`.slice(0, 100);

      const equipoCreado = await this.db.queryOne<{ equipo_id: string }>(
        `INSERT INTO nucleo.Equipos (nombre, slug, creado_por)
        OUTPUT INSERTED.equipo_id
        VALUES (@nombre, @slug, @creado_por)`,
        {
          nombre: equipoNombre,
          slug: equipoSlug,
          creado_por: usuarioId,
        },
      );

      if (!equipoCreado) {
        throw new Error('No se pudo crear el equipo base');
      }

      await this.db.query(
        `INSERT INTO nucleo.MiembrosEquipo (equipo_id, usuario_id, rol)
        VALUES (@equipo_id, @usuario_id, 'propietario')`,
        {
          equipo_id: equipoCreado.equipo_id,
          usuario_id: usuarioId,
        },
      );

      equipo = equipoCreado;
    }

    const proyectoSlug = `${baseSlug}-${sufijo}`.slice(0, 100);

    const proyecto = await this.db.queryOne<{
      proyecto_id: string;
      equipo_id: string;
      nombre: string;
      slug: string;
      descripcion: string | null;
      estado: 'activo' | 'archivado' | 'pausado';
      actualizado_en: string;
    }>(
      `INSERT INTO nucleo.Proyectos (
        equipo_id,
        nombre,
        slug,
        descripcion,
        creado_por
      )
      OUTPUT
        INSERTED.proyecto_id,
        INSERTED.equipo_id,
        INSERTED.nombre,
        INSERTED.slug,
        INSERTED.descripcion,
        INSERTED.estado,
        INSERTED.actualizado_en
      VALUES (
        @equipo_id,
        @nombre,
        @slug,
        @descripcion,
        @creado_por
      )`,
      {
        equipo_id: equipo.equipo_id,
        nombre: dto.nombre,
        slug: proyectoSlug,
        descripcion: dto.descripcion ?? null,
        creado_por: usuarioId,
      },
    );

    if (!proyecto) {
      throw new Error('No se pudo crear el proyecto');
    }

    await this.db.query(
      `INSERT INTO nucleo.MiembrosProyecto (proyecto_id, usuario_id, rol)
      VALUES (@proyecto_id, @usuario_id, 'propietario')`,
      {
        proyecto_id: proyecto.proyecto_id,
        usuario_id: usuarioId,
      },
    );

    await this.db.query(
      `INSERT INTO tablero.Columnas (proyecto_id, nombre, posicion, color, es_estado_final)
      VALUES
        (@proyecto_id, 'Por hacer', 0, '#64748B', 0),
        (@proyecto_id, 'En progreso', 1, '#7C3AED', 0),
        (@proyecto_id, 'En revision', 2, '#F59E0B', 0),
        (@proyecto_id, 'Hecho', 3, '#16A34A', 1)`,
      { proyecto_id: proyecto.proyecto_id },
    );

    return {
      ...proyecto,
      rol: 'propietario',
    };
  }

  async actualizarProyecto(
    proyectoId: string,
    dto: ActualizarProyectoDto,
    usuarioId: string,
  ): Promise<ProyectoCreado> {
    await this.validarPermisoPropietario(proyectoId, usuarioId);

    const actual = await this.db.queryOne<{
      equipo_id: string;
      nombre: string;
      slug: string;
      descripcion: string | null;
    }>(
      `SELECT TOP 1 equipo_id, nombre, slug, descripcion
      FROM nucleo.Proyectos
      WHERE proyecto_id = @proyecto_id`,
      { proyecto_id: proyectoId },
    );
    if (!actual) {
      throw new NotFoundException('Proyecto no encontrado');
    }

    const nuevoNombre = dto.nombre?.trim() ? dto.nombre.trim() : actual.nombre;
    const nuevaDescripcion =
      dto.descripcion !== undefined ? dto.descripcion.trim() || null : actual.descripcion;

    const proyectoActualizado = await this.db.queryOne<ProyectoCreado>(
      `UPDATE nucleo.Proyectos
      SET nombre = @nombre,
          descripcion = @descripcion,
          actualizado_en = SYSUTCDATETIME()
      OUTPUT
        INSERTED.proyecto_id,
        INSERTED.equipo_id,
        INSERTED.nombre,
        INSERTED.slug,
        INSERTED.descripcion,
        INSERTED.estado,
        'propietario' AS rol,
        INSERTED.actualizado_en
      WHERE proyecto_id = @proyecto_id`,
      {
        proyecto_id: proyectoId,
        nombre: nuevoNombre,
        descripcion: nuevaDescripcion,
      },
    );

    if (!proyectoActualizado) {
      throw new NotFoundException('No se pudo actualizar el proyecto');
    }

    return proyectoActualizado;
  }

  async eliminarProyecto(proyectoId: string, usuarioId: string): Promise<{ mensaje: string }> {
    await this.validarPermisoPropietario(proyectoId, usuarioId);

    const eliminado = await this.db.queryOne<{ proyecto_id: string }>(
      `DELETE FROM nucleo.Proyectos
      OUTPUT DELETED.proyecto_id
      WHERE proyecto_id = @proyecto_id`,
      { proyecto_id: proyectoId },
    );

    if (!eliminado) {
      throw new NotFoundException('No se pudo eliminar el proyecto');
    }

    return { mensaje: 'Proyecto eliminado correctamente' };
  }
}
