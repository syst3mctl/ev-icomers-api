import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/app.setup.js';
import { PrismaService } from '../src/infra/prisma/prisma.service.js';
import { AdminGuard } from '../src/modules/auth/admin.guard.js';

const BRAND_ID = '55555555-5555-4555-8555-555555555555';
const MODEL_ID = '66666666-6666-4666-8666-666666666666';
const PRODUCT_ID = '44444444-4444-4444-8444-444444444444';
const NOW = new Date('2026-10-27T00:00:00Z');

const brandRow = {
  id: BRAND_ID,
  slug: 'wallbox',
  name: 'Wallbox',
  logo_key: null,
  sort_order: 0,
  is_active: true,
  created_at: NOW,
  updated_at: NOW,
  _count: { models: 1 },
};

const modelRow = {
  id: MODEL_ID,
  brand_id: BRAND_ID,
  slug: 'pulsar-plus',
  name: 'Pulsar Plus',
  revision: 'Gen 2',
  power_kw: '22.00',
  image_key: null,
  is_active: true,
  created_at: NOW,
  updated_at: NOW,
  brand: { slug: 'wallbox', name: 'Wallbox' },
  _count: { products: 0 },
};

const linkRow = {
  charger_model_id: MODEL_ID,
  note: null,
  charger_model: {
    slug: 'pulsar-plus',
    name: 'Pulsar Plus',
    revision: 'Gen 2',
    power_kw: '22.00',
    brand_id: BRAND_ID,
    brand: { slug: 'wallbox', name: 'Wallbox' },
  },
};

/** ბაზა არ გვჭირდება: მოწმდება route-ები, ვალიდაცია და პასუხის ფორმა */
const prismaStub = {
  $connect: async () => {},
  isHealthy: async () => true,
  $transaction: async (arg: unknown) =>
    Array.isArray(arg) ? Promise.all(arg) : arg,
  chargerBrand: {
    findMany: async () => [brandRow],
    count: async () => 1,
    findUnique: async () => brandRow,
    create: async () => brandRow,
    update: async () => brandRow,
    delete: async () => brandRow,
  },
  chargerModel: {
    findMany: async () => [modelRow],
    // ბრენდს ერთი მოდელი აქვს → წაშლა არ უნდა მოხდეს
    count: async () => 1,
    findUnique: async () => modelRow,
    create: async () => modelRow,
    update: async () => modelRow,
    delete: async () => modelRow,
  },
  productCompatibility: {
    findMany: async () => [linkRow],
    count: async () => 1,
    deleteMany: async () => ({ count: 1 }),
    createMany: async () => ({ count: 1 }),
  },
  product: {
    findUnique: async () => ({ id: PRODUCT_ID, is_universal: false }),
    findMany: async () => [
      {
        id: PRODUCT_ID,
        sku: 'CBL-T2-32-5',
        slug: 'type2-cable-32a-5m',
        status: 'ACTIVE',
        translations: [{ locale: 'ka', name: 'Type 2 კაბელი' }],
      },
    ],
    update: async () => ({ id: PRODUCT_ID }),
  },
};

