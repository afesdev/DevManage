import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import {
  appConfiguration,
  authConfiguration,
  databaseConfiguration,
  githubConfiguration,
} from './config/configuration';
import { AuthModule } from './auth/auth.module';
import { validateEnv } from './config/validate-env';
import { DatabaseModule } from './database/database.module';
import { DocumentosModule } from './documentos/documentos.module';
import { GithubModule } from './github/github.module';
import { HealthModule } from './health/health.module';
import { NucleoModule } from './nucleo/nucleo.module';
import { TableroModule } from './tablero/tablero.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validate: validateEnv,
      load: [appConfiguration, databaseConfiguration, authConfiguration, githubConfiguration],
      envFilePath: ['.env'],
    }),
    DatabaseModule,
    HealthModule,
    AuthModule,
    NucleoModule,
    TableroModule,
    DocumentosModule,
    GithubModule,
  ],
})
export class AppModule {}
