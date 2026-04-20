import { Body, Controller, Delete, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { UsuarioActual } from '../auth/decorators/usuario-actual.decorator';
import { JwtGuard } from '../auth/guards/jwt.guard';
import { ActualizarProyectoDto } from './dto/actualizar-proyecto.dto';
import { CrearProyectoDto } from './dto/crear-proyecto.dto';
import { ProyectosService } from './proyectos.service';
import type { ProyectoCreado } from './proyectos.service';

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
}
