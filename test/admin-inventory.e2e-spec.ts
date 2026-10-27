import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/app.setup.js';
import { PrismaService } from '../src/infra/prisma/prisma.service.js';
import {
  AdminGuard,
  type RequestWithAdmin,
} from '../src/modules/auth/admin.guard.js';

const PRODUCT_ID = '44444444-4444-4444-8444-444444444444';
const ACTOR_ID = 'e2e-admin';
const NOW = new Date('2026-10-27T00:00:00Z');

const itemRow = {
  product_id: PRODUCT_ID,
  on_hand: 5,
  reserved: 1,
  low_stock_threshold: 2,
  updated_at: NOW,
};

const movementRow = {
  id: '88888888-8888-4888-8888-888888888888',
  product_id: PRODUCT_ID,
  type: 'RECEIPT',
  quantity: 10,
  order_id: null,
  reason: 'მიწოდება',
  actor_id: ACTOR_ID,
  created_at: NOW,
};

const txStub = {
  $executeRaw: async () => 1,
  inventoryItem: {
    findUnique: async () => itemRow,
    findUniqueOrThrow: async () => itemRow,
  },
  stockMovement: {
    create: async ({ data }: { data: Record<string, unknown> }) => ({
      ...movementRow,
      ...data,
    }),
  },
};

const prismaStub = {
  $connect: async () => {},
  isHealthy: async () => true,
  $transaction: async (arg: unknown) =>
    typeof arg === 'function'
      ? (arg as (tx: unknown) => unknown)(txStub)
      : Promise.all(arg as Promise<unknown>[]),
  // COUNT(*) ბაზიდან bigint-ად მოდის — სერვისმა number-ად უნდა გადაიყვანოს
  $queryRaw: async () => [{ total: 1n }],
  $queryRawUnsafe: async () => [itemRow],
  inventoryItem: {
    upsert: async () => itemRow,
    count: async () => 1,
    createMany: async () => ({ count: 0 }),
    update: async () => itemRow,
  },
  stockMovement: {
    findMany: async () => [movementRow],
    count: async () => 1,
  },
  product: {
    findUnique: async () => ({ id: PRODUCT_ID }),
    count: async () => 1,
    findMany: async () => [
      {
        id: PRODUCT_ID,
        sku: 'CBL-T2-32-5',
        slug: 'type2-cable-32a-5m',
        status: 'ACTIVE',
        translations: [{ locale: 'ka', name: 'Type 2 კაბელი' }],
      },
    ],
  },
};

