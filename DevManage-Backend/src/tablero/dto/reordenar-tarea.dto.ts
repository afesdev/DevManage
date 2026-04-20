import { ApiProperty } from '@nestjs/swagger';
import { IsInt, IsUUID, Min } from 'class-validator';

export class ReordenarTareaDto {
  @ApiProperty({ example: '550e8400-e29b-41d4-a716-446655440010' })
  @IsUUID()
  columna_id: string;

  @ApiProperty({ example: 0 })
  @IsInt()
  @Min(0)
  posicion: number;
}
