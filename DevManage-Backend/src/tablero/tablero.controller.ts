import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { UsuarioActual } from '../auth/decorators/usuario-actual.decorator';
import { JwtGuard } from '../auth/guards/jwt.guard';
import { ActualizarComentarioDto } from './dto/actualizar-comentario.dto';
import { ActualizarEtiquetaDto } from './dto/actualizar-etiqueta.dto';
import { ActualizarTareaDto } from './dto/actualizar-tarea.dto';
import { CrearComentarioDto } from './dto/crear-comentario.dto';
import { CrearEpicaDto } from './dto/crear-epica.dto';
import { CrearEtiquetaDto } from './dto/crear-etiqueta.dto';
import { CrearTareaDto } from './dto/crear-tarea.dto';
import { MoverTareaDto } from './dto/mover-tarea.dto';
import { ReordenarTareaDto } from './dto/reordenar-tarea.dto';
import { VincularEtiquetaDto } from './dto/vincular-etiqueta.dto';
import {
  ColumnaTablero,
  ComentarioTareaResumen,
  EpicaResumen,
  EtiquetaResumen,
  MiembroProyectoResumen,
  ProyectoResumen,
  TareaActividadResumen,
  TareaEtiquetaResumen,
  TableroService,
  TareaTablero,
} from './tablero.service';

@ApiTags('tablero')
@ApiBearerAuth()
@UseGuards(JwtGuard)
@Controller('tablero')
export class TableroController {
  constructor(private readonly tableroService: TableroService) {}

  @ApiOperation({ summary: 'Listar proyectos visibles para el usuario autenticado' })
  @Get('proyectos')
  obtenerProyectos(@UsuarioActual('sub') usuarioId: string): Promise<ProyectoResumen[]> {
    return this.tableroService.obtenerProyectosPorUsuario(usuarioId);
  }

  @ApiOperation({ summary: 'Listar columnas de un proyecto' })
  @Get('proyectos/:proyecto_id/columnas')
  obtenerColumnasPorProyecto(
    @Param('proyecto_id') proyectoId: string,
    @UsuarioActual('sub') usuarioId: string,
  ): Promise<ColumnaTablero[]> {
    return this.tableroService.obtenerColumnasPorProyecto(proyectoId, usuarioId);
  }

  @ApiOperation({ summary: 'Listar tareas de un proyecto' })
  @Get('proyectos/:proyecto_id/tareas')
  obtenerTareasPorProyecto(
    @Param('proyecto_id') proyectoId: string,
    @UsuarioActual('sub') usuarioId: string,
  ): Promise<TareaTablero[]> {
    return this.tableroService.obtenerTareasPorProyecto(proyectoId, usuarioId);
  }

  @ApiOperation({ summary: 'Listar épicas de un proyecto' })
  @Get('proyectos/:proyecto_id/epicas')
  obtenerEpicasPorProyecto(
    @Param('proyecto_id') proyectoId: string,
    @UsuarioActual('sub') usuarioId: string,
  ): Promise<EpicaResumen[]> {
    return this.tableroService.obtenerEpicasPorProyecto(proyectoId, usuarioId);
  }

  @ApiOperation({ summary: 'Crear una épica en el proyecto' })
  @Post('proyectos/:proyecto_id/epicas')
  crearEpica(
    @Param('proyecto_id') proyectoId: string,
    @Body() dto: CrearEpicaDto,
    @UsuarioActual('sub') usuarioId: string,
  ): Promise<EpicaResumen> {
    return this.tableroService.crearEpica(proyectoId, dto, usuarioId);
  }

  @ApiOperation({ summary: 'Listar miembros de un proyecto' })
  @Get('proyectos/:proyecto_id/miembros')
  obtenerMiembrosProyecto(
    @Param('proyecto_id') proyectoId: string,
    @UsuarioActual('sub') usuarioId: string,
  ): Promise<MiembroProyectoResumen[]> {
    return this.tableroService.obtenerMiembrosProyecto(proyectoId, usuarioId);
  }

