import { ApiProperty } from '@nestjs/swagger';
import { IsUUID } from 'class-validator';

export class VincularEtiquetaDto {
  @ApiProperty({ example: '550e8400-e29b-41d4-a716-446655440001' })
  @IsUUID()
  etiqueta_id: string;
}
