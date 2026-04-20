import { IsEmail, IsString, MaxLength, MinLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class LoginDto {
  @ApiProperty({ example: 'andres.devmanage@ejemplo.com' })
  @IsEmail()
  correo: string;

  @ApiProperty({ example: 'DevManage123*' })
  @IsString()
  @MinLength(8)
  @MaxLength(100)
  contrasena: string;
}
