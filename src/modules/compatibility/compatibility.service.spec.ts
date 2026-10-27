import type { PrismaService } from '../../infra/prisma/prisma.service.js';
import type { ProductsService } from '../catalog/products.service.js';
import type { ChargerModelsService } from './charger-models.service.js';
import { CompatibilityService } from './compatibility.service.js';

const PRODUCT_ID = '44444444-4444-4444-8444-444444444444';
const MODEL_ID = '66666666-6666-4666-8666-666666666666';
const OTHER_MODEL_ID = '77777777-7777-4777-8777-777777777777';

const linkRow = {
  charger_model_id: MODEL_ID,
  note: 'მხოლოდ 2023 წლის შემდეგ',
  charger_model: {
    slug: 'pulsar-plus',
    name: 'Pulsar Plus',
    revision: 'Gen 2',
    power_kw: { valueOf: () => '22.00' },
    brand_id: '55555555-5555-4555-8555-555555555555',
    brand: { slug: 'wallbox', name: 'Wallbox' },
  },
};

type Calls = {
  deleteMany: unknown[];
  createMany: unknown[];
  setUniversal: (boolean | undefined)[];
};

function makeStubs(
  over: {
    prisma?: Record<string, unknown>;
    missingModels?: string[];
    missingProducts?: string[];
    isUniversal?: boolean;
  } = {},
) {
  const calls: Calls = { deleteMany: [], createMany: [], setUniversal: [] };

  const prisma = {
    productCompatibility: {
      findMany: async () => [linkRow],
      count: async () => 1,
      deleteMany: (args: unknown) => {
        calls.deleteMany.push(args);
        return Promise.resolve({ count: 1 });
      },
      createMany: (args: unknown) => {
        calls.createMany.push(args);
        return Promise.resolve({ count: 1 });
      },
    },
    $transaction: async (ops: Promise<unknown>[]) => Promise.all(ops),
    ...over.prisma,
  } as unknown as PrismaService;

  const products = {
    assertExists: async () => {},
    isUniversal: async () => over.isUniversal ?? false,
    findMissingIds: async () => over.missingProducts ?? [],
    setUniversal: async (_id: string, value: boolean) => {
      calls.setUniversal.push(value);
    },
    summariesByIds: async (ids: string[]) =>
      ids.map((id) => ({
        id,
        sku: 'CBL-T2-32-5',
        slug: 'type2-cable-32a-5m',
        status: 'ACTIVE',
        name: 'Type 2 კაბელი',
      })),
  } as unknown as ProductsService;

  const models = {
    assertExists: async () => {},
    findMissingIds: async () => over.missingModels ?? [],
  } as unknown as ChargerModelsService;

  return {
    calls,
    service: new CompatibilityService(prisma, products, models),
  };
}

