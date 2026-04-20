import { ApiProperty } from '@nestjs/swagger';
import { IsDateString, IsIn, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

export class CrearTareaDto {
  @ApiProperty({ example: '550e8400-e29b-41d4-a716-446655440000' })
  @IsUUID()
  proyecto_id: string;

  @ApiProperty({ example: '550e8400-e29b-41d4-a716-446655440001' })
  @IsUUID()
  columna_id: string;

  @ApiProperty({ example: 'Implementar login JWT' })
  @IsString()
  @MaxLength(300)
  titulo: string;

  @ApiProperty({ required: false, example: 'Con endpoint de refresh y guard global.' })
  @IsOptional()
  @IsString()
  descripcion?: string;

  @ApiProperty({ required: false, example: 'tarea', enum: ['tarea', 'subtarea', 'error'] })
  @IsOptional()
  @IsIn(['tarea', 'subtarea', 'error'])
  tipo?: 'tarea' | 'subtarea' | 'error';

  @ApiProperty({
    required: false,
    example: 'media',
    enum: ['critica', 'alta', 'media', 'baja'],
  })
  @IsOptional()
  @IsIn(['critica', 'alta', 'media', 'baja'])
  prioridad?: 'critica' | 'alta' | 'media' | 'baja';

  @ApiProperty({ required: false, example: '550e8400-e29b-41d4-a716-446655440002' })
  @IsOptional()
  @IsUUID()
  epica_id?: string;

  @ApiProperty({ required: false, example: '550e8400-e29b-41d4-a716-446655440003' })
  @IsOptional()
  @IsUUID()
  tarea_padre_id?: string;

  @ApiProperty({ required: false, example: '550e8400-e29b-41d4-a716-446655440004' })
  @IsOptional()
  @IsUUID()
  responsable_id?: string;

  @ApiProperty({ required: false, example: '2026-05-01' })
  @IsOptional()
  @IsDateString()
  fecha_limite?: string;
}
