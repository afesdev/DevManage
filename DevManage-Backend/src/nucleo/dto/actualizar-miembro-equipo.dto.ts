import { ApiProperty } from '@nestjs/swagger';
import { IsIn } from 'class-validator';

export class ActualizarMiembroEquipoDto {
  @ApiProperty({ enum: ['administrador', 'miembro'], example: 'administrador' })
  @IsIn(['administrador', 'miembro'])
  rol: 'administrador' | 'miembro';
}