describe('CompatibilityService', () => {
  describe('getForProduct', () => {
    it('აბრუნებს ბრენდს, მოდელს და შენიშვნას', async () => {
      const { service } = makeStubs({ isUniversal: true });

      const res = await service.getForProduct(PRODUCT_ID);

      expect(res.product_id).toBe(PRODUCT_ID);
      expect(res.is_universal).toBe(true);
      expect(res.models[0]).toMatchObject({
        charger_model_id: MODEL_ID,
        brand_slug: 'wallbox',
        model_name: 'Pulsar Plus',
        power_kw: 22,
        note: 'მხოლოდ 2023 წლის შემდეგ',
      });
    });
  });

  describe('setForProduct', () => {
    it('სია მთლიანად ჩაენაცვლება: ჯერ წაშლა, მერე ჩაწერა', async () => {
      const { service, calls } = makeStubs();

      await service.setForProduct(PRODUCT_ID, {
        model_ids: [MODEL_ID, OTHER_MODEL_ID],
      });

      expect(calls.deleteMany).toEqual([{ where: { product_id: PRODUCT_ID } }]);
      expect(calls.createMany).toEqual([
        {
          data: [
            { product_id: PRODUCT_ID, charger_model_id: MODEL_ID },
            { product_id: PRODUCT_ID, charger_model_id: OTHER_MODEL_ID },
          ],
        },
      ]);
    });

    it('გამეორებული id-ები ერთხელ იწერება', async () => {
      const { service, calls } = makeStubs();

      await service.setForProduct(PRODUCT_ID, {
        model_ids: [MODEL_ID, MODEL_ID, MODEL_ID],
      });

      expect(calls.createMany).toEqual([
        { data: [{ product_id: PRODUCT_ID, charger_model_id: MODEL_ID }] },
      ]);
    });

    it('ცარიელი სია ყველა კავშირს შლის', async () => {
      const { service, calls } = makeStubs();

      await service.setForProduct(PRODUCT_ID, { model_ids: [] });

      expect(calls.deleteMany).toHaveLength(1);
      expect(calls.createMany).toEqual([{ data: [] }]);
    });

    it('უცნობი მოდელი → 422 CHARGER_MODEL_NOT_FOUND, კავშირები ხელუხლებელია', async () => {
      const { service, calls } = makeStubs({ missingModels: [OTHER_MODEL_ID] });

      const error = await service
        .setForProduct(PRODUCT_ID, { model_ids: [MODEL_ID, OTHER_MODEL_ID] })
        .catch((e: unknown) => e);

      expect(error).toMatchObject({ code: 'CHARGER_MODEL_NOT_FOUND' });
      expect((error as { errors?: unknown[] }).errors).toEqual([
        { charger_model_id: OTHER_MODEL_ID },
      ]);
      expect(calls.deleteMany).toHaveLength(0);
    });

    it('is_universal მითითებისას პროდუქტზე იწერება', async () => {
      const { service, calls } = makeStubs();

      await service.setForProduct(PRODUCT_ID, {
        model_ids: [],
        is_universal: true,
      });

      expect(calls.setUniversal).toEqual([true]);
    });

    it('is_universal-ის გარეშე პროდუქტი არ იცვლება', async () => {
      const { service, calls } = makeStubs();

      await service.setForProduct(PRODUCT_ID, { model_ids: [MODEL_ID] });

      expect(calls.setUniversal).toEqual([]);
    });
  });

  describe('attachProducts', () => {
    it('added / skipped ითვლება არსებული კავშირების მიხედვით', async () => {
      const { service } = makeStubs({
        prisma: {
          productCompatibility: {
            findMany: async () => [linkRow],
            count: async () => 3,
            createMany: async () => ({ count: 1 }),
          },
        },
      });

      const res = await service.attachProducts(MODEL_ID, {
        product_ids: [PRODUCT_ID, OTHER_MODEL_ID],
      });

      expect(res).toMatchObject({
        charger_model_id: MODEL_ID,
        added: 1,
        skipped: 1,
        total: 3,
      });
      expect(res.products).toHaveLength(2);
    });

    it('უცნობი პროდუქტი → 422 PRODUCT_NOT_FOUND', async () => {
      const { service } = makeStubs({ missingProducts: [PRODUCT_ID] });

      await expect(
        service.attachProducts(MODEL_ID, { product_ids: [PRODUCT_ID] }),
      ).rejects.toMatchObject({ code: 'PRODUCT_NOT_FOUND' });
    });
  });

  describe('detachProduct', () => {
    it('არარსებული კავშირი → 404 COMPATIBILITY_NOT_FOUND', async () => {
      const { service } = makeStubs({
        prisma: {
          productCompatibility: {
            deleteMany: async () => ({ count: 0 }),
          },
        },
      });

      await expect(
        service.detachProduct(MODEL_ID, PRODUCT_ID),
      ).rejects.toMatchObject({ code: 'COMPATIBILITY_NOT_FOUND' });
    });

    it('არსებული კავშირი იშლება', async () => {
      const { service } = makeStubs({
        prisma: {
          productCompatibility: {
            deleteMany: async () => ({ count: 1 }),
          },
        },
      });

      await expect(
        service.detachProduct(MODEL_ID, PRODUCT_ID),
      ).resolves.toBeUndefined();
    });
  });
});
