import type { PrismaService } from '../../infra/prisma/prisma.service.js';
import { ChargerBrandsService } from './charger-brands.service.js';
import type { CreateChargerBrandDto } from './dto/charger-brand.dto.js';

const BRAND_ID = '55555555-5555-4555-8555-555555555555';
const NOW = new Date('2026-10-27T00:00:00Z');

function brandStub(over: Record<string, unknown> = {}): Record<
  string,
  unknown
> {
  return {
    id: BRAND_ID,
    slug: 'wallbox',
    name: 'Wallbox',
    logo_key: null,
    sort_order: 0,
    is_active: true,
    created_at: NOW,
    updated_at: NOW,
    _count: { models: 3 },
    ...over,
  };
}

function makePrisma(over: Record<string, unknown> = {}): PrismaService {
  return {
    chargerBrand: {
      findMany: async () => [brandStub()],
      findUnique: async () => brandStub(),
      count: async () => 1,
      create: async () => brandStub(),
      update: async () => brandStub(),
      delete: async () => brandStub(),
    },
    chargerModel: { count: async () => 0 },
    ...over,
  } as unknown as PrismaService;
}

const validDto: CreateChargerBrandDto = { slug: 'wallbox', name: 'Wallbox' };

describe('ChargerBrandsService', () => {
  it('სია აბრუნებს model_count-ს და pagination-ს', async () => {
    const service = new ChargerBrandsService(makePrisma());

    const res = await service.list({ page: 1, page_size: 24 });

    expect(res).toMatchObject({ page: 1, page_size: 24, total: 1 });
    expect(res.items[0]).toMatchObject({
      slug: 'wallbox',
      model_count: 3,
      created_at: '2026-10-27T00:00:00.000Z',
    });
  });

  it('უცნობი id → 404 CHARGER_BRAND_NOT_FOUND', async () => {
    const service = new ChargerBrandsService(
      makePrisma({
        chargerBrand: { findUnique: async () => null },
      }),
    );

    await expect(service.getById(BRAND_ID)).rejects.toMatchObject({
      code: 'CHARGER_BRAND_NOT_FOUND',
    });
  });

  it('გამოყენებული slug → 409 CHARGER_BRAND_SLUG_TAKEN', async () => {
    const service = new ChargerBrandsService(
      makePrisma({
        chargerBrand: {
          create: async () => {
            throw Object.assign(new Error('unique'), { code: 'P2002' });
          },
        },
      }),
    );

    await expect(service.create(validDto)).rejects.toMatchObject({
      code: 'CHARGER_BRAND_SLUG_TAKEN',
    });
  });

  it('ბრენდი მოდელებით არ იშლება → 409 CHARGER_BRAND_NOT_EMPTY', async () => {
    const service = new ChargerBrandsService(
      makePrisma({ chargerModel: { count: async () => 2 } }),
    );

    await expect(service.remove(BRAND_ID)).rejects.toMatchObject({
      code: 'CHARGER_BRAND_NOT_EMPTY',
    });
  });

  it('ცარიელი ბრენდი იშლება', async () => {
    let deleted = false;
    const service = new ChargerBrandsService(
      makePrisma({
        chargerBrand: {
          findUnique: async () => brandStub({ _count: { models: 0 } }),
          delete: async () => {
            deleted = true;
            return brandStub();
          },
        },
      }),
    );

    await service.remove(BRAND_ID);

    expect(deleted).toBe(true);
  });
});
