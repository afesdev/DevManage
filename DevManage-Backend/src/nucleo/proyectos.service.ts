import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
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

export interface MiembroEquipoResumen {
  equipo_id: string;
  usuario_id: string;
  nombre_visible: string;
  correo: string;
  rol: 'propietario' | 'administrador' | 'miembro';
  unido_en: string;
}

@Injectable()
export class ProyectosService {
  constructor(private readonly db: DatabaseService) {}

  private rolEquipoAProyecto(rolEquipo: string): 'propietario' | 'lider' | 'miembro' {
    if (rolEquipo === 'propietario') return 'propietario';
    if (rolEquipo === 'administrador') return 'lider';
    return 'miembro';
  }

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

  private async obtenerEquipoIdDeProyecto(proyectoId: string): Promise<string> {
    const proyecto = await this.db.queryOne<{ equipo_id: string }>(
      `SELECT TOP 1 equipo_id
      FROM nucleo.Proyectos
      WHERE proyecto_id = @proyecto_id`,
      { proyecto_id: proyectoId },
    );
    if (!proyecto) {
      throw new NotFoundException('Proyecto no encontrado');
    }
    return proyecto.equipo_id;
  }

  private async validarPermisoGestionEquipo(
    equipoId: string,
    usuarioId: string,
  ): Promise<'propietario' | 'administrador'> {
    const acceso = await this.db.queryOne<{ rol: 'propietario' | 'administrador' | 'miembro' }>(
      `SELECT TOP 1 rol
      FROM nucleo.MiembrosEquipo
      WHERE equipo_id = @equipo_id
        AND usuario_id = @usuario_id`,
      { equipo_id: equipoId, usuario_id: usuarioId },
    );
    if (!acceso) throw new ForbiddenException('No tienes acceso al equipo');
    if (acceso.rol !== 'propietario' && acceso.rol !== 'administrador') {
      throw new ForbiddenException('Solo propietario o administrador puede gestionar el equipo');
    }
    return acceso.rol;
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
      SELECT
        @proyecto_id,
        me.usuario_id,
        CASE
          WHEN me.rol = 'propietario' THEN 'propietario'
          WHEN me.rol = 'administrador' THEN 'lider'
          ELSE 'miembro'
        END
      FROM nucleo.MiembrosEquipo me
      WHERE me.equipo_id = @equipo_id
        AND NOT EXISTS (
          SELECT 1
          FROM nucleo.MiembrosProyecto mp
          WHERE mp.proyecto_id = @proyecto_id
            AND mp.usuario_id = me.usuario_id
        )`,
      {
        proyecto_id: proyecto.proyecto_id,
        equipo_id: proyecto.equipo_id,
      },
    );

    await this.db.query(
      `IF EXISTS (
        SELECT 1
        FROM nucleo.MiembrosProyecto
        WHERE proyecto_id = @proyecto_id
          AND usuario_id = @usuario_id
      )
      BEGIN
        UPDATE nucleo.MiembrosProyecto
        SET rol = 'propietario'
        WHERE proyecto_id = @proyecto_id
          AND usuario_id = @usuario_id
      END
      ELSE
      BEGIN
        INSERT INTO nucleo.MiembrosProyecto (proyecto_id, usuario_id, rol)
        VALUES (@proyecto_id, @usuario_id, 'propietario')
      END`,
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
        (@proyecto_id, 'Producción', 3, '#16A34A', 1)`,
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

  async obtenerMiembrosEquipoPorProyecto(
    proyectoId: string,
    usuarioId: string,
  ): Promise<MiembroEquipoResumen[]> {
    const equipoId = await this.obtenerEquipoIdDeProyecto(proyectoId);
    await this.validarPermisoGestionEquipo(equipoId, usuarioId);

    return this.db.query<MiembroEquipoResumen>(
      `SELECT
        me.equipo_id,
        me.usuario_id,
        u.nombre_visible,
        u.correo,
        me.rol,
        me.unido_en
      FROM nucleo.MiembrosEquipo me
      INNER JOIN nucleo.Usuarios u ON u.usuario_id = me.usuario_id
      WHERE me.equipo_id = @equipo_id
      ORDER BY
        CASE me.rol WHEN 'propietario' THEN 0 WHEN 'administrador' THEN 1 ELSE 2 END,
        me.unido_en ASC`,
      { equipo_id: equipoId },
    );
  }

  async invitarMiembroAEquipoPorProyecto(
    proyectoId: string,
    usuarioIdObjetivo: string | undefined,
    correo: string | undefined,
    rol: 'administrador' | 'miembro',
    usuarioId: string,
  ): Promise<{ mensaje: string }> {
    const equipoId = await this.obtenerEquipoIdDeProyecto(proyectoId);
    await this.validarPermisoGestionEquipo(equipoId, usuarioId);

    if (rol !== 'administrador' && rol !== 'miembro') {
      throw new BadRequestException('Rol inválido para invitación');
    }

    const correoNormalizado = (correo ?? '').trim().toLowerCase();
    let usuario: { usuario_id: string } | null = null;
    if (usuarioIdObjetivo?.trim()) {
      usuario = await this.db.queryOne<{ usuario_id: string }>(
        `SELECT TOP 1 usuario_id
        FROM nucleo.Usuarios
        WHERE usuario_id = @usuario_id`,
        { usuario_id: usuarioIdObjetivo.trim() },
      );
    } else if (correoNormalizado) {
      usuario = await this.db.queryOne<{ usuario_id: string }>(
        `SELECT TOP 1 usuario_id
        FROM nucleo.Usuarios
        WHERE LOWER(correo) = @correo`,
        { correo: correoNormalizado },
      );
    } else {
      throw new BadRequestException('Debes enviar usuario_id o correo');
    }
    if (!usuario) {
      throw new NotFoundException('No existe el usuario seleccionado');
    }

    await this.db.query(
      `IF NOT EXISTS (
        SELECT 1
        FROM nucleo.MiembrosEquipo
        WHERE equipo_id = @equipo_id
          AND usuario_id = @usuario_id
      )
      BEGIN
        INSERT INTO nucleo.MiembrosEquipo (equipo_id, usuario_id, rol)
        VALUES (@equipo_id, @usuario_id, @rol)
      END
      ELSE
      BEGIN
        UPDATE nucleo.MiembrosEquipo
        SET rol = @rol
        WHERE equipo_id = @equipo_id
          AND usuario_id = @usuario_id
      END`,
      {
        equipo_id: equipoId,
        usuario_id: usuario.usuario_id,
        rol,
      },
    );

    await this.db.query(
      `INSERT INTO nucleo.MiembrosProyecto (proyecto_id, usuario_id, rol)
      SELECT
        p.proyecto_id,
        @usuario_id,
        CASE
          WHEN @rol = 'administrador' THEN 'lider'
          ELSE 'miembro'
        END
      FROM nucleo.Proyectos p
      WHERE p.equipo_id = @equipo_id
        AND NOT EXISTS (
          SELECT 1
          FROM nucleo.MiembrosProyecto mp
          WHERE mp.proyecto_id = p.proyecto_id
            AND mp.usuario_id = @usuario_id
        )`,
      {
        equipo_id: equipoId,
        usuario_id: usuario.usuario_id,
        rol,
      },
    );

    return { mensaje: 'Miembro agregado al equipo y sincronizado con proyectos' };
  }

  async actualizarRolMiembroEquipoPorProyecto(
    proyectoId: string,
    miembroUsuarioId: string,
    rol: 'administrador' | 'miembro',
    usuarioId: string,
  ): Promise<{ mensaje: string }> {
    const equipoId = await this.obtenerEquipoIdDeProyecto(proyectoId);
    const rolSolicitante = await this.validarPermisoGestionEquipo(equipoId, usuarioId);
    if (miembroUsuarioId === usuarioId && rolSolicitante === 'propietario') {
      throw new BadRequestException('No puedes cambiar tu propio rol propietario');
    }

    if (rol !== 'administrador' && rol !== 'miembro') {
      throw new BadRequestException('Rol inválido');
    }

    const miembroActual = await this.db.queryOne<{ rol: string }>(
      `SELECT TOP 1 rol
      FROM nucleo.MiembrosEquipo
      WHERE equipo_id = @equipo_id
        AND usuario_id = @usuario_id`,
      { equipo_id: equipoId, usuario_id: miembroUsuarioId },
    );
    if (!miembroActual) {
      throw new NotFoundException('Miembro no encontrado en el equipo');
    }
    if (miembroActual.rol === 'propietario') {
      throw new BadRequestException('No se puede cambiar el rol del propietario');
    }

    await this.db.query(
      `UPDATE nucleo.MiembrosEquipo
      SET rol = @rol
      WHERE equipo_id = @equipo_id
        AND usuario_id = @usuario_id`,
      { equipo_id: equipoId, usuario_id: miembroUsuarioId, rol },
    );

    await this.db.query(
      `UPDATE mp
      SET mp.rol = CASE WHEN @rol = 'administrador' THEN 'lider' ELSE 'miembro' END
      FROM nucleo.MiembrosProyecto mp
      INNER JOIN nucleo.Proyectos p ON p.proyecto_id = mp.proyecto_id
      WHERE p.equipo_id = @equipo_id
        AND mp.usuario_id = @usuario_id
        AND mp.rol <> 'propietario'`,
      { equipo_id: equipoId, usuario_id: miembroUsuarioId, rol },
    );

    return { mensaje: 'Rol de miembro actualizado y sincronizado con proyectos' };
  }

  async removerMiembroEquipoPorProyecto(
    proyectoId: string,
    miembroUsuarioId: string,
    usuarioId: string,
  ): Promise<{ mensaje: string }> {
    const equipoId = await this.obtenerEquipoIdDeProyecto(proyectoId);
    const rolSolicitante = await this.validarPermisoGestionEquipo(equipoId, usuarioId);
    if (miembroUsuarioId === usuarioId && rolSolicitante === 'propietario') {
      throw new BadRequestException('No puedes removerte si eres el propietario');
    }

    const miembroActual = await this.db.queryOne<{ rol: string }>(
      `SELECT TOP 1 rol
      FROM nucleo.MiembrosEquipo
      WHERE equipo_id = @equipo_id
        AND usuario_id = @usuario_id`,
      { equipo_id: equipoId, usuario_id: miembroUsuarioId },
    );
    if (!miembroActual) throw new NotFoundException('Miembro no encontrado en el equipo');
    if (miembroActual.rol === 'propietario') {
      throw new BadRequestException('No se puede remover al propietario del equipo');
    }

    await this.db.query(
      `DELETE FROM nucleo.MiembrosEquipo
      WHERE equipo_id = @equipo_id
        AND usuario_id = @usuario_id`,
      { equipo_id: equipoId, usuario_id: miembroUsuarioId },
    );

    await this.db.query(
      `DELETE mp
      FROM nucleo.MiembrosProyecto mp
      INNER JOIN nucleo.Proyectos p ON p.proyecto_id = mp.proyecto_id
      WHERE p.equipo_id = @equipo_id
        AND mp.usuario_id = @usuario_id
        AND mp.rol <> 'propietario'`,
      { equipo_id: equipoId, usuario_id: miembroUsuarioId },
    );

    return { mensaje: 'Miembro removido del equipo y proyectos asociados' };
  }

  async sincronizarEquipoAProyectos(
    proyectoId: string,
    usuarioId: string,
  ): Promise<{ mensaje: string }> {
    const equipoId = await this.obtenerEquipoIdDeProyecto(proyectoId);
    await this.validarPermisoGestionEquipo(equipoId, usuarioId);

    await this.db.query(
      `INSERT INTO nucleo.MiembrosProyecto (proyecto_id, usuario_id, rol)
      SELECT
        p.proyecto_id,
        me.usuario_id,
        CASE
          WHEN me.rol = 'propietario' THEN 'propietario'
          WHEN me.rol = 'administrador' THEN 'lider'
          ELSE 'miembro'
        END
      FROM nucleo.Proyectos p
      INNER JOIN nucleo.MiembrosEquipo me ON me.equipo_id = p.equipo_id
      WHERE p.equipo_id = @equipo_id
        AND NOT EXISTS (
          SELECT 1
          FROM nucleo.MiembrosProyecto mp
          WHERE mp.proyecto_id = p.proyecto_id
            AND mp.usuario_id = me.usuario_id
        )`,
      { equipo_id: equipoId },
    );

    return { mensaje: 'Sincronización equipo -> proyectos completada' };
  }
}
