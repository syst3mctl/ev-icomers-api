import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/app.setup.js';
import { PrismaService } from '../src/infra/prisma/prisma.service.js';

describe('Health (e2e)', () => {
  let app: INestApplication;
  let dbUp = true;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PrismaService)
      .useValue({ isHealthy: async () => dbUp, $connect: async () => {} })
      .compile();
    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /health/live', () =>
    request(app.getHttpServer())
      .get('/health/live')
      .expect(200, { status: 'ok' }));

  it('GET /health/ready when the database is up', () =>
    request(app.getHttpServer())
      .get('/health/ready')
      .expect(200, { status: 'ok' }));

  it('GET /health/ready returns problem+json when the database is down', async () => {
    dbUp = false;
    const res = await request(app.getHttpServer()).get('/health/ready');
    expect(res.status).toBe(503);
    expect(res.headers['content-type']).toContain('application/problem+json');
    expect(res.body.code).toBe('SERVICE_UNAVAILABLE');
    dbUp = true;
  });

  it('unknown route returns 404 problem+json', async () => {
    const res = await request(app.getHttpServer()).get('/v1/nope');
    expect(res.status).toBe(404);
    expect(res.body.code).toBe('NOT_FOUND');
  });
});
