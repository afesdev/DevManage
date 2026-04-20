import {
  Body,
  Controller,
  Get,
  Headers,
  Param,
  Post,
  Query,
  Req,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { AuthService } from '../auth/auth.service';
import { UsuarioActual } from '../auth/decorators/usuario-actual.decorator';
import { JwtGuard } from '../auth/guards/jwt.guard';
import { VincularRepositorioDto } from './dto/vincular-repositorio.dto';
import { GithubService } from './github.service';
import type {
  RamaResumen,
  RepositorioGithubPublico,
  RepositorioResumen,
  SolicitudIntegracionResumen,
} from './github.service';

type RequestConRawBody = Request & { rawBody?: Buffer };

@ApiTags('github')
@Controller('github')
export class GithubController {
  constructor(
    private readonly githubService: GithubService,
    private readonly authService: AuthService,
  ) {}

  @ApiBearerAuth()
  @ApiOperation({
    summary:
      'Resolver propietario/repo (OAuth del usuario o GITHUB_TOKEN del servidor; sin credenciales solo públicos)',
  })
  @UseGuards(JwtGuard)
  @Get('repos/resolver')
  async resolverRepositorio(
    @Query('q') fullName: string,
    @UsuarioActual('sub') usuarioId: string,
  ): Promise<RepositorioGithubPublico> {
    const tokenUsuario = await this.authService.obtenerTokenGithubAcceso(usuarioId);
    return this.githubService.resolverRepositorio(fullName ?? '', tokenUsuario);
  }

  @ApiBearerAuth()
  @ApiOperation({ summary: 'Vincular repositorio GitHub a un proyecto' })
  @UseGuards(JwtGuard)
  @Post('repositorios')
  vincularRepositorio(
    @Body() dto: VincularRepositorioDto,
    @UsuarioActual('sub') usuarioId: string,
  ): Promise<RepositorioResumen> {
    return this.githubService.vincularRepositorio(dto, usuarioId);
  }

  @ApiBearerAuth()
  @ApiOperation({ summary: 'Listar repositorios vinculados a un proyecto' })
  @UseGuards(JwtGuard)
  @Get('proyectos/:proyecto_id/repositorios')
  obtenerRepositoriosPorProyecto(
    @Param('proyecto_id') proyectoId: string,
    @UsuarioActual('sub') usuarioId: string,
  ): Promise<RepositorioResumen[]> {
    return this.githubService.obtenerRepositoriosPorProyecto(proyectoId, usuarioId);
  }

  @ApiBearerAuth()
  @ApiOperation({ summary: 'Listar ramas de un repositorio vinculado' })
  @UseGuards(JwtGuard)
  @Get('repositorios/:repositorio_id/ramas')
  obtenerRamasPorRepositorio(
    @Param('repositorio_id') repositorioId: string,
    @UsuarioActual('sub') usuarioId: string,
  ): Promise<RamaResumen[]> {
    return this.githubService.obtenerRamasPorRepositorio(repositorioId, usuarioId);
  }

  @ApiBearerAuth()
  @ApiOperation({ summary: 'Listar pull requests ingestados de un repositorio' })
  @UseGuards(JwtGuard)
  @Get('repositorios/:repositorio_id/solicitudes-integracion')
  obtenerSolicitudesIntegracionPorRepositorio(
    @Param('repositorio_id') repositorioId: string,
    @UsuarioActual('sub') usuarioId: string,
  ): Promise<SolicitudIntegracionResumen[]> {
    return this.githubService.obtenerSolicitudesIntegracionPorRepositorio(
      repositorioId,
      usuarioId,
    );
  }

  // Endpoint público — sin guard intencionalmente
  @ApiOperation({ summary: 'Webhook de GitHub (push, pull_request)' })
  @Post('webhook')
  async recibirWebhook(
    @Req() req: RequestConRawBody,
    @Headers('x-github-event') evento: string | undefined,
    @Headers('x-hub-signature-256') firma: string | undefined,
  ): Promise<{ estado: string; evento: string; procesado: boolean; detalle: string }> {
    const eventoGithub = evento ?? 'desconocido';
    const rawBody = req.rawBody ?? Buffer.from(JSON.stringify(req.body ?? {}), 'utf8');

    const firmaValida = this.githubService.verificarFirma(rawBody, firma);
    if (!firmaValida) {
      throw new UnauthorizedException('Firma de webhook inválida');
    }

    const resultado = await this.githubService.procesarEvento(eventoGithub, req.body);
    return {
      estado: 'ok',
      evento: eventoGithub,
      procesado: resultado.procesado,
      detalle: resultado.detalle,
    };
  }
}
