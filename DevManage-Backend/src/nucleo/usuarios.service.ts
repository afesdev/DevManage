import { Injectable, NotFoundException } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';

export interface UsuarioPerfil {
  usuario_id: string;
  correo: string;
  nombre_visible: string;
  url_avatar: string | null;
  usuario_github: string | null;
  esta_activo: boolean;
  creado_en: string;
  actualizado_en: string;
}

export interface UsuarioBasico {
  usuario_id: string;
  correo: string;
  nombre_visible: string;
}

@Injectable()
export class UsuariosService {
  constructor(private readonly db: DatabaseService) {}

  async obtenerPerfil(usuarioId: string): Promise<UsuarioPerfil> {
    const usuario = await this.db.queryOne<UsuarioPerfil>(
      `SELECT TOP 1
        usuario_id,
        correo,
        nombre_visible,
        url_avatar,
        usuario_github,
        esta_activo,
        creado_en,
        actualizado_en
      FROM nucleo.Usuarios
      WHERE usuario_id = @usuario_id`,
      { usuario_id: usuarioId },
    );

    if (!usuario) {
      throw new NotFoundException('Usuario no encontrado');
    }

    return usuario;
  }

  obtenerUsuariosActivos(): Promise<UsuarioBasico[]> {
    return this.db.query<UsuarioBasico>(
      `SELECT
        usuario_id,
        correo,
        nombre_visible
      FROM nucleo.Usuarios
      WHERE esta_activo = 1
      ORDER BY nombre_visible ASC, correo ASC`,
    );
  }
}
