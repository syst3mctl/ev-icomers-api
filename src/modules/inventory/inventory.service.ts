import { Injectable, Logger } from '@nestjs/common';
import { toSkipTake } from '../../common/dto/page-query.dto.js';
import { AppError } from '../../common/filters/problem-details.filter.js';
import { PrismaService } from '../../infra/prisma/prisma.service.js';
import type { ProductSummaryResponse } from '../catalog/dto/product.dto.js';
import { ProductsService } from '../catalog/products.service.js';
import {
  type InventoryItemResponse,
  type InventoryListResponse,
  type InventorySort,
  type ListInventoryQueryDto,
  type UpdateInventorySettingsDto,
} from './dto/inventory.dto.js';
import {
  MOVEMENT_SIGN,
  type CreateStockMovementDto,
  type ListStockMovementsQueryDto,
  type StockMovementListResponse,
  type StockMovementResponse,
  type StockMovementResultResponse,
} from './dto/stock-movement.dto.js';

/** `inventory_items`-ის სტრიქონი ისე, როგორც raw query აბრუნებს */
type ItemRow = {
  product_id: string;
  on_hand: number;
  reserved: number;
  low_stock_threshold: number;
  updated_at: Date;
};

type MovementRow = {
  id: string;
  product_id: string;
  type: StockMovementResponse['type'];
  quantity: number;
  order_id: string | null;
  reason: string | null;
  actor_id: string | null;
  created_at: Date;
};

const ORDER_BY: Record<InventorySort, string> = {
  available_asc: '(on_hand - reserved) ASC, product_id ASC',
  available_desc: '(on_hand - reserved) DESC, product_id ASC',
  updated_desc: 'updated_at DESC, product_id ASC',
};

/**
 * მარაგი: `inventory_items` (მიმდინარე რაოდენობები) და `stock_movements` (ისტორია).
 *
 * `reserved` ამ მოდულიდან **არ იცვლება**: დაჯავშნა checkout-ის საქმეა
 * (`stock_reservations`, `docs/06-order-flow.md`). ადმინი მხოლოდ `on_hand`-ს ცვლის.
 *
 * პროდუქტის მონაცემები `ProductsService`-ით იკითხება — `products` სხვა მოდულის
 * ცხრილია (CLAUDE.md → „მოდულები“).
 */
@Injectable()
export class InventoryService {
  private readonly logger = new Logger(InventoryService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly products: ProductsService,
  ) {}

  /**
   * მარაგის სია. `low_stock=true` → მხოლოდ `available <= low_stock_threshold`.
   *
   * ფილტრი და დალაგება სვეტების სხვაობაზეა (`on_hand - reserved`), რასაც Prisma-ს
   * query builder ვერ გამოხატავს — ამიტომ raw SQL (CLAUDE.md → „Prisma თუ raw SQL“).
   */
  async list(query: ListInventoryQueryDto): Promise<InventoryListResponse> {
    await this.syncMissingItems();

    const { skip, take } = toSkipTake(query);
    const lowStockOnly = query.low_stock ?? false;

    const [rows, counted] = await Promise.all([
      this.prisma.$queryRawUnsafe<ItemRow[]>(
        `SELECT product_id, on_hand, reserved, low_stock_threshold, updated_at
           FROM inventory_items
          WHERE (NOT $1::boolean OR (on_hand - reserved) <= low_stock_threshold)
          ORDER BY ${ORDER_BY[query.sort]}
          LIMIT $2 OFFSET $3`,
        lowStockOnly,
        take,
        skip,
      ),
      this.prisma.$queryRaw<{ total: bigint }[]>`
        SELECT COUNT(*) AS total
          FROM inventory_items
         WHERE (NOT ${lowStockOnly}::boolean OR (on_hand - reserved) <= low_stock_threshold)`,
    ]);

    const summaries = await this.productSummaries(rows.map((r) => r.product_id));

    return {
      items: rows.map((row) =>
        toItemResponse(row, summaries.get(row.product_id) ?? null),
      ),
      page: query.page,
      page_size: query.page_size,
      total: Number(counted[0]?.total ?? 0),
    };
  }

