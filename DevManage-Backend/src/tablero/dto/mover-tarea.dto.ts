import { ApiProperty } from '@nestjs/swagger';
import { IsUUID } from 'class-validator';

export class MoverTareaDto {
  @ApiProperty({ example: '550e8400-e29b-41d4-a716-446655440010' })
  @IsUUID()
  nueva_columna_id: string;
}
