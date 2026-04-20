import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';
import { DatabaseService } from './../src/database/database.service';

describe('Health (e2e)', () => {
  let app: INestApplication<App>;

  beforeEach(async () => {
    process.env.DB_SERVER ??= 'localhost';
    process.env.DB_NAME ??= 'test';
    process.env.DB_USER ??= 'test';
    process.env.DB_PASSWORD ??= 'test';

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(DatabaseService)
      .useValue({
        query: async () => [],
        queryOne: async () => ({ ok: 1 }),
        execute: async () => ({ returnValue: 0 }),
      })
      .compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
        transformOptions: { enableImplicitConversion: true },
      }),
    );
    await app.init();
  });

  it('/health (GET)', () => {
    return request(app.getHttpServer())
      .get('/health')
      .expect(200)
      .expect((res) => {
        expect(res.body.estado).toBe('ok');
        expect(res.body.marca_tiempo).toBeDefined();
      });
  });

  it('/health/db (GET)', () => {
    return request(app.getHttpServer())
      .get('/health/db')
      .expect(200)
      .expect((res) => {
        expect(res.body.estado).toBe('ok');
        expect(res.body.base_de_datos).toBe('accesible');
      });
  });

  afterEach(async () => {
    await app.close();
  });
});
