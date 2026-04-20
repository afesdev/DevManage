import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';

export class ActualizarPaginaDto {
  @ApiProperty({ required: false, example: 'Arquitectura backend v2' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  titulo?: string;

  @ApiProperty({ required: false, example: 'arquitectura-backend-v2' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  slug?: string;

  @ApiProperty({ required: false, example: '# Arquitectura\n\nContenido actualizado...' })
  @IsOptional()
  @IsString()
  contenido_md?: string;
}
