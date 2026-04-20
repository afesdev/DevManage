import { IsOptional, IsString, MaxLength } from 'class-validator';

export class ActualizarProyectoDto {
  @IsOptional()
  @IsString()
  @MaxLength(100)
  nombre?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  descripcion?: string;
}