describe('Admin compatibility (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PrismaService)
      .useValue(prismaStub)
      .overrideGuard(AdminGuard)
      .useValue({ canActivate: () => true })
      .compile();
    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  describe('charger-brands', () => {
    it('GET /v1/admin/charger-brands', async () => {
      const res = await request(app.getHttpServer()).get(
        '/v1/admin/charger-brands',
      );

      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ page: 1, page_size: 24, total: 1 });
      expect(res.body.items[0]).toMatchObject({
        slug: 'wallbox',
        name: 'Wallbox',
        model_count: 1,
      });
    });

    it('?is_active=false იღებება (boolean query)', async () => {
      const res = await request(app.getHttpServer()).get(
        '/v1/admin/charger-brands?is_active=false',
      );

      expect(res.status).toBe(200);
    });

    it('?is_active=maybe → 400', async () => {
      const res = await request(app.getHttpServer()).get(
        '/v1/admin/charger-brands?is_active=maybe',
      );

      expect(res.status).toBe(400);
      expect(res.body.errors.join(' ')).toContain('is_active');
    });

    it('POST /v1/admin/charger-brands → 201', async () => {
      const res = await request(app.getHttpServer())
        .post('/v1/admin/charger-brands')
        .send({ slug: 'wallbox', name: 'Wallbox' });

      expect(res.status).toBe(201);
      expect(res.body.slug).toBe('wallbox');
    });

    it('არასწორი slug → 400 problem+json', async () => {
      const res = await request(app.getHttpServer())
        .post('/v1/admin/charger-brands')
        .send({ slug: 'Wall Box', name: 'Wallbox' });

      expect(res.status).toBe(400);
      expect(res.headers['content-type']).toContain('application/problem+json');
      expect(res.body.errors.join(' ')).toContain('slug');
    });

    // stub-ში ბრენდს მოდელი აქვს → წაშლა არ უნდა მოხდეს
    it('DELETE მოდელების მქონე ბრენდზე → 409 CHARGER_BRAND_NOT_EMPTY', async () => {
      const res = await request(app.getHttpServer()).delete(
        `/v1/admin/charger-brands/${BRAND_ID}`,
      );

      expect(res.status).toBe(409);
      expect(res.body.code).toBe('CHARGER_BRAND_NOT_EMPTY');
    });
  });

  describe('charger-models', () => {
    it('GET /v1/admin/charger-models — power_kw რიცხვია', async () => {
      const res = await request(app.getHttpServer()).get(
        '/v1/admin/charger-models',
      );

      expect(res.status).toBe(200);
      expect(res.body.items[0]).toMatchObject({
        slug: 'pulsar-plus',
        brand_slug: 'wallbox',
        power_kw: 22,
      });
    });

    it('POST /v1/admin/charger-models → 201', async () => {
      const res = await request(app.getHttpServer())
        .post('/v1/admin/charger-models')
        .send({
          brand_id: BRAND_ID,
          slug: 'pulsar-plus',
          name: 'Pulsar Plus',
          power_kw: 22,
        });

      expect(res.status).toBe(201);
      expect(res.body.id).toBe(MODEL_ID);
    });

    it('power_kw სამი ათწილადით → 400', async () => {
      const res = await request(app.getHttpServer())
        .post('/v1/admin/charger-models')
        .send({
          brand_id: BRAND_ID,
          slug: 'pulsar-plus',
          name: 'Pulsar Plus',
          power_kw: 22.123,
        });

      expect(res.status).toBe(400);
      expect(res.body.errors.join(' ')).toContain('power_kw');
    });

    it('POST /v1/admin/charger-models/{id}/products', async () => {
      const res = await request(app.getHttpServer())
        .post(`/v1/admin/charger-models/${MODEL_ID}/products`)
        .send({ product_ids: [PRODUCT_ID] });

      expect(res.status).toBe(201);
      expect(res.body).toMatchObject({
        charger_model_id: MODEL_ID,
        added: 1,
        skipped: 0,
        total: 1,
      });
      expect(res.body.products[0].sku).toBe('CBL-T2-32-5');
    });

    it('ცარიელი product_ids → 400', async () => {
      const res = await request(app.getHttpServer())
        .post(`/v1/admin/charger-models/${MODEL_ID}/products`)
        .send({ product_ids: [] });

      expect(res.status).toBe(400);
    });

    // stub-ში მოდელზე ერთი პროდუქტია მიბმული → წაშლა არ უნდა მოხდეს
    it('DELETE მიბმულ მოდელზე → 409 CHARGER_MODEL_IN_USE', async () => {
      const res = await request(app.getHttpServer()).delete(
        `/v1/admin/charger-models/${MODEL_ID}`,
      );

      expect(res.status).toBe(409);
      expect(res.body.code).toBe('CHARGER_MODEL_IN_USE');
    });

    it('DELETE /v1/admin/charger-models/{id}/products/{product_id} → 204', async () => {
      const res = await request(app.getHttpServer()).delete(
        `/v1/admin/charger-models/${MODEL_ID}/products/${PRODUCT_ID}`,
      );

      expect(res.status).toBe(204);
    });

    it('არა-uuid product_ids → 400', async () => {
      const res = await request(app.getHttpServer())
        .post(`/v1/admin/charger-models/${MODEL_ID}/products`)
        .send({ product_ids: ['not-a-uuid'] });

      expect(res.status).toBe(400);
    });
  });

  describe('products/{id}/compatibility', () => {
    it('GET აბრუნებს თავსებად მოდელებს', async () => {
      const res = await request(app.getHttpServer()).get(
        `/v1/admin/products/${PRODUCT_ID}/compatibility`,
      );

      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({
        product_id: PRODUCT_ID,
        is_universal: false,
      });
      expect(res.body.models[0]).toMatchObject({
        charger_model_id: MODEL_ID,
        brand_name: 'Wallbox',
        model_name: 'Pulsar Plus',
      });
    });

    it('PUT ანაცვლებს სიას', async () => {
      const res = await request(app.getHttpServer())
        .put(`/v1/admin/products/${PRODUCT_ID}/compatibility`)
        .send({ model_ids: [MODEL_ID], is_universal: false });

      expect(res.status).toBe(200);
      expect(res.body.models).toHaveLength(1);
    });

    it('PUT ცარიელი სიით მუშაობს', async () => {
      const res = await request(app.getHttpServer())
        .put(`/v1/admin/products/${PRODUCT_ID}/compatibility`)
        .send({ model_ids: [] });

      expect(res.status).toBe(200);
    });

    it('model_ids-ის გარეშე → 400', async () => {
      const res = await request(app.getHttpServer())
        .put(`/v1/admin/products/${PRODUCT_ID}/compatibility`)
        .send({ is_universal: true });

      expect(res.status).toBe(400);
      expect(res.body.errors.join(' ')).toContain('model_ids');
    });
  });
});
