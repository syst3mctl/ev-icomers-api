import { AppError } from '../../common/filters/problem-details.filter.js';
import { StockMovementType } from '../../generated/prisma/enums.js';
import type { PrismaService } from '../../infra/prisma/prisma.service.js';
import type { ProductsService } from '../catalog/products.service.js';
import type { ListInventoryQueryDto } from './dto/inventory.dto.js';
import { InventoryService } from './inventory.service.js';

const PRODUCT_ID = '44444444-4444-4444-8444-444444444444';
const ACTOR_ID = 'dev-admin';
const NOW = new Date('2026-10-27T00:00:00Z');

type ItemState = {
  product_id: string;
  on_hand: number;
  reserved: number;
  low_stock_threshold: number;
  updated_at: Date;
};

/**
 * `inventory_items`-ის იმიტაცია: `$executeRaw` ზუსტად ისე იქცევა, როგორც
 * `UPDATE ... WHERE on_hand + quantity >= reserved` — პირობის შემოწმება და
 * ჩაწერა განუყოფელია (Postgres-ში სტრიქონი ბლოკილია).
 *
 * `await` პირობამდე სპეციალურად არის: ასე პარალელურ გამოძახებებს შორის
 * გადართვა შესაძლებელია და „წაიკითხე → ჩაწერე“ ტიპის არასწორი იმპლემენტაცია
 * ტესტში ჩავარდება.
 */
function makeStubs(initial: Partial<ItemState> = {}) {
  const state: ItemState = {
    product_id: PRODUCT_ID,
    on_hand: 0,
    reserved: 0,
    low_stock_threshold: 2,
    updated_at: NOW,
    ...initial,
  };
  const movements: Record<string, unknown>[] = [];
  let created = 0;

  const executeRaw = async (
    _strings: unknown,
    ...values: unknown[]
  ): Promise<number> => {
    await Promise.resolve();
    const quantity = Number(values[0]);
    if (state.on_hand + quantity < state.reserved) return 0;
    state.on_hand += quantity;
    return 1;
  };

  const tx = {
    $executeRaw: executeRaw,
    inventoryItem: {
      findUnique: async () => ({ ...state }),
      findUniqueOrThrow: async () => ({ ...state }),
    },
    stockMovement: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        created += 1;
        const row = {
          id: `movement-${created}`,
          order_id: null,
          created_at: NOW,
          ...data,
        };
        movements.push(row);
        return row;
      },
    },
  };

  const prisma = {
    inventoryItem: {
      upsert: async () => ({ ...state }),
      count: async () => 1,
      createMany: async () => ({ count: 0 }),
      update: async ({ data }: { data: Partial<ItemState> }) => {
        Object.assign(state, data);
        return { ...state };
      },
    },
    stockMovement: {
      findMany: async () => movements,
      count: async () => movements.length,
    },
    $transaction: async <T>(fn: (client: unknown) => Promise<T>): Promise<T> =>
      fn(tx),
    $queryRaw: async () => [{ total: 1n }],
    $queryRawUnsafe: async () => [{ ...state }],
  } as unknown as PrismaService;

  const products = {
    assertExists: async () => {},
    countAll: async () => 1,
    allIds: async () => [PRODUCT_ID],
    summariesByIds: async (ids: string[]) =>
      ids.map((id) => ({
        id,
        sku: 'CBL-T2-32-5',
        slug: 'type2-cable-32a-5m',
        status: 'ACTIVE',
        name: 'Type 2 კაბელი',
      })),
  } as unknown as ProductsService;

  return { state, movements, service: new InventoryService(prisma, products) };
}

const listQuery: ListInventoryQueryDto = {
  page: 1,
  page_size: 24,
  sort: 'available_asc',
};

