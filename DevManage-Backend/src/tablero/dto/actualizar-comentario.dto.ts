import { ApiProperty } from '@nestjs/swagger';
import { IsString, MaxLength } from 'class-validator';

export class ActualizarComentarioDto {
  @ApiProperty({ example: 'Actualización: se aprobó despliegue.' })
  @IsString()
  @MaxLength(4000)
  contenido: string;
}
