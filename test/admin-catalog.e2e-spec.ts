import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/app.setup.js';
import { PrismaService } from '../src/infra/prisma/prisma.service.js';
import { AdminGuard } from '../src/modules/auth/admin.guard.js';

const CATEGORY_ID = '11111111-1111-4111-8111-111111111111';
const PRODUCT_ID = '44444444-4444-4444-8444-444444444444';

const categoryRow = {
  id: CATEGORY_ID,
  parent_id: null,
  slug: 'cables',
  sort_order: 0,
  is_active: true,
  created_at: new Date('2026-10-27T00:00:00Z'),
  updated_at: new Date('2026-10-27T00:00:00Z'),
  translations: [
    {
      locale: 'ka',
      name: 'კაბელები',
      description: null,
      seo_title: null,
      seo_description: null,
    },
  ],
  _count: { products: 2 },
};

const productRow = {
  id: PRODUCT_ID,
  sku: 'CBL-T2-32-5',
  slug: 'type2-cable-32a-5m',
  status: 'ACTIVE',
  category_id: CATEGORY_ID,
  price_minor: 32900,
  compare_at_price_minor: null,
  vat_rate_bp: 1800,
  oem_part_numbers: [],
  attributes: { connector: 'Type 2' },
  is_universal: false,
  is_featured: false,
  weight_g: null,
  created_at: new Date('2026-10-27T00:00:00Z'),
  updated_at: new Date('2026-10-27T00:00:00Z'),
  category: { slug: 'cables' },
  translations: [
    {
      locale: 'ka',
      name: 'Type 2 კაბელი',
      short_description: null,
      description: null,
      seo_title: null,
      seo_description: null,
    },
  ],
  images: [],
};

/** ბაზა არ გვჭირდება: მოწმდება route-ები, ვალიდაცია, პასუხის ფორმა და guard */
const prismaStub = {
  $connect: async () => {},
  isHealthy: async () => true,
  category: {
    findMany: async () => [categoryRow],
    count: async () => 1,
    findUnique: async () => categoryRow,
    create: async () => categoryRow,
    update: async () => categoryRow,
    delete: async () => categoryRow,
  },
  product: {
    findMany: async () => [productRow],
    count: async () => 1,
    findUnique: async () => productRow,
    create: async () => productRow,
    update: async () => productRow,
  },
};