  @ApiOperation({ summary: 'Listar etiquetas de un proyecto' })
  @Get('proyectos/:proyecto_id/etiquetas')
  obtenerEtiquetasPorProyecto(
    @Param('proyecto_id') proyectoId: string,
    @UsuarioActual('sub') usuarioId: string,
  ): Promise<EtiquetaResumen[]> {
    return this.tableroService.obtenerEtiquetasPorProyecto(proyectoId, usuarioId);
  }

  @ApiOperation({ summary: 'Crear etiqueta en proyecto' })
  @Post('proyectos/:proyecto_id/etiquetas')
  crearEtiqueta(
    @Param('proyecto_id') proyectoId: string,
    @Body() dto: CrearEtiquetaDto,
    @UsuarioActual('sub') usuarioId: string,
  ): Promise<EtiquetaResumen> {
    return this.tableroService.crearEtiqueta(proyectoId, dto, usuarioId);
  }

  @ApiOperation({ summary: 'Listar etiquetas asignadas a tareas de un proyecto' })
  @Get('proyectos/:proyecto_id/tareas-etiquetas')
  obtenerEtiquetasPorTarea(
    @Param('proyecto_id') proyectoId: string,
    @UsuarioActual('sub') usuarioId: string,
  ): Promise<TareaEtiquetaResumen[]> {
    return this.tableroService.obtenerEtiquetasPorTarea(proyectoId, usuarioId);
  }

  @ApiOperation({ summary: 'Actualizar etiqueta de un proyecto' })
  @Patch('proyectos/:proyecto_id/etiquetas/:etiqueta_id')
  actualizarEtiqueta(
    @Param('proyecto_id') proyectoId: string,
    @Param('etiqueta_id') etiquetaId: string,
    @Body() dto: ActualizarEtiquetaDto,
    @UsuarioActual('sub') usuarioId: string,
  ): Promise<EtiquetaResumen> {
    return this.tableroService.actualizarEtiqueta(proyectoId, etiquetaId, dto, usuarioId);
  }

  @ApiOperation({ summary: 'Eliminar etiqueta de un proyecto' })
  @Delete('proyectos/:proyecto_id/etiquetas/:etiqueta_id')
  eliminarEtiqueta(
    @Param('proyecto_id') proyectoId: string,
    @Param('etiqueta_id') etiquetaId: string,
    @UsuarioActual('sub') usuarioId: string,
  ): Promise<{ mensaje: string }> {
    return this.tableroService.eliminarEtiqueta(proyectoId, etiquetaId, usuarioId);
  }

  @ApiOperation({ summary: 'Crear una tarea en el tablero' })
  @Post('tareas')
  crearTarea(
    @Body() dto: CrearTareaDto,
    @UsuarioActual('sub') usuarioId: string,
  ): Promise<TareaTablero> {
    return this.tableroService.crearTarea(dto, usuarioId);
  }

  @ApiOperation({ summary: 'Mover tarea entre columnas del tablero' })
  @Patch('tareas/:tarea_id/mover')
  moverTarea(
    @Param('tarea_id') tareaId: string,
    @Body() dto: MoverTareaDto,
    @UsuarioActual('sub') usuarioId: string,
  ): Promise<{ mensaje: string }> {
    return this.tableroService.moverTarea(tareaId, dto.nueva_columna_id, usuarioId);
  }

  @ApiOperation({ summary: 'Reordenar tarea en una columna (o mover y posicionar)' })
  @Patch('tareas/:tarea_id/reordenar')
  reordenarTarea(
    @Param('tarea_id') tareaId: string,
    @Body() dto: ReordenarTareaDto,
    @UsuarioActual('sub') usuarioId: string,
  ): Promise<{ mensaje: string }> {
    return this.tableroService.reordenarTarea(tareaId, dto.columna_id, dto.posicion, usuarioId);
  }

  @ApiOperation({ summary: 'Actualizar datos de una tarea' })
  @Patch('tareas/:tarea_id')
  actualizarTarea(
    @Param('tarea_id') tareaId: string,
    @Body() dto: ActualizarTareaDto,
    @UsuarioActual('sub') usuarioId: string,
  ): Promise<TareaTablero> {
    return this.tableroService.actualizarTarea(tareaId, dto, usuarioId);
  }

