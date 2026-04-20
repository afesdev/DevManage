import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { apiReference } from '@scalar/nestjs-api-reference';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { rawBody: true });
  const config = app.get(ConfigService);

  const expressApp = app.getHttpAdapter().getInstance();
  expressApp.set('trust proxy', 1);

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  const corsOrigins = config.getOrThrow<string[]>('app.corsOrigins');
  app.enableCors({
    origin: corsOrigins,
    credentials: true,
  });

  const port = config.getOrThrow<number>('app.port');
  const openApiConfig = new DocumentBuilder()
    .setTitle('DevManage API')
    .setDescription('Documentacion interactiva del backend de DevManage')
    .setVersion('1.0.0')
    .build();
  const openApiDocument = SwaggerModule.createDocument(app, openApiConfig);
  SwaggerModule.setup('openapi', app, openApiDocument);

  app.use(
    '/docs',
    apiReference({
      content: openApiDocument,
      theme: 'purple',
      pageTitle: 'DevManage API - Scalar',
    }),
  );

  await app.listen(port);
  const baseUrl = await app.getUrl();
  const dbConfig = config.getOrThrow<{
    server: string;
    port: number;
    database: string;
    options: { encrypt: boolean; trustServerCertificate: boolean; connectTimeout: number };
  }>('database');
  console.log(
    `Backend DevManage iniciado en ${baseUrl}
- Docs Scalar: ${baseUrl}/docs
- OpenAPI: ${baseUrl}/openapi
- Health: ${baseUrl}/health
- Health DB: ${baseUrl}/health/db
- BD destino: ${dbConfig.server}:${dbConfig.port} / ${dbConfig.database}
- TLS: encrypt=${dbConfig.options.encrypt}, trustServerCertificate=${dbConfig.options.trustServerCertificate}, timeout=${dbConfig.options.connectTimeout}ms
- CORS origins: ${corsOrigins.join(', ')}`,
  );
}

bootstrap();
