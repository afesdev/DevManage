import { Controller, Get } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';

@Controller('health')
export class HealthController {
  constructor(private readonly database: DatabaseService) {}

  @Get()
  obtenerEstado(): { estado: string; marca_tiempo: string } {
    return {
      estado: 'ok',
      marca_tiempo: new Date().toISOString(),
    };
  }

  @Get('db')
  async obtenerEstadoBaseDeDatos(): Promise<{
    estado: string;
    base_de_datos: string;
    marca_tiempo: string;
  }> {
    await this.database.queryOne<{ ok: number }>('SELECT 1 AS ok');
    return {
      estado: 'ok',
      base_de_datos: 'accesible',
      marca_tiempo: new Date().toISOString(),
    };
  }
}
