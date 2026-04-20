import { Body, Controller, Delete, Get, Post, Query, Res, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';
import type { Response } from 'express';
import { UsuarioActual } from './decorators/usuario-actual.decorator';
import type { UsuarioToken } from './decorators/usuario-actual.decorator';
import { LoginDto } from './dto/login.dto';
import { RegistroDto } from './dto/registro.dto';
import { JwtGuard } from './guards/jwt.guard';
import { AuthService } from './auth.service';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly config: ConfigService,
  ) {}

  // Endpoint público — sin guard intencionalmente
  @ApiOperation({ summary: 'Iniciar sesión con correo y contraseña' })
  @Post('login')
  login(@Body() dto: LoginDto): Promise<{ access_token: string }> {
    return this.authService.login(dto);
  }

  // Endpoint público — sin guard intencionalmente
  @ApiOperation({ summary: 'Registrar nuevo usuario con correo y contraseña' })
  @Post('register')
  registrar(@Body() dto: RegistroDto): Promise<{ access_token: string }> {
    return this.authService.registrar(dto);
  }

  @ApiBearerAuth()
  @ApiOperation({ summary: 'Obtener usuario autenticado desde el token JWT' })
  @UseGuards(JwtGuard)
  @Get('me')
  obtenerPerfil(@UsuarioActual() usuario: UsuarioToken) {
    return this.authService.obtenerPerfilConGithub(usuario);
  }

  @ApiBearerAuth()
  @ApiOperation({ summary: 'URL para autorizar DevManage en GitHub (OAuth)' })
  @UseGuards(JwtGuard)
  @Get('github/authorize')
  async urlAutorizacionGithub(@UsuarioActual('sub') usuarioId: string): Promise<{ url: string }> {
    const url = await this.authService.construirUrlAutorizacionGithub(usuarioId);
    return { url };
  }

  @ApiOperation({ summary: 'Callback OAuth de GitHub (redirige al frontend)' })
  @Get('github/callback')
  async callbackGithub(
    @Query('code') code: string | undefined,
    @Query('state') state: string | undefined,
    @Query('error') error: string | undefined,
    @Res() res: Response,
  ): Promise<void> {
    const frontend = this.config.get<string>('app.frontendUrl') ?? 'http://localhost:5173';
    if (error || !code?.trim() || !state?.trim()) {
      res.redirect(`${frontend}/github?github_error=1`);
      return;
    }
    try {
      await this.authService.completarOAuthGithub(code, state);
      res.redirect(`${frontend}/github?github=conectado`);
    } catch {
      res.redirect(`${frontend}/github?github_error=1`);
    }
  }

  @ApiBearerAuth()
  @ApiOperation({ summary: 'Desvincular cuenta de GitHub' })
  @UseGuards(JwtGuard)
  @Delete('github')
  async desconectarGithub(@UsuarioActual('sub') usuarioId: string): Promise<{ ok: true }> {
    await this.authService.desconectarGithub(usuarioId);
    return { ok: true };
  }
}
