import { AppError } from '../../common/filters/problem-details.filter.js';
import { ProductStatus } from '../../generated/prisma/enums.js';
import type { PrismaService } from '../../infra/prisma/prisma.service.js';
import type { ListProductsQueryDto } from './dto/list-products.query.dto.js';
import type { CreateProductDto } from './dto/product.dto.js';
import { ProductsService } from './products.service.js';

const CATEGORY_ID = '33333333-3333-4333-8333-333333333333';
const PRODUCT_ID = '44444444-4444-4444-8444-444444444444';

function productStub(over: Record<string, unknown> = {}): Record<
  string,
  unknown
> {
  return {
    id: PRODUCT_ID,
    sku: 'CBL-T2-32-5',
    slug: 'type2-cable-32a-5m',
    status: ProductStatus.ACTIVE,
    category_id: CATEGORY_ID,
    price_minor: 32900,
    compare_at_price_minor: null,
    vat_rate_bp: 1800,
    oem_part_numbers: ['OEM-1'],
    attributes: { connector: 'Type 2' },
    is_universal: false,
    is_featured: false,
    weight_g: null,
    created_at: new Date('2026-10-27T00:00:00Z'),
    updated_at: new Date('2026-10-27T00:00:00Z'),
    category: { slug: 'cables' },
    translations: [
      {
        locale: 'en',
        name: 'Type 2 cable',
        short_description: null,
        description: null,
        seo_title: null,
        seo_description: null,
      },
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
    ...over,
  };
}

function makePrisma(over: Record<string, unknown> = {}): PrismaService {
  return {
    product: {
      findMany: async () => [],
      findUnique: async () => productStub(),
      count: async () => 0,
      create: async () => productStub(),
      update: async () => productStub(),
    },
    category: { findUnique: async () => ({ id: CATEGORY_ID }) },
    ...over,
  } as unknown as PrismaService;
}

const validDto: CreateProductDto = {
  sku: 'CBL-T2-32-5',
  slug: 'type2-cable-32a-5m',
  category_id: CATEGORY_ID,
  price_minor: 32900,
  translations: [{ locale: 'ka', name: 'Type 2 კაბელი' }],
};

const baseQuery: ListProductsQueryDto = {
  page: 1,
  page_size: 24,
  sort: 'newest',
};

async function expectAppError(
  promise: Promise<unknown>,
  status: number,
  code: string,
): Promise<void> {
  await expect(promise).rejects.toBeInstanceOf(AppError);
  await promise.catch((error: AppError) => {
    expect(error.getStatus()).toBe(status);
    expect(error.code).toBe(code);
  });
}

describe('ProductsService', () => {
  describe('list', () => {
    it('name ბრუნდება `ka`-ზე, თუნდაც თარგმანები სხვა რიგით იყოს', async () => {
      const service = new ProductsService(
        makePrisma({
          product: {
            findMany: async () => [productStub()],
            count: async () => 1,
          },
        }),
      );

      const result = await service.list(baseQuery);

      expect(result.items[0]).toMatchObject({
        name: 'Type 2 კაბელი',
        category_slug: 'cables',
        price_minor: 32900,
      });
      expect(result.total).toBe(1);
    });

    it('q: ეძებს SKU-ში, slug-ში, OEM ნომრებში და დასახელებაში', async () => {
      let captured: { where?: Record<string, unknown> } = {};
      const service = new ProductsService(
        makePrisma({
          product: {
            findMany: async (args: { where: Record<string, unknown> }) => {
              captured = args;
              return [];
            },
            count: async () => 0,
          },
        }),
      );

      await service.list({ ...baseQuery, q: ' T2 ' });

      const or = captured.where?.OR as Record<string, unknown>[];
      expect(or).toHaveLength(4);
      expect(or[0]).toEqual({ sku: { contains: 'T2', mode: 'insensitive' } });
      expect(or[2]).toEqual({ oem_part_numbers: { has: 'T2' } });
    });

    it('sort: price_asc → orderBy price_minor asc', async () => {
      let captured: { orderBy?: unknown } = {};
      const service = new ProductsService(
        makePrisma({
          product: {
            findMany: async (args: { orderBy: unknown }) => {
              captured = args;
              return [];
            },
            count: async () => 0,
          },
        }),
      );

      await service.list({ ...baseQuery, sort: 'price_asc' });

      expect(captured.orderBy).toEqual({ price_minor: 'asc' });
    });

    it('status და category_id ხვდება where-ში', async () => {
      let captured: { where?: Record<string, unknown> } = {};
      const service = new ProductsService(
        makePrisma({
          product: {
            findMany: async (args: { where: Record<string, unknown> }) => {
              captured = args;
              return [];
            },
            count: async () => 0,
          },
        }),
      );

      await service.list({
        ...baseQuery,
        status: ProductStatus.DRAFT,
        category_id: CATEGORY_ID,
      });

      expect(captured.where).toMatchObject({
        status: ProductStatus.DRAFT,
        category_id: CATEGORY_ID,
      });
    });
  });

  describe('create', () => {
    it('`ka` თარგმანის გარეშე → 422 TRANSLATION_REQUIRED', async () => {
      const service = new ProductsService(makePrisma());
      await expectAppError(
        service.create({
          ...validDto,
          translations: [{ locale: 'en', name: 'Cable' }],
        }),
        422,
        'TRANSLATION_REQUIRED',
      );
    });

    it('compare_at_price_minor <= price_minor → 422 INVALID_COMPARE_PRICE', async () => {
      const service = new ProductsService(makePrisma());
      await expectAppError(
        service.create({ ...validDto, compare_at_price_minor: 32900 }),
        422,
        'INVALID_COMPARE_PRICE',
      );
    });

    it('არარსებული კატეგორია → 422 CATEGORY_NOT_FOUND', async () => {
      const service = new ProductsService(
        makePrisma({ category: { findUnique: async () => null } }),
      );
      await expectAppError(
        service.create(validDto),
        422,
        'CATEGORY_NOT_FOUND',
      );
    });

    it('გამოყენებული SKU → 409 PRODUCT_SKU_TAKEN', async () => {
      const service = new ProductsService(
        makePrisma({
          product: {
            create: async () => {
              throw { code: 'P2002', meta: { target: ['sku'] } };
            },
          },
        }),
      );
      await expectAppError(
        service.create(validDto),
        409,
        'PRODUCT_SKU_TAKEN',
      );
    });

    it('გამოყენებული slug → 409 PRODUCT_SLUG_TAKEN', async () => {
      const service = new ProductsService(
        makePrisma({
          product: {
            create: async () => {
              throw { code: 'P2002', meta: { target: ['slug'] } };
            },
          },
        }),
      );
      await expectAppError(
        service.create(validDto),
        409,
        'PRODUCT_SLUG_TAKEN',
      );
    });

    it('ნაგულისხმევი სტატუსი DRAFT-ია', async () => {
      let captured: { data?: Record<string, unknown> } = {};
      const service = new ProductsService(
        makePrisma({
          product: {
            create: async (args: { data: Record<string, unknown> }) => {
              captured = args;
              return productStub();
            },
          },
          category: { findUnique: async () => ({ id: CATEGORY_ID }) },
        }),
      );

      await service.create(validDto);

      expect(captured.data?.status).toBe(ProductStatus.DRAFT);
    });
  });

  describe('update', () => {
    it('არარსებული → 404 PRODUCT_NOT_FOUND', async () => {
      const service = new ProductsService(
        makePrisma({ product: { findUnique: async () => null } }),
      );
      await expectAppError(
        service.update(PRODUCT_ID, { price_minor: 100 }),
        404,
        'PRODUCT_NOT_FOUND',
      );
    });

    it('მხოლოდ price_minor-ის შეცვლა ამოწმებს არსებულ compare_at-ს', async () => {
      const service = new ProductsService(
        makePrisma({
          product: {
            findUnique: async () => ({
              price_minor: 10000,
              compare_at_price_minor: 12000,
            }),
            update: async () => productStub(),
          },
        }),
      );

      // ახალი ფასი ძველ „გადახაზულ ფასზე“ მაღლა ადის → აღარ არის ფასდაკლება
      await expectAppError(
        service.update(PRODUCT_ID, { price_minor: 13000 }),
        422,
        'INVALID_COMPARE_PRICE',
      );
    });

    it('compare_at_price_minor: null ასუფთავებს ფასდაკლებას', async () => {
      let captured: { data?: Record<string, unknown> } = {};
      const service = new ProductsService(
        makePrisma({
          product: {
            findUnique: async () => ({
              price_minor: 10000,
              compare_at_price_minor: 12000,
            }),
            update: async (args: { data: Record<string, unknown> }) => {
              captured = args;
              return productStub();
            },
          },
        }),
      );

      await service.update(PRODUCT_ID, { compare_at_price_minor: null });

      expect(captured.data).toHaveProperty('compare_at_price_minor', null);
    });

    it('გადმოუცემელი ველები data-ში არ ხვდება', async () => {
      let captured: { data?: Record<string, unknown> } = {};
      const service = new ProductsService(
        makePrisma({
          product: {
            findUnique: async () => ({
              price_minor: 10000,
              compare_at_price_minor: null,
            }),
            update: async (args: { data: Record<string, unknown> }) => {
              captured = args;
              return productStub();
            },
          },
        }),
      );

      await service.update(PRODUCT_ID, { is_featured: true });

      expect(Object.keys(captured.data ?? {})).toEqual(['is_featured']);
    });
  });

  describe('archive', () => {
    it('უკვე არქივში → 409 PRODUCT_ALREADY_ARCHIVED', async () => {
      const service = new ProductsService(
        makePrisma({
          product: {
            findUnique: async () => ({ status: ProductStatus.ARCHIVED }),
          },
        }),
      );
      await expectAppError(
        service.archive(PRODUCT_ID),
        409,
        'PRODUCT_ALREADY_ARCHIVED',
      );
    });

    it('აქტიური პროდუქტი გადადის ARCHIVED-ში (არ იშლება)', async () => {
      let captured: { data?: Record<string, unknown> } = {};
      const service = new ProductsService(
        makePrisma({
          product: {
            findUnique: async () => ({ status: ProductStatus.ACTIVE }),
            update: async (args: { data: Record<string, unknown> }) => {
              captured = args;
              return productStub({ status: ProductStatus.ARCHIVED });
            },
          },
        }),
      );

      const result = await service.archive(PRODUCT_ID);

      expect(captured.data).toEqual({ status: ProductStatus.ARCHIVED });
      expect(result.status).toBe(ProductStatus.ARCHIVED);
    });
  });
});
