import { Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { UsuarioActual } from '../auth/decorators/usuario-actual.decorator';
import { JwtGuard } from '../auth/guards/jwt.guard';
import { ActualizarPaginaDto } from './dto/actualizar-pagina.dto';
import { CrearPaginaDto } from './dto/crear-pagina.dto';
import { VincularPaginaTareaDto } from './dto/vincular-pagina-tarea.dto';
import {
  DocumentosService,
  PaginaDetalle,
  PaginaResumen,
} from './documentos.service';

@ApiTags('documentos')
@ApiBearerAuth()
@UseGuards(JwtGuard)
@Controller('documentos')
export class DocumentosController {
  constructor(private readonly documentosService: DocumentosService) {}

  @ApiOperation({ summary: 'Listar páginas de un proyecto' })
  @Get('proyectos/:proyecto_id/paginas')
  obtenerPaginasPorProyecto(
    @Param('proyecto_id') proyectoId: string,
    @UsuarioActual('sub') usuarioId: string,
  ): Promise<PaginaResumen[]> {
    return this.documentosService.obtenerPaginasPorProyecto(proyectoId, usuarioId);
  }

  @ApiOperation({ summary: 'Obtener detalle de una página por id' })
  @Get('paginas/:pagina_id')
  obtenerPaginaPorId(
    @Param('pagina_id') paginaId: string,
    @UsuarioActual('sub') usuarioId: string,
  ): Promise<PaginaDetalle> {
    return this.documentosService.obtenerPaginaPorId(paginaId, usuarioId);
  }

  @ApiOperation({ summary: 'Crear una página de documentación' })
  @Post('paginas')
  crearPagina(
    @Body() dto: CrearPaginaDto,
    @UsuarioActual('sub') usuarioId: string,
  ): Promise<PaginaDetalle> {
    return this.documentosService.crearPagina(dto, usuarioId);
  }

  @ApiOperation({ summary: 'Actualizar una página de documentación' })
  @Patch('paginas/:pagina_id')
  actualizarPagina(
    @Param('pagina_id') paginaId: string,
    @Body() dto: ActualizarPaginaDto,
    @UsuarioActual('sub') usuarioId: string,
  ): Promise<PaginaDetalle> {
    return this.documentosService.actualizarPagina(paginaId, dto, usuarioId);
  }

  @ApiOperation({ summary: 'Vincular una página con una tarea del mismo proyecto' })
  @Post('paginas/:pagina_id/vinculos-tareas')
  vincularPaginaConTarea(
    @Param('pagina_id') paginaId: string,
    @Body() dto: VincularPaginaTareaDto,
    @UsuarioActual('sub') usuarioId: string,
  ): Promise<{ mensaje: string }> {
    return this.documentosService.vincularPaginaConTarea(paginaId, dto.tarea_id, usuarioId);
  }
}