  /** ერთი პროდუქტის მარაგი. სტრიქონის არარსებობა = ნული მარაგი, ამიტომ ის იქმნება. */
  async getByProductId(productId: string): Promise<InventoryItemResponse> {
    await this.products.assertExists(productId);
    const row = await this.ensureItem(productId);
    const summaries = await this.productSummaries([productId]);
    return toItemResponse(row, summaries.get(productId) ?? null);
  }

  /** „ცოტა მარაგის“ ზღვრის შეცვლა */
  async updateSettings(
    productId: string,
    dto: UpdateInventorySettingsDto,
  ): Promise<InventoryItemResponse> {
    await this.products.assertExists(productId);
    await this.ensureItem(productId);

    await this.prisma.inventoryItem.update({
      where: { product_id: productId },
      data: { low_stock_threshold: dto.low_stock_threshold },
    });

    return this.getByProductId(productId);
  }

  /**
   * მარაგის ცვლილება — ერთ ტრანზაქციაში (CLAUDE.md → „მარაგი“):
   *
   * 1. `UPDATE ... WHERE on_hand + quantity >= reserved` — ერთი ატომური ნაბიჯი.
   *    `reserved >= 0`, ამიტომ ეს პირობა ერთდროულად იცავს ორივე უცვლელს:
   *    `on_hand >= 0` და `reserved <= on_hand` (ბაზის CHECK-ები, მიგრაცია
   *    `inventory_checks`). პირობა არ სრულდება → `409 INSUFFICIENT_STOCK`.
   * 2. ჩანაწერი `stock_movements`-ში (მხოლოდ INSERT, ავტორით).
   *
   * პარალელური მოთხოვნები ერთმანეთს არ ეშლება: `UPDATE` სტრიქონს ბლოკავს და
   * პირობა უკვე განახლებულ მნიშვნელობაზე მოწმდება.
   */
  async addMovement(
    productId: string,
    dto: CreateStockMovementDto,
    actorId: string | null,
  ): Promise<StockMovementResultResponse> {
    await this.products.assertExists(productId);
    assertSignMatchesType(dto);
    await this.ensureItem(productId);

    const { item, movement } = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.$executeRaw`
        UPDATE inventory_items
           SET on_hand = on_hand + ${dto.quantity}::int, updated_at = now()
         WHERE product_id = ${productId}::uuid
           AND on_hand + ${dto.quantity}::int >= reserved`;

      if (updated === 0) {
        const current = await tx.inventoryItem.findUnique({
          where: { product_id: productId },
          select: { on_hand: true, reserved: true },
        });
        throw new AppError(
          409,
          'INSUFFICIENT_STOCK',
          `მარაგი არ არის საკმარისი: საწყობში ${current?.on_hand ?? 0}, დაკავებული ${current?.reserved ?? 0}`,
          [
            {
              on_hand: current?.on_hand ?? 0,
              reserved: current?.reserved ?? 0,
              available: (current?.on_hand ?? 0) - (current?.reserved ?? 0),
              requested: dto.quantity,
            },
          ],
        );
      }

      const movementRow = await tx.stockMovement.create({
        data: {
          product_id: productId,
          type: dto.type,
          quantity: dto.quantity,
          reason: dto.reason ?? null,
          actor_id: actorId,
        },
      });

      const itemRow = await tx.inventoryItem.findUniqueOrThrow({
        where: { product_id: productId },
      });

      return { item: itemRow, movement: movementRow };
    });

    const summaries = await this.productSummaries([productId]);

    return {
      movement: toMovementResponse(movement),
      inventory: toItemResponse(item, summaries.get(productId) ?? null),
    };
  }

  /** ცვლილებების ისტორია ერთ პროდუქტზე, უახლესი ზემოდან */
  async listMovements(
    productId: string,
    query: ListStockMovementsQueryDto,
  ): Promise<StockMovementListResponse> {
    await this.products.assertExists(productId);

    const { skip, take } = toSkipTake(query);
    const where = {
      product_id: productId,
      ...(query.type ? { type: query.type } : {}),
    };

    const [rows, total] = await Promise.all([
      this.prisma.stockMovement.findMany({
        where,
        orderBy: { created_at: 'desc' },
        skip,
        take,
      }),
      this.prisma.stockMovement.count({ where }),
    ]);

    return {
      items: rows.map(toMovementResponse),
      page: query.page,
      page_size: query.page_size,
      total,
    };
  }

  /** სტრიქონი უნდა არსებობდეს, თორემ `UPDATE`-ს განსაახლებელი არაფერი აქვს */
  private async ensureItem(productId: string): Promise<ItemRow> {
    return this.prisma.inventoryItem.upsert({
      where: { product_id: productId },
      create: { product_id: productId },
      update: {},
    });
  }

  /**
   * ყველა პროდუქტს 1:1 უნდა შეესაბამებოდეს მარაგის სტრიქონი, თორემ ახალი პროდუქტი
   * სიაში არ გამოჩნდება. seed მათ ქმნის, ადმინკიდან შექმნილი პროდუქტი კი — არა
   * (კატალოგი მარაგის ცხრილს არ ეხება), ამიტომ სხვაობა აქ ივსება.
   *
   * ჩვეულებრივ ორი `COUNT` სრულდება და მეტი არაფერი.
   */
  private async syncMissingItems(): Promise<void> {
    const [products, items] = await Promise.all([
      this.products.countAll(),
      this.prisma.inventoryItem.count(),
    ]);
    if (products <= items) return;

    const ids = await this.products.allIds();
    const { count } = await this.prisma.inventoryItem.createMany({
      data: ids.map((product_id) => ({ product_id })),
      skipDuplicates: true,
    });
    if (count > 0) {
      this.logger.log(`მარაგის ${count} ახალი სტრიქონი შეიქმნა (ნულებით)`);
    }
  }

  private async productSummaries(
    ids: string[],
  ): Promise<Map<string, ProductSummaryResponse>> {
    const summaries = await this.products.summariesByIds(ids);
    return new Map(summaries.map((s) => [s.id, s]));
  }
}

