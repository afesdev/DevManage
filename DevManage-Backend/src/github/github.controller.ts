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
  ArchivoPullRequestGithub,
  EstadoDespliegueRepositorio,
  RamaResumen,
  RepositorioGithubPublico,
  RepositorioGithubUsuario,
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
  @ApiOperation({ summary: 'Listar repositorios del usuario autenticado en GitHub' })
  @UseGuards(JwtGuard)
  @Get('repos/mios')
  async listarRepositoriosUsuario(
    @UsuarioActual('sub') usuarioId: string,
    @Query('proyecto_id') proyectoId?: string,
  ): Promise<RepositorioGithubUsuario[]> {
    const tokenUsuario = await this.authService.obtenerTokenGithubAcceso(usuarioId);
    if (!tokenUsuario) {
      throw new UnauthorizedException('Primero conecta tu cuenta de GitHub.');
    }
    return this.githubService.listarRepositoriosUsuario(tokenUsuario, proyectoId, usuarioId);
  }

  @ApiBearerAuth()
  @ApiOperation({ summary: 'Vincular repositorio GitHub a un proyecto' })
  @UseGuards(JwtGuard)
  @Post('repositorios')
  vincularRepositorio(
    @Body() dto: VincularRepositorioDto,
    @UsuarioActual('sub') usuarioId: string,
  ): Promise<RepositorioResumen> {
    return this.authService
      .obtenerTokenGithubAcceso(usuarioId)
      .then((tokenGithub) => this.githubService.vincularRepositorio(dto, usuarioId, tokenGithub));
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

  @ApiBearerAuth()
  @ApiOperation({ summary: 'Sincronizar ramas y PRs existentes desde GitHub' })
  @UseGuards(JwtGuard)
  @Post('repositorios/:repositorio_id/sincronizar')
  async sincronizarRepositorio(
    @Param('repositorio_id') repositorioId: string,
    @UsuarioActual('sub') usuarioId: string,
  ): Promise<{ estado: string; ramas: number; prs: number }> {
    const tokenGithub = await this.authService.obtenerTokenGithubAcceso(usuarioId);
    if (!tokenGithub) {
      throw new UnauthorizedException('Primero conecta tu cuenta de GitHub.');
    }
    const resultado = await this.githubService.sincronizarRepositorio(
      repositorioId,
      tokenGithub,
      usuarioId,
    );
    return { estado: 'ok', ...resultado };
  }

  @ApiBearerAuth()
  @ApiOperation({ summary: 'Listar archivos cambiados en un pull request' })
  @UseGuards(JwtGuard)
  @Get('repositorios/:repositorio_id/solicitudes-integracion/:numero/archivos')
  async obtenerArchivosPullRequest(
    @Param('repositorio_id') repositorioId: string,
    @Param('numero') numero: string,
    @UsuarioActual('sub') usuarioId: string,
  ): Promise<ArchivoPullRequestGithub[]> {
    const tokenGithub = await this.authService.obtenerTokenGithubAcceso(usuarioId);
    if (!tokenGithub) {
      throw new UnauthorizedException('Primero conecta tu cuenta de GitHub.');
    }
    return this.githubService.obtenerArchivosPullRequest(
      repositorioId,
      parseInt(numero, 10),
      tokenGithub,
      usuarioId,
    );
  }

  @ApiBearerAuth()
  @ApiOperation({ summary: 'Estado de despliegue por ramas (desarrollo/main-prueba/main)' })
  @UseGuards(JwtGuard)
  @Get('repositorios/:repositorio_id/estado-despliegue')
  obtenerEstadoDespliegue(
    @Param('repositorio_id') repositorioId: string,
    @UsuarioActual('sub') usuarioId: string,
  ): Promise<EstadoDespliegueRepositorio> {
    return this.githubService.obtenerEstadoDespliegue(repositorioId, usuarioId);
  }

  @ApiBearerAuth()
  @ApiOperation({ summary: 'Listar vínculos automáticos tarea ↔ PR/rama del repositorio' })
  @UseGuards(JwtGuard)
  @Get('repositorios/:repositorio_id/vinculos-tareas')
  obtenerVinculosTareas(
    @Param('repositorio_id') repositorioId: string,
    @UsuarioActual('sub') usuarioId: string,
  ): Promise<Array<{ tarea_id: string; titulo: string; solicitud_numero: number | null; rama: string | null }>> {
    return this.githubService.obtenerVinculosTareas(repositorioId, usuarioId);
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
