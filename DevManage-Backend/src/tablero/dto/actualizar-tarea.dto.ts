import { ApiProperty } from '@nestjs/swagger';
import {
  IsDateString,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  ValidateIf,
} from 'class-validator';

export class ActualizarTareaDto {
  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MaxLength(300)
  titulo?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  descripcion?: string;

  @ApiProperty({ required: false, enum: ['tarea', 'subtarea', 'error'] })
  @IsOptional()
  @IsIn(['tarea', 'subtarea', 'error'])
  tipo?: 'tarea' | 'subtarea' | 'error';

  @ApiProperty({ required: false, enum: ['critica', 'alta', 'media', 'baja'] })
  @IsOptional()
  @IsIn(['critica', 'alta', 'media', 'baja'])
  prioridad?: 'critica' | 'alta' | 'media' | 'baja';

  @ApiProperty({ required: false })
  @IsOptional()
  @ValidateIf((_, v) => v !== undefined && v !== null && v !== '')
  @IsDateString()
  fecha_limite?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @ValidateIf((_, v) => v !== undefined && v !== null && v !== '')
  @IsUUID()
  epica_id?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @ValidateIf((_, v) => v !== undefined && v !== null && v !== '')
  @IsUUID()
  tarea_padre_id?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @ValidateIf((_, v) => v !== undefined && v !== null && v !== '')
  @IsUUID()
  responsable_id?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @ValidateIf((_, v) => v !== undefined && v !== null && v !== '')
  @IsUUID()
  columna_id?: string;
}
