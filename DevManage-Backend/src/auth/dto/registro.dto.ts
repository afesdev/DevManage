import { IsEmail, IsString, MaxLength, MinLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class RegistroDto {
  @ApiProperty({ example: 'andres.devmanage@ejemplo.com' })
  @IsEmail()
  correo: string;

  @ApiProperty({ example: 'Andres Developer' })
  @IsString()
  @MinLength(3)
  @MaxLength(100)
  nombre_visible: string;

  @ApiProperty({ example: 'DevManage123*' })
  @IsString()
  @MinLength(8)
  @MaxLength(100)
  contrasena: string;
}