describe('Admin catalog (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PrismaService)
      .useValue(prismaStub)
      // guard ცალკე იტესტება (იხ. ქვემოთ); აქ ვამოწმებთ endpoint-ებს
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

  describe('categories', () => {
    it('GET /v1/admin/categories', async () => {
      const res = await request(app.getHttpServer()).get(
        '/v1/admin/categories',
      );

      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ page: 1, page_size: 24, total: 1 });
      expect(res.body.items[0]).toMatchObject({
        slug: 'cables',
        product_count: 2,
        created_at: '2026-10-27T00:00:00.000Z',
      });
    });

    it('POST /v1/admin/categories აბრუნებს 201-ს', async () => {
      const res = await request(app.getHttpServer())
        .post('/v1/admin/categories')
        .send({
          slug: 'cables',
          translations: [{ locale: 'ka', name: 'კაბელები' }],
        });

      expect(res.status).toBe(201);
      expect(res.body.slug).toBe('cables');
    });

    it('არასწორი slug → 400 problem+json', async () => {
      const res = await request(app.getHttpServer())
        .post('/v1/admin/categories')
        .send({
          slug: 'Cables Ltd',
          translations: [{ locale: 'ka', name: 'კაბელები' }],
        });

      expect(res.status).toBe(400);
      expect(res.headers['content-type']).toContain('application/problem+json');
      expect(res.body.code).toBe('BAD_REQUEST');
      expect(res.body.errors.join(' ')).toContain('slug');
    });

    it('უცნობი ველები იჭრება (whitelist)', async () => {
      const res = await request(app.getHttpServer())
        .post('/v1/admin/categories')
        .send({
          slug: 'cables',
          translations: [{ locale: 'ka', name: 'კაბელები' }],
          is_admin: true,
        });

      expect(res.status).toBe(201);
    });

    it('არა-uuid id → 400', async () => {
      const res = await request(app.getHttpServer()).get(
        '/v1/admin/categories/not-a-uuid',
      );

      expect(res.status).toBe(400);
      expect(res.body.code).toBe('BAD_REQUEST');
    });

    // stub-ში კატეგორიას პროდუქტებიც აქვს და ქვეკატეგორიაც → წაშლა არ უნდა მოხდეს.
    // ცარიელი კატეგორიის წაშლა იტესტება categories.service.spec.ts-ში.
    it('DELETE არაცარიელ კატეგორიაზე → 409 CATEGORY_NOT_EMPTY', async () => {
      const res = await request(app.getHttpServer()).delete(
        `/v1/admin/categories/${CATEGORY_ID}`,
      );

      expect(res.status).toBe(409);
      expect(res.headers['content-type']).toContain('application/problem+json');
      expect(res.body.code).toBe('CATEGORY_NOT_EMPTY');
    });
  });

  describe('products', () => {
    it('GET /v1/admin/products', async () => {
      const res = await request(app.getHttpServer()).get(
        '/v1/admin/products?page=1&page_size=10&sort=price_asc',
      );

      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ page: 1, page_size: 10, total: 1 });
      expect(res.body.items[0]).toMatchObject({
        sku: 'CBL-T2-32-5',
        name: 'Type 2 კაბელი',
        price_minor: 32900,
      });
    });

    it('არასწორი sort → 400', async () => {
      const res = await request(app.getHttpServer()).get(
        '/v1/admin/products?sort=cheapest',
      );

      expect(res.status).toBe(400);
    });

    it('page_size > 100 → 400', async () => {
      const res = await request(app.getHttpServer()).get(
        '/v1/admin/products?page_size=500',
      );

      expect(res.status).toBe(400);
    });

    it('GET /v1/admin/products/{id} აბრუნებს თარგმანებს და სურათებს', async () => {
      const res = await request(app.getHttpServer()).get(
        `/v1/admin/products/${PRODUCT_ID}`,
      );

      expect(res.status).toBe(200);
      expect(res.body.translations[0].locale).toBe('ka');
      expect(res.body.images).toEqual([]);
      expect(res.body.attributes).toEqual({ connector: 'Type 2' });
    });

    it('POST /v1/admin/products: `ka` თარგმანის გარეშე → 422', async () => {
      const res = await request(app.getHttpServer())
        .post('/v1/admin/products')
        .send({
          sku: 'CBL-T2-32-5',
          slug: 'type2-cable-32a-5m',
          category_id: CATEGORY_ID,
          price_minor: 32900,
          translations: [{ locale: 'en', name: 'Type 2 cable' }],
        });

      expect(res.status).toBe(422);
      expect(res.body.code).toBe('TRANSLATION_REQUIRED');
    });

    it('ფასი ტექსტად → 400 (თანხა მხოლოდ მთელი რიცხვი, თეთრებში)', async () => {
      const res = await request(app.getHttpServer())
        .post('/v1/admin/products')
        .send({
          sku: 'CBL-T2-32-5',
          slug: 'type2-cable-32a-5m',
          category_id: CATEGORY_ID,
          price_minor: '329.00',
          translations: [{ locale: 'ka', name: 'Type 2 კაბელი' }],
        });

      expect(res.status).toBe(400);
      expect(res.body.errors.join(' ')).toContain('price_minor');
    });

    it('POST /v1/admin/products/{id}/archive', async () => {
      const res = await request(app.getHttpServer()).post(
        `/v1/admin/products/${PRODUCT_ID}/archive`,
      );

      expect(res.status).toBe(201);
      expect(res.body.id).toBe(PRODUCT_ID);
    });
  });
});

describe('Admin guard (e2e)', () => {
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

  /**
   * ტესტები NODE_ENV=test-ზე გარბიან (vitest.config.e2e.ts), ანუ development-ის გარეთ.
   * ეს სწორედ ის შემთხვევაა, რომელშიც ადმინის endpoint-ი დახურული უნდა იყოს,
   * სანამ Identity-ის ტოკენის შემოწმება არ დაემატება.
   */
  it('development-ის გარეთ ადმინის endpoint-ი დახურულია', async () => {
    const res = await request(app.getHttpServer()).get(
      '/v1/admin/categories',
    );

    expect(res.status).toBe(503);
    expect(res.headers['content-type']).toContain('application/problem+json');
    expect(res.body.code).toBe('AUTH_NOT_CONFIGURED');
  });

  it('საჯარო health endpoint კი მუშაობს', () =>
    request(app.getHttpServer())
      .get('/health/live')
      .expect(200, { status: 'ok' }));
});
