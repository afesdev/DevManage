import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { UsuarioActual } from '../auth/decorators/usuario-actual.decorator';
import { JwtGuard } from '../auth/guards/jwt.guard';
import { ActualizarMiembroEquipoDto } from './dto/actualizar-miembro-equipo.dto';
import { ActualizarProyectoDto } from './dto/actualizar-proyecto.dto';
import { CrearProyectoDto } from './dto/crear-proyecto.dto';
import { InvitarMiembroEquipoDto } from './dto/invitar-miembro-equipo.dto';
import { ProyectosService } from './proyectos.service';
import type { MiembroEquipoResumen, ProyectoCreado } from './proyectos.service';

@ApiTags('nucleo')
@ApiBearerAuth()
@UseGuards(JwtGuard)
@Controller('nucleo/proyectos')
export class ProyectosController {
  constructor(private readonly proyectosService: ProyectosService) {}

  @ApiOperation({ summary: 'Crear un proyecto para el usuario autenticado' })
  @Post()
  crearProyecto(
    @Body() dto: CrearProyectoDto,
    @UsuarioActual('sub') usuarioId: string,
  ): Promise<ProyectoCreado> {
    return this.proyectosService.crearProyecto(dto, usuarioId);
  }

  @ApiOperation({ summary: 'Editar proyecto del usuario autenticado' })
  @Patch(':proyecto_id')
  actualizarProyecto(
    @Param('proyecto_id') proyectoId: string,
    @Body() dto: ActualizarProyectoDto,
    @UsuarioActual('sub') usuarioId: string,
  ): Promise<ProyectoCreado> {
    return this.proyectosService.actualizarProyecto(proyectoId, dto, usuarioId);
  }

  @ApiOperation({ summary: 'Eliminar proyecto del usuario autenticado' })
  @Delete(':proyecto_id')
  eliminarProyecto(
    @Param('proyecto_id') proyectoId: string,
    @UsuarioActual('sub') usuarioId: string,
  ): Promise<{ mensaje: string }> {
    return this.proyectosService.eliminarProyecto(proyectoId, usuarioId);
  }

  @ApiOperation({ summary: 'Sincronizar miembros de equipo hacia todos los proyectos del equipo' })
  @Patch(':proyecto_id/equipo/sincronizar')
  sincronizarEquipoAProyectos(
    @Param('proyecto_id') proyectoId: string,
    @UsuarioActual('sub') usuarioId: string,
  ): Promise<{ mensaje: string }> {
    return this.proyectosService.sincronizarEquipoAProyectos(proyectoId, usuarioId);
  }

  @ApiOperation({ summary: 'Listar miembros del equipo del proyecto' })
  @Get(':proyecto_id/equipo/miembros')
  obtenerMiembrosEquipoPorProyecto(
    @Param('proyecto_id') proyectoId: string,
    @UsuarioActual('sub') usuarioId: string,
  ): Promise<MiembroEquipoResumen[]> {
    return this.proyectosService.obtenerMiembrosEquipoPorProyecto(proyectoId, usuarioId);
  }

  @ApiOperation({ summary: 'Invitar/agregar miembro al equipo y sincronizar en proyectos' })
  @Post(':proyecto_id/equipo/miembros')
  invitarMiembroAEquipo(
    @Param('proyecto_id') proyectoId: string,
    @Body() dto: InvitarMiembroEquipoDto,
    @UsuarioActual('sub') usuarioId: string,
  ): Promise<{ mensaje: string }> {
    return this.proyectosService.invitarMiembroAEquipoPorProyecto(
      proyectoId,
      dto.usuario_id,
      dto.correo,
      dto.rol ?? 'miembro',
      usuarioId,
    );
  }

  @ApiOperation({ summary: 'Actualizar rol de miembro de equipo y proyectos asociados' })
  @Patch(':proyecto_id/equipo/miembros/:miembro_usuario_id')
  actualizarMiembroEquipo(
    @Param('proyecto_id') proyectoId: string,
    @Param('miembro_usuario_id') miembroUsuarioId: string,
    @Body() dto: ActualizarMiembroEquipoDto,
    @UsuarioActual('sub') usuarioId: string,
  ): Promise<{ mensaje: string }> {
    return this.proyectosService.actualizarRolMiembroEquipoPorProyecto(
      proyectoId,
      miembroUsuarioId,
      dto.rol,
      usuarioId,
    );
  }

  @ApiOperation({ summary: 'Remover miembro de equipo y proyectos asociados' })
  @Delete(':proyecto_id/equipo/miembros/:miembro_usuario_id')
  removerMiembroEquipo(
    @Param('proyecto_id') proyectoId: string,
    @Param('miembro_usuario_id') miembroUsuarioId: string,
    @UsuarioActual('sub') usuarioId: string,
  ): Promise<{ mensaje: string }> {
    return this.proyectosService.removerMiembroEquipoPorProyecto(
      proyectoId,
      miembroUsuarioId,
      usuarioId,
    );
  }
}