/** ნიშანი ტიპს უნდა ემთხვეოდეს: ასე „მიღება −5“ ვერ ჩაიწერება */
function assertSignMatchesType(dto: CreateStockMovementDto): void {
  const expected = MOVEMENT_SIGN[dto.type];
  if (expected === 'positive' && dto.quantity < 0) {
    throw new AppError(
      422,
      'INVALID_MOVEMENT_SIGN',
      `ტიპი ${dto.type} მარაგს ზრდის — quantity დადებითი უნდა იყოს`,
    );
  }
  if (expected === 'negative' && dto.quantity > 0) {
    throw new AppError(
      422,
      'INVALID_MOVEMENT_SIGN',
      `ტიპი ${dto.type} მარაგს ამცირებს — quantity უარყოფითი უნდა იყოს`,
    );
  }
}

function toItemResponse(
  row: ItemRow,
  product: ProductSummaryResponse | null,
): InventoryItemResponse {
  const available = row.on_hand - row.reserved;
  return {
    product_id: row.product_id,
    product,
    on_hand: row.on_hand,
    reserved: row.reserved,
    available,
    low_stock_threshold: row.low_stock_threshold,
    is_low_stock: available <= row.low_stock_threshold,
    updated_at: row.updated_at.toISOString(),
  };
}

function toMovementResponse(row: MovementRow): StockMovementResponse {
  return {
    id: row.id,
    product_id: row.product_id,
    type: row.type,
    quantity: row.quantity,
    order_id: row.order_id,
    reason: row.reason,
    actor_id: row.actor_id,
    created_at: row.created_at.toISOString(),
  };
}
