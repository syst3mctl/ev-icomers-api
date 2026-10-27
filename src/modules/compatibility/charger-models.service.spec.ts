import type { PrismaService } from '../../infra/prisma/prisma.service.js';
import type { ChargerBrandsService } from './charger-brands.service.js';
import { ChargerModelsService } from './charger-models.service.js';
import type { CreateChargerModelDto } from './dto/charger-model.dto.js';

const BRAND_ID = '55555555-5555-4555-8555-555555555555';
const MODEL_ID = '66666666-6666-4666-8666-666666666666';
const NOW = new Date('2026-10-27T00:00:00Z');

/** Prisma-ს `Decimal` ასე იქცევა: `Number(value)` სწორ რიცხვს აბრუნებს */
const decimal = (value: string) => ({
  toString: () => value,
  valueOf: () => value,
});

function modelStub(over: Record<string, unknown> = {}): Record<
  string,
  unknown
> {
  return {
    id: MODEL_ID,
    brand_id: BRAND_ID,
    slug: 'pulsar-plus',
    name: 'Pulsar Plus',
    revision: 'Gen 2',
    power_kw: decimal('22.00'),
    image_key: null,
    is_active: true,
    created_at: NOW,
    updated_at: NOW,
    brand: { slug: 'wallbox', name: 'Wallbox' },
    _count: { products: 0 },
    ...over,
  };
}

function makePrisma(over: Record<string, unknown> = {}): PrismaService {
  return {
    chargerModel: {
      findMany: async () => [modelStub()],
      findUnique: async () => modelStub(),
      count: async () => 1,
      create: async () => modelStub(),
      update: async () => modelStub(),
      delete: async () => modelStub(),
    },
    productCompatibility: { count: async () => 0 },
    ...over,
  } as unknown as PrismaService;
}

function makeBrands(exists = true): ChargerBrandsService {
  return {
    assertExists: async () => {
      if (!exists) {
        throw Object.assign(new Error('not found'), {
          code: 'CHARGER_BRAND_NOT_FOUND',
        });
      }
    },
  } as unknown as ChargerBrandsService;
}

const validDto: CreateChargerModelDto = {
  brand_id: BRAND_ID,
  slug: 'pulsar-plus',
  name: 'Pulsar Plus',
};

describe('ChargerModelsService', () => {
  it('power_kw პასუხში რიცხვია, არა Decimal', async () => {
    const service = new ChargerModelsService(makePrisma(), makeBrands());

    const res = await service.getById(MODEL_ID);

    expect(res.power_kw).toBe(22);
    expect(res.brand_slug).toBe('wallbox');
    expect(res.brand_name).toBe('Wallbox');
  });

  it('power_kw-ის გარეშე → null', async () => {
    const service = new ChargerModelsService(
      makePrisma({
        chargerModel: {
          findUnique: async () => modelStub({ power_kw: null }),
        },
      }),
      makeBrands(),
    );

    const res = await service.getById(MODEL_ID);

    expect(res.power_kw).toBeNull();
  });

  it('შექმნა უცნობ ბრენდზე → ბრენდის შეცდომა', async () => {
    const service = new ChargerModelsService(makePrisma(), makeBrands(false));

    await expect(service.create(validDto)).rejects.toMatchObject({
      code: 'CHARGER_BRAND_NOT_FOUND',
    });
  });

  it('slug ერთ ბრენდში ორჯერ → 409 CHARGER_MODEL_SLUG_TAKEN', async () => {
    const service = new ChargerModelsService(
      makePrisma({
        chargerModel: {
          create: async () => {
            throw Object.assign(new Error('unique'), { code: 'P2002' });
          },
        },
      }),
      makeBrands(),
    );

    await expect(service.create(validDto)).rejects.toMatchObject({
      code: 'CHARGER_MODEL_SLUG_TAKEN',
    });
  });

  it('მიბმული მოდელი არ იშლება → 409 CHARGER_MODEL_IN_USE', async () => {
    const service = new ChargerModelsService(
      makePrisma({ productCompatibility: { count: async () => 7 } }),
      makeBrands(),
    );

    const error = await service.remove(MODEL_ID).catch((e: unknown) => e);

    expect(error).toMatchObject({ code: 'CHARGER_MODEL_IN_USE' });
    expect((error as { errors?: unknown[] }).errors).toEqual([{ products: 7 }]);
  });

  it('უცნობი id → 404 CHARGER_MODEL_NOT_FOUND', async () => {
    const service = new ChargerModelsService(
      makePrisma({ chargerModel: { findUnique: async () => null } }),
      makeBrands(),
    );

    await expect(service.assertExists(MODEL_ID)).rejects.toMatchObject({
      code: 'CHARGER_MODEL_NOT_FOUND',
    });
  });

  it('findMissingIds აბრუნებს მხოლოდ არარსებულებს', async () => {
    const service = new ChargerModelsService(
      makePrisma({
        chargerModel: { findMany: async () => [{ id: MODEL_ID }] },
      }),
      makeBrands(),
    );

    const missing = await service.findMissingIds([MODEL_ID, BRAND_ID]);

    expect(missing).toEqual([BRAND_ID]);
  });
});