describe('InventoryService', () => {
  describe('addMovement', () => {
    it('მიღება ზრდის მარაგს და ისტორიაში ავტორს წერს', async () => {
      const { service, state, movements } = makeStubs();

      const res = await service.addMovement(
        PRODUCT_ID,
        { type: StockMovementType.RECEIPT, quantity: 10 },
        ACTOR_ID,
      );

      expect(state.on_hand).toBe(10);
      expect(res.inventory.on_hand).toBe(10);
      expect(res.inventory.available).toBe(10);
      expect(res.inventory.is_low_stock).toBe(false);
      expect(res.movement.quantity).toBe(10);
      expect(res.movement.actor_id).toBe(ACTOR_ID);
      expect(movements).toHaveLength(1);
    });

    it('გაყიდვა ამცირებს მარაგს', async () => {
      const { service, state } = makeStubs({ on_hand: 5 });

      const res = await service.addMovement(
        PRODUCT_ID,
        { type: StockMovementType.SALE, quantity: -2 },
        ACTOR_ID,
      );

      expect(state.on_hand).toBe(3);
      expect(res.inventory.available).toBe(3);
    });

    it('მიღება უარყოფითი რაოდენობით → 422 INVALID_MOVEMENT_SIGN', async () => {
      const { service, state } = makeStubs();

      await expect(
        service.addMovement(
          PRODUCT_ID,
          { type: StockMovementType.RECEIPT, quantity: -5 },
          ACTOR_ID,
        ),
      ).rejects.toMatchObject({ code: 'INVALID_MOVEMENT_SIGN' });
      expect(state.on_hand).toBe(0);
    });

    it('გაყიდვა დადებითი რაოდენობით → 422 INVALID_MOVEMENT_SIGN', async () => {
      const { service } = makeStubs({ on_hand: 5 });

      await expect(
        service.addMovement(
          PRODUCT_ID,
          { type: StockMovementType.SALE, quantity: 3 },
          ACTOR_ID,
        ),
      ).rejects.toMatchObject({ code: 'INVALID_MOVEMENT_SIGN' });
    });

    it('კორექცია ორივე მიმართულებით მუშაობს', async () => {
      const { service, state } = makeStubs({ on_hand: 5 });

      await service.addMovement(
        PRODUCT_ID,
        { type: StockMovementType.ADJUSTMENT, quantity: -1 },
        ACTOR_ID,
      );
      await service.addMovement(
        PRODUCT_ID,
        { type: StockMovementType.ADJUSTMENT, quantity: 2 },
        ACTOR_ID,
      );

      expect(state.on_hand).toBe(6);
    });

    it('მარაგი ნულს ქვემოთ არ ჩამოდის → 409 INSUFFICIENT_STOCK', async () => {
      const { service, state, movements } = makeStubs({ on_hand: 1 });

      const error = await service
        .addMovement(
          PRODUCT_ID,
          { type: StockMovementType.DAMAGE, quantity: -2 },
          ACTOR_ID,
        )
        .catch((e: unknown) => e);

      expect(error).toBeInstanceOf(AppError);
      expect(error).toMatchObject({ code: 'INSUFFICIENT_STOCK' });
      expect((error as AppError).getStatus()).toBe(409);
      // ჩანაწერიც არ უნდა დარჩეს
      expect(state.on_hand).toBe(1);
      expect(movements).toHaveLength(0);
    });

    it('დაკავებულ (reserved) რაოდენობას ვერ ჩამოვწერთ', async () => {
      const { service, state } = makeStubs({ on_hand: 3, reserved: 3 });

      await expect(
        service.addMovement(
          PRODUCT_ID,
          { type: StockMovementType.DAMAGE, quantity: -1 },
          ACTOR_ID,
        ),
      ).rejects.toMatchObject({ code: 'INSUFFICIENT_STOCK' });
      expect(state.on_hand).toBe(3);
    });

    /**
     * სავალდებულო ტესტი (CLAUDE.md → „ტესტები“) მარაგის ვერსიით: ბოლო ერთეულზე
     * 10 პარალელური ჩამოწერიდან მხოლოდ ერთი უნდა გაიაროს.
     * checkout-ის ვერსია დაემატება შეკვეთების მოდულთან ერთად.
     */
    it('10 პარალელური ჩამოწერა ბოლო ერთეულზე → წარმატებით მხოლოდ 1', async () => {
      const { service, state, movements } = makeStubs({ on_hand: 1 });

      const results = await Promise.allSettled(
        Array.from({ length: 10 }, () =>
          service.addMovement(
            PRODUCT_ID,
            { type: StockMovementType.SALE, quantity: -1 },
            ACTOR_ID,
          ),
        ),
      );

      const fulfilled = results.filter((r) => r.status === 'fulfilled');
      const rejected = results.filter((r) => r.status === 'rejected');

      expect(fulfilled).toHaveLength(1);
      expect(rejected).toHaveLength(9);
      for (const r of rejected) {
        expect((r as PromiseRejectedResult).reason).toMatchObject({
          code: 'INSUFFICIENT_STOCK',
        });
      }
      expect(state.on_hand).toBe(0);
      expect(movements).toHaveLength(1);
    });
  });

  describe('getByProductId', () => {
    it('ცოტა მარაგი აღინიშნება is_low_stock-ით', async () => {
      const { service } = makeStubs({
        on_hand: 3,
        reserved: 1,
        low_stock_threshold: 2,
      });

      const res = await service.getByProductId(PRODUCT_ID);

      expect(res.available).toBe(2);
      expect(res.is_low_stock).toBe(true);
      expect(res.product?.sku).toBe('CBL-T2-32-5');
    });

    it('მარაგის ზღვარზე მეტი → is_low_stock false', async () => {
      const { service } = makeStubs({ on_hand: 10, low_stock_threshold: 2 });

      const res = await service.getByProductId(PRODUCT_ID);

      expect(res.is_low_stock).toBe(false);
    });
  });

  describe('updateSettings', () => {
    it('ზღვარი იცვლება, რაოდენობა — არა', async () => {
      const { service, state } = makeStubs({ on_hand: 7 });

      const res = await service.updateSettings(PRODUCT_ID, {
        low_stock_threshold: 10,
      });

      expect(state.low_stock_threshold).toBe(10);
      expect(state.on_hand).toBe(7);
      expect(res.is_low_stock).toBe(true);
    });
  });

  describe('list', () => {
    it('აბრუნებს pagination-ს და პროდუქტის აღწერას', async () => {
      const { service } = makeStubs({ on_hand: 4 });

      const res = await service.list(listQuery);

      expect(res).toMatchObject({ page: 1, page_size: 24, total: 1 });
      expect(res.items[0]).toMatchObject({
        product_id: PRODUCT_ID,
        on_hand: 4,
        available: 4,
      });
      expect(res.items[0]?.product?.name).toBe('Type 2 კაბელი');
    });
  });

  describe('listMovements', () => {
    it('ისტორია ჩანაწერის დამატების შემდეგ', async () => {
      const { service } = makeStubs();

      await service.addMovement(
        PRODUCT_ID,
        { type: StockMovementType.RECEIPT, quantity: 4, reason: 'მიწოდება' },
        ACTOR_ID,
      );
      const res = await service.listMovements(PRODUCT_ID, {
        page: 1,
        page_size: 24,
      });

      expect(res.total).toBe(1);
      expect(res.items[0]).toMatchObject({
        quantity: 4,
        reason: 'მიწოდება',
        type: StockMovementType.RECEIPT,
      });
    });
  });
});
