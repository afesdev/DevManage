import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

export class CrearPaginaDto {
  @ApiProperty({ example: '550e8400-e29b-41d4-a716-446655440000' })
  @IsUUID()
  proyecto_id: string;

  @ApiProperty({ required: false, example: '550e8400-e29b-41d4-a716-446655440001' })
  @IsOptional()
  @IsUUID()
  pagina_padre_id?: string;

  @ApiProperty({ example: 'Arquitectura backend' })
  @IsString()
  @MaxLength(200)
  titulo: string;

  @ApiProperty({ example: 'arquitectura-backend' })
  @IsString()
  @MaxLength(200)
  slug: string;

  @ApiProperty({ required: false, example: '# Arquitectura\n\nContenido inicial...' })
  @IsOptional()
  @IsString()
  contenido_md?: string;
}
