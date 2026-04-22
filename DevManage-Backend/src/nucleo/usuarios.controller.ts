import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { UsuarioActual } from '../auth/decorators/usuario-actual.decorator';
import { JwtGuard } from '../auth/guards/jwt.guard';
import { UsuariosService } from './usuarios.service';
import type { UsuarioBasico, UsuarioPerfil } from './usuarios.service';

@ApiTags('nucleo')
@ApiBearerAuth()
@UseGuards(JwtGuard)
@Controller('nucleo/usuarios')
export class UsuariosController {
  constructor(private readonly usuariosService: UsuariosService) {}

  @ApiOperation({ summary: 'Obtener perfil del usuario autenticado' })
  @Get('yo')
  obtenerPerfilActual(@UsuarioActual('sub') usuarioId: string): Promise<UsuarioPerfil> {
    return this.usuariosService.obtenerPerfil(usuarioId);
  }

  @ApiOperation({ summary: 'Listar usuarios activos para selección' })
  @Get()
  obtenerUsuariosActivos(): Promise<UsuarioBasico[]> {
    return this.usuariosService.obtenerUsuariosActivos();
  }
}
