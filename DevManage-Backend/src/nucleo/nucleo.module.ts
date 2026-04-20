import { Module } from '@nestjs/common';
import { ProyectosController } from './proyectos.controller';
import { ProyectosService } from './proyectos.service';
import { UsuariosController } from './usuarios.controller';
import { UsuariosService } from './usuarios.service';

@Module({
  controllers: [UsuariosController, ProyectosController],
  providers: [UsuariosService, ProyectosService],
})
export class NucleoModule {}
