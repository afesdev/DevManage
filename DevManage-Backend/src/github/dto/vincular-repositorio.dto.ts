import { ApiProperty } from '@nestjs/swagger';
import { IsInt, IsOptional, IsString, IsUUID, MaxLength, Min } from 'class-validator';

export class VincularRepositorioDto {
  @ApiProperty({ example: '550e8400-e29b-41d4-a716-446655440000' })
  @IsUUID()
  proyecto_id: string;

  @ApiProperty({ example: 'owner/devmanage-repo' })
  @IsString()
  @MaxLength(200)
  nombre_completo_github: string;

  @ApiProperty({ example: 123456789 })
  @IsInt()
  @Min(1)
  id_github: number;

  @ApiProperty({ required: false, example: 'main' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  rama_principal?: string;
}