  @ApiOperation({ summary: 'Eliminar una tarea del tablero' })
  @Delete('tareas/:tarea_id')
  eliminarTarea(
    @Param('tarea_id') tareaId: string,
    @UsuarioActual('sub') usuarioId: string,
  ): Promise<{ mensaje: string }> {
    return this.tableroService.eliminarTarea(tareaId, usuarioId);
  }

  @ApiOperation({ summary: 'Asignar etiqueta a tarea' })
  @Post('tareas/:tarea_id/etiquetas')
  asignarEtiquetaATarea(
    @Param('tarea_id') tareaId: string,
    @Body() dto: VincularEtiquetaDto,
    @UsuarioActual('sub') usuarioId: string,
  ): Promise<{ mensaje: string }> {
    return this.tableroService.asignarEtiquetaATarea(tareaId, dto.etiqueta_id, usuarioId);
  }

  @ApiOperation({ summary: 'Quitar etiqueta de tarea' })
  @Delete('tareas/:tarea_id/etiquetas/:etiqueta_id')
  quitarEtiquetaDeTarea(
    @Param('tarea_id') tareaId: string,
    @Param('etiqueta_id') etiquetaId: string,
    @UsuarioActual('sub') usuarioId: string,
  ): Promise<{ mensaje: string }> {
    return this.tableroService.quitarEtiquetaDeTarea(tareaId, etiquetaId, usuarioId);
  }

  @ApiOperation({ summary: 'Listar comentarios de una tarea' })
  @Get('tareas/:tarea_id/comentarios')
  obtenerComentariosPorTarea(
    @Param('tarea_id') tareaId: string,
    @UsuarioActual('sub') usuarioId: string,
  ): Promise<ComentarioTareaResumen[]> {
    return this.tableroService.obtenerComentariosPorTarea(tareaId, usuarioId);
  }

  @ApiOperation({ summary: 'Crear comentario en una tarea' })
  @Post('tareas/:tarea_id/comentarios')
  crearComentarioEnTarea(
    @Param('tarea_id') tareaId: string,
    @Body() dto: CrearComentarioDto,
    @UsuarioActual('sub') usuarioId: string,
  ): Promise<ComentarioTareaResumen> {
    return this.tableroService.crearComentarioEnTarea(tareaId, dto.contenido, usuarioId);
  }

  @ApiOperation({ summary: 'Actualizar comentario de tarea' })
  @Patch('tareas/:tarea_id/comentarios/:comentario_id')
  actualizarComentarioDeTarea(
    @Param('tarea_id') tareaId: string,
    @Param('comentario_id') comentarioId: string,
    @Body() dto: ActualizarComentarioDto,
    @UsuarioActual('sub') usuarioId: string,
  ): Promise<ComentarioTareaResumen> {
    return this.tableroService.actualizarComentarioDeTarea(
      tareaId,
      comentarioId,
      dto.contenido,
      usuarioId,
    );
  }

  @ApiOperation({ summary: 'Eliminar comentario de tarea' })
  @Delete('tareas/:tarea_id/comentarios/:comentario_id')
  eliminarComentarioDeTarea(
    @Param('tarea_id') tareaId: string,
    @Param('comentario_id') comentarioId: string,
    @UsuarioActual('sub') usuarioId: string,
  ): Promise<{ mensaje: string }> {
    return this.tableroService.eliminarComentarioDeTarea(tareaId, comentarioId, usuarioId);
  }

  @ApiOperation({ summary: 'Listar actividad de una tarea' })
  @Get('tareas/:tarea_id/actividad')
  obtenerActividadPorTarea(
    @Param('tarea_id') tareaId: string,
    @UsuarioActual('sub') usuarioId: string,
  ): Promise<TareaActividadResumen[]> {
    return this.tableroService.obtenerActividadPorTarea(tareaId, usuarioId);
  }
}
