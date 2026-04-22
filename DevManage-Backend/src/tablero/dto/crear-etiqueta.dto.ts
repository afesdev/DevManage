import { ApiProperty } from '@nestjs/swagger';
import { IsHexColor, IsOptional, IsString, MaxLength } from 'class-validator';

export class CrearEtiquetaDto {
  @ApiProperty({ example: 'backend' })
  @IsString()
  @MaxLength(50)
  nombre: string;

  @ApiProperty({ required: false, example: '#7c3aed' })
  @IsOptional()
  @IsHexColor()
  color?: string;
}
