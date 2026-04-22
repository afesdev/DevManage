import { ApiProperty } from '@nestjs/swagger';
import { IsHexColor, IsOptional, IsString, MaxLength } from 'class-validator';

export class ActualizarEtiquetaDto {
  @ApiProperty({ required: false, example: 'backend-core' })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  nombre?: string;

  @ApiProperty({ required: false, example: '#6d28d9' })
  @IsOptional()
  @IsHexColor()
  color?: string;
}
