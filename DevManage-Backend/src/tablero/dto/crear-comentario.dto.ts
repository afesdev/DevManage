import { ApiProperty } from '@nestjs/swagger';
import { IsString, MaxLength } from 'class-validator';

export class CrearComentarioDto {
  @ApiProperty({ example: 'Validado en QA. Pendiente paso a main prueba.' })
  @IsString()
  @MaxLength(4000)
  contenido: string;
}
