import {
  BadRequestException,
  ConflictException,
  Injectable,
  InternalServerErrorException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { compare, hash } from 'bcrypt';
import { DatabaseService } from '../database/database.service';
import { cifrarTokenGithub, descifrarTokenGithub } from './github-token.cipher';
import { LoginDto } from './dto/login.dto';
import { RegistroDto } from './dto/registro.dto';
import type { UsuarioToken } from './decorators/usuario-actual.decorator';

interface UsuarioLoginRow {
  usuario_id: string;
  correo: string;
  nombre_visible: string;
  hash_contrasena: string | null;
  esta_activo: boolean;
}

interface UsuarioCreadoRow {
  usuario_id: string;
  correo: string;
  nombre_visible: string;
}

export interface UsuarioPerfilConGithub extends UsuarioToken {
  usuario_github: string | null;
  github_conectado: boolean;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly db: DatabaseService,
    private readonly jwtService: JwtService,
    private readonly config: ConfigService,
  ) {}

  async login(dto: LoginDto): Promise<{ access_token: string }> {
    const correoNormalizado = dto.correo.trim().toLowerCase();
    const usuario = await this.db.queryOne<UsuarioLoginRow>(
      `SELECT TOP 1
        usuario_id,
        correo,
        nombre_visible,
        hash_contrasena,
        esta_activo
      FROM nucleo.Usuarios
      WHERE correo = @correo`,
      { correo: correoNormalizado },
    );

    if (!usuario || !usuario.hash_contrasena || !usuario.esta_activo) {
      throw new UnauthorizedException('Credenciales inválidas');
    }

    const credencialesValidas = await compare(dto.contrasena, usuario.hash_contrasena);
    if (!credencialesValidas) {
      throw new UnauthorizedException('Credenciales inválidas');
    }

    const payload = {
      sub: usuario.usuario_id,
      correo: usuario.correo,
      nombre_visible: usuario.nombre_visible,
    };

    return {
      access_token: await this.jwtService.signAsync(payload),
    };
  }

  async registrar(dto: RegistroDto): Promise<{ access_token: string }> {
    const correoNormalizado = dto.correo.trim().toLowerCase();
    const nombreVisibleNormalizado = dto.nombre_visible.trim();
    const hashContrasena = await hash(dto.contrasena, 12);

    try {
      const usuarioCreado = await this.db.queryOne<UsuarioCreadoRow>(
        `INSERT INTO nucleo.Usuarios (
          correo,
          nombre_visible,
          hash_contrasena
        )
        OUTPUT
          INSERTED.usuario_id,
          INSERTED.correo,
          INSERTED.nombre_visible
        VALUES (
          @correo,
          @nombre_visible,
          @hash_contrasena
        )`,
        {
          correo: correoNormalizado,
          nombre_visible: nombreVisibleNormalizado,
          hash_contrasena: hashContrasena,
        },
      );

      if (!usuarioCreado) {
        throw new InternalServerErrorException('No fue posible registrar el usuario');
      }

      const payload = {
        sub: usuarioCreado.usuario_id,
        correo: usuarioCreado.correo,
        nombre_visible: usuarioCreado.nombre_visible,
      };

      return {
        access_token: await this.jwtService.signAsync(payload),
      };
    } catch (error: unknown) {
      const codigo = (error as { number?: number })?.number;
      const mensajeError = String((error as { message?: string })?.message ?? '').toLowerCase();
      if (codigo === 2627 || codigo === 2601) {
        if (mensajeError.includes('uq_usuarios_correo')) {
          throw new ConflictException('El correo ya está registrado');
        }
        if (mensajeError.includes('uq_usuarios_github')) {
          throw new ConflictException(
            'No se pudo registrar por una restricción de GitHub en base de datos. Contacta al administrador.',
          );
        }
        throw new ConflictException('No se pudo registrar por restricción única en base de datos');
      }
      throw error;
    }
  }

  async obtenerPerfilConGithub(usuario: UsuarioToken): Promise<UsuarioPerfilConGithub> {
    const row = await this.db.queryOne<{
      usuario_github: string | null;
      token_github: string | null;
    }>(
      `SELECT usuario_github, token_github
      FROM nucleo.Usuarios
      WHERE usuario_id = @usuario_id`,
      { usuario_id: usuario.sub },
    );
    return {
      ...usuario,
      usuario_github: row?.usuario_github ?? null,
      github_conectado: Boolean(row?.token_github),
    };
  }

  /** Token en claro para llamadas a api.github.com (OAuth del usuario). */
  async obtenerTokenGithubAcceso(usuarioId: string): Promise<string | undefined> {
    const row = await this.db.queryOne<{ token_github: string | null }>(
      `SELECT token_github
      FROM nucleo.Usuarios
      WHERE usuario_id = @usuario_id
        AND esta_activo = 1`,
      { usuario_id: usuarioId },
    );
    if (!row?.token_github) {
      return undefined;
    }
    const jwtSecret = this.config.getOrThrow<string>('auth.jwtSecret');
    const plain = descifrarTokenGithub(row.token_github, jwtSecret);
    return plain ?? undefined;
  }

  async construirUrlAutorizacionGithub(usuarioId: string): Promise<string> {
    const clientId = this.config.get<string>('github.oauthClientId')?.trim();
    const redirectUri = this.config.get<string>('github.oauthCallbackUrl')?.trim();
    if (!clientId || !redirectUri) {
      throw new BadRequestException(
        'Falta configurar GitHub OAuth en el backend. En .env define GITHUB_CLIENT_ID, ' +
          'GITHUB_CLIENT_SECRET y GITHUB_OAUTH_CALLBACK_URL (ej. http://localhost:3000/auth/github/callback). ' +
          'Crea una OAuth App en https://github.com/settings/developers y usa la misma URL de callback allí y en .env. ' +
          'Reinicia el servidor tras guardar.',
      );
    }
    const state = await this.jwtService.signAsync(
      { sub: usuarioId, gh_oauth: true },
      { expiresIn: '600s' },
    );
    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      scope: 'repo read:user',
      state,
    });
    return `https://github.com/login/oauth/authorize?${params.toString()}`;
  }

  async completarOAuthGithub(code: string, state: string): Promise<void> {
    let payload: { sub: string; gh_oauth: boolean };
    try {
      payload = await this.jwtService.verifyAsync<{ sub: string; gh_oauth: boolean }>(state);
    } catch {
      throw new UnauthorizedException('Enlace de GitHub caducado o inválido. Intenta conectar de nuevo.');
    }
    if (!payload.gh_oauth || !payload.sub) {
      throw new UnauthorizedException('State inválido');
    }

    const clientId = this.config.get<string>('github.oauthClientId')?.trim();
    const clientSecret = this.config.get<string>('github.oauthClientSecret')?.trim();
    const redirectUri = this.config.get<string>('github.oauthCallbackUrl')?.trim();
    if (!clientId || !clientSecret || !redirectUri) {
      throw new BadRequestException('OAuth de GitHub mal configurado en el servidor.');
    }

    const tokenRes = await fetch('https://github.com/login/oauth/access_token', {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        client_id: clientId,
        client_secret: clientSecret,
        code,
        redirect_uri: redirectUri,
      }),
    });

    const tokenJson = (await tokenRes.json()) as {
      access_token?: string;
      error_description?: string;
      error?: string;
    };
    if (!tokenJson.access_token) {
      throw new BadRequestException(
        tokenJson.error_description ?? tokenJson.error ?? 'GitHub no devolvió access_token',
      );
    }

    const userRes = await fetch('https://api.github.com/user', {
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${tokenJson.access_token}`,
        'X-GitHub-Api-Version': '2022-11-28',
      },
    });
    const ghUser = (await userRes.json()) as { login?: string };
    if (!ghUser.login) {
      throw new BadRequestException('No se pudo leer el usuario de GitHub');
    }

    const jwtSecret = this.config.getOrThrow<string>('auth.jwtSecret');
    const tokenCifrado = cifrarTokenGithub(tokenJson.access_token, jwtSecret);

    try {
      await this.db.query(
        `UPDATE nucleo.Usuarios
        SET token_github = @token_github,
            usuario_github = @usuario_github,
            actualizado_en = SYSUTCDATETIME()
        WHERE usuario_id = @usuario_id`,
        {
          usuario_id: payload.sub,
          token_github: tokenCifrado,
          usuario_github: ghUser.login,
        },
      );
    } catch (error: unknown) {
      const num = (error as { number?: number })?.number;
      if (num === 2627 || num === 2601) {
        throw new ConflictException(
          'Esta cuenta de GitHub ya está vinculada a otro usuario de DevManage.',
        );
      }
      throw error;
    }
  }

  async desconectarGithub(usuarioId: string): Promise<void> {
    await this.db.query(
      `UPDATE nucleo.Usuarios
      SET token_github = NULL,
          usuario_github = NULL,
          actualizado_en = SYSUTCDATETIME()
      WHERE usuario_id = @usuario_id`,
      { usuario_id: usuarioId },
    );
  }
}
