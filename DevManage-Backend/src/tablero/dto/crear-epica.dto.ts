import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

export class CrearEpicaDto {
  @ApiProperty({ example: 'Autenticación y permisos' })
  @IsString()
  @MaxLength(200)
  titulo: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  descripcion?: string;

  @ApiProperty({
    required: false,
    example: 'abierta',
    enum: ['abierta', 'en_progreso', 'terminada', 'cancelada'],
  })
  @IsOptional()
  @IsIn(['abierta', 'en_progreso', 'terminada', 'cancelada'])
  estado?: 'abierta' | 'en_progreso' | 'terminada' | 'cancelada';
}