describe('Admin inventory (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PrismaService)
      .useValue(prismaStub)
      // guard-ის ნაცვლად ადმინს ხელით ვურთავთ: `@CurrentAdmin()`-ს ის სჭირდება
      .overrideGuard(AdminGuard)
      .useValue({
        canActivate: (ctx: {
          switchToHttp: () => { getRequest: () => RequestWithAdmin };
        }) => {
          ctx.switchToHttp().getRequest().admin = {
            id: ACTOR_ID,
            roles: ['warehouse'],
          };
          return true;
        },
      })
      .compile();
    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /v1/admin/inventory', async () => {
    const res = await request(app.getHttpServer()).get('/v1/admin/inventory');

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ page: 1, page_size: 24, total: 1 });
    expect(res.body.items[0]).toMatchObject({
      product_id: PRODUCT_ID,
      on_hand: 5,
      reserved: 1,
      available: 4,
      is_low_stock: false,
    });
    expect(res.body.items[0].product.sku).toBe('CBL-T2-32-5');
  });

  it('GET /v1/admin/inventory?low_stock=true', async () => {
    const res = await request(app.getHttpServer()).get(
      '/v1/admin/inventory?low_stock=true',
    );

    expect(res.status).toBe(200);
  });

  it('არასწორი sort → 400', async () => {
    const res = await request(app.getHttpServer()).get(
      '/v1/admin/inventory?sort=cheapest',
    );

    expect(res.status).toBe(400);
  });

  it('GET /v1/admin/inventory/{product_id}', async () => {
    const res = await request(app.getHttpServer()).get(
      `/v1/admin/inventory/${PRODUCT_ID}`,
    );

    expect(res.status).toBe(200);
    expect(res.body.available).toBe(4);
  });

  it('არა-uuid product_id → 400', async () => {
    const res = await request(app.getHttpServer()).get(
      '/v1/admin/inventory/not-a-uuid',
    );

    expect(res.status).toBe(400);
  });

  it('PATCH ზღვარს ცვლის', async () => {
    const res = await request(app.getHttpServer())
      .patch(`/v1/admin/inventory/${PRODUCT_ID}`)
      .send({ low_stock_threshold: 5 });

    expect(res.status).toBe(200);
  });

  it('PATCH უარყოფითი ზღვრით → 400', async () => {
    const res = await request(app.getHttpServer())
      .patch(`/v1/admin/inventory/${PRODUCT_ID}`)
      .send({ low_stock_threshold: -1 });

    expect(res.status).toBe(400);
  });

  it('POST movements: ჩანაწერში ავტორი guard-იდან იწერება', async () => {
    const res = await request(app.getHttpServer())
      .post(`/v1/admin/inventory/${PRODUCT_ID}/movements`)
      .send({ type: 'RECEIPT', quantity: 10, reason: 'მიწოდება' });

    expect(res.status).toBe(201);
    expect(res.body.movement).toMatchObject({
      type: 'RECEIPT',
      quantity: 10,
      actor_id: ACTOR_ID,
    });
    expect(res.body.inventory).toMatchObject({ on_hand: 5, available: 4 });
  });

  it('POST movements: quantity = 0 → 400', async () => {
    const res = await request(app.getHttpServer())
      .post(`/v1/admin/inventory/${PRODUCT_ID}/movements`)
      .send({ type: 'ADJUSTMENT', quantity: 0 });

    expect(res.status).toBe(400);
    expect(res.body.errors.join(' ')).toContain('quantity');
  });

  it('POST movements: ფრაქციული quantity → 400', async () => {
    const res = await request(app.getHttpServer())
      .post(`/v1/admin/inventory/${PRODUCT_ID}/movements`)
      .send({ type: 'RECEIPT', quantity: 1.5 });

    expect(res.status).toBe(400);
  });

  it('POST movements: უცნობი type → 400', async () => {
    const res = await request(app.getHttpServer())
      .post(`/v1/admin/inventory/${PRODUCT_ID}/movements`)
      .send({ type: 'STOLEN', quantity: -1 });

    expect(res.status).toBe(400);
  });

  it('POST movements: RECEIPT უარყოფითით → 422 INVALID_MOVEMENT_SIGN', async () => {
    const res = await request(app.getHttpServer())
      .post(`/v1/admin/inventory/${PRODUCT_ID}/movements`)
      .send({ type: 'RECEIPT', quantity: -3 });

    expect(res.status).toBe(422);
    expect(res.headers['content-type']).toContain('application/problem+json');
    expect(res.body.code).toBe('INVALID_MOVEMENT_SIGN');
  });

  it('GET movements: ისტორია', async () => {
    const res = await request(app.getHttpServer()).get(
      `/v1/admin/inventory/${PRODUCT_ID}/movements`,
    );

    expect(res.status).toBe(200);
    expect(res.body.total).toBe(1);
    expect(res.body.items[0]).toMatchObject({ type: 'RECEIPT', quantity: 10 });
  });

  it('GET movements: არასწორი type ფილტრი → 400', async () => {
    const res = await request(app.getHttpServer()).get(
      `/v1/admin/inventory/${PRODUCT_ID}/movements?type=STOLEN`,
    );

    expect(res.status).toBe(400);
  });
});

describe('Admin inventory guard (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PrismaService)
      .useValue(prismaStub)
      .compile();
    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  /** ტესტები `NODE_ENV=test`-ზე გარბიან, ანუ development-ის გარეთ — endpoint დახურულია */
  it('development-ის გარეთ მარაგის endpoint-ი დახურულია', async () => {
    const res = await request(app.getHttpServer()).get('/v1/admin/inventory');

    expect(res.status).toBe(503);
    expect(res.body.code).toBe('AUTH_NOT_CONFIGURED');
  });
});
