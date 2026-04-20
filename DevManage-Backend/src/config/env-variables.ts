import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsNumber,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';

export class EnvVariables {
  @IsOptional()
  @Transform(({ value }) => {
    if (value === undefined || value === '') {
      return 3000;
    }
    return parseInt(String(value), 10);
  })
  @IsNumber()
  @Min(1)
  PORT: number;

  @IsOptional()
  @IsString()
  CORS_ORIGIN?: string;

  @IsString()
  DB_SERVER: string;

  @IsOptional()
  @Transform(({ value }) => {
    if (value === undefined || value === '') {
      return 1433;
    }
    return parseInt(String(value), 10);
  })
  @IsNumber()
  @Min(1)
  DB_PORT: number;

  @IsOptional()
  @Transform(({ value }) => {
    if (value === undefined || value === '') {
      return 30000;
    }
    return parseInt(String(value), 10);
  })
  @IsNumber()
  @Min(1000)
  DB_CONNECT_TIMEOUT_MS: number;

  @IsString()
  DB_NAME: string;

  @IsString()
  DB_USER: string;

  @IsString()
  DB_PASSWORD: string;

  @IsOptional()
  @Transform(({ value }) => value !== 'false' && value !== '0')
  @IsBoolean()
  DB_ENCRYPT = true;

  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === '1')
  @IsBoolean()
  DB_TRUST_SERVER_CERTIFICATE = false;

  @IsOptional()
  @IsString()
  JWT_SECRET?: string;

  @IsOptional()
  @IsString()
  JWT_EXPIRES_IN?: string;

  @IsOptional()
  @IsString()
  GITHUB_WEBHOOK_SECRET?: string;

  @IsOptional()
  @IsString()
  GITHUB_TOKEN?: string;

  @IsOptional()
  @IsString()
  GITHUB_CLIENT_ID?: string;

  @IsOptional()
  @IsString()
  GITHUB_CLIENT_SECRET?: string;

  @IsOptional()
  @IsString()
  GITHUB_OAUTH_CALLBACK_URL?: string;

  @IsOptional()
  @IsString()
  FRONTEND_URL?: string;
}
