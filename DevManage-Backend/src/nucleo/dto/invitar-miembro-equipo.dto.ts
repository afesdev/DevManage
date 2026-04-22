import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsIn, IsOptional, IsUUID } from 'class-validator';

export class InvitarMiembroEquipoDto {
  @ApiProperty({ required: false, example: '550e8400-e29b-41d4-a716-446655440001' })
  @IsOptional()
  @IsUUID()
  usuario_id?: string;

  @ApiProperty({ required: false, example: 'persona@empresa.com' })
  @IsOptional()
  @IsEmail()
  correo?: string;

  @ApiProperty({ required: false, enum: ['administrador', 'miembro'], example: 'miembro' })
  @IsOptional()
  @IsIn(['administrador', 'miembro'])
  rol?: 'administrador' | 'miembro';
}
