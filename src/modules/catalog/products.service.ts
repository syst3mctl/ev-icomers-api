import { Injectable } from '@nestjs/common';
import { toSkipTake } from '../../common/dto/page-query.dto.js';
import { AppError } from '../../common/filters/problem-details.filter.js';
import { DEFAULT_LOCALE } from '../../common/locales.js';
import { ProductStatus } from '../../generated/prisma/enums.js';
import { isUniqueViolation } from '../../infra/prisma/prisma-errors.js';
import { PrismaService } from '../../infra/prisma/prisma.service.js';
import type {
  ListProductsQueryDto,
  ProductSort,
} from './dto/list-products.query.dto.js';
import type {
  CreateProductDto,
  ProductListResponse,
  ProductResponse,
  ProductSummaryResponse,
  ProductTranslationDto,
  UpdateProductDto,
} from './dto/product.dto.js';

const PRODUCT_INCLUDE = {
  category: { select: { slug: true } },
  translations: { orderBy: { locale: 'asc' } },
  images: { orderBy: { sort_order: 'asc' } },
} as const;

const ORDER_BY: Record<ProductSort, Record<string, 'asc' | 'desc'>> = {
  newest: { created_at: 'desc' },
  oldest: { created_at: 'asc' },
  price_asc: { price_minor: 'asc' },
  price_desc: { price_minor: 'desc' },
  sku_asc: { sku: 'asc' },
};

type TranslationRow = {
  locale: string;
  name: string;
  short_description: string | null;
  description: string | null;
  seo_title: string | null;
  seo_description: string | null;
};

type ProductRow = {
  id: string;
  sku: string;
  slug: string;
  status: ProductStatus;
  category_id: string;
  price_minor: number;
  compare_at_price_minor: number | null;
  vat_rate_bp: number;
  oem_part_numbers: string[];
  attributes: unknown;
  is_universal: boolean;
  is_featured: boolean;
  weight_g: number | null;
  created_at: Date;
  updated_at: Date;
  category: { slug: string };
  translations: TranslationRow[];
  images: {
    id: string;
    storage_key: string;
    alt: unknown;
    sort_order: number;
    width: number | null;
    height: number | null;
  }[];
};

/**
 * ადმინის კატალოგი — პროდუქტები.
 *
 * მარაგი (`inventory_items`) და თავსებადობა (`product_compatibility`) აქ არ იკითხება:
 * ისინი სხვა მოდულების ცხრილებია და მათ საკუთარი service-ები მოემსახურება
 * (`inventory`, `compatibility` — CLAUDE.md → „წესები ამ რეპოში“).
 */
@Injectable()
export class ProductsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(query: ListProductsQueryDto): Promise<ProductListResponse> {
    const { skip, take } = toSkipTake(query);
    const q = query.q?.trim();

    const where = {
      ...(query.status ? { status: query.status } : {}),
      ...(query.category_id ? { category_id: query.category_id } : {}),
      ...(q
        ? {
            OR: [
              { sku: { contains: q, mode: 'insensitive' as const } },
              { slug: { contains: q, mode: 'insensitive' as const } },
              { oem_part_numbers: { has: q } },
              {
                translations: {
                  some: {
                    name: { contains: q, mode: 'insensitive' as const },
                  },
                },
              },
            ],
          }
        : {}),
    };

    const [rows, total] = await Promise.all([
      this.prisma.product.findMany({
        where,
        include: PRODUCT_INCLUDE,
        orderBy: ORDER_BY[query.sort],
        skip,
        take,
      }),
      this.prisma.product.count({ where }),
    ]);

    return {
      items: rows.map(toListItem),
      page: query.page,
      page_size: query.page_size,
      total,
    };
  }

  async getById(id: string): Promise<ProductResponse> {
    const row = await this.prisma.product.findUnique({
      where: { id },
      include: PRODUCT_INCLUDE,
    });
    if (!row) {
      throw new AppError(404, 'PRODUCT_NOT_FOUND', `პროდუქტი ${id} ვერ მოიძებნა`);
    }
    return toProductResponse(row);
  }

  async create(dto: CreateProductDto): Promise<ProductResponse> {
    requireDefaultLocale(dto.translations);
    assertComparePrice(dto.price_minor, dto.compare_at_price_minor ?? null);
    await this.assertCategoryExists(dto.category_id);

    try {
      const row = await this.prisma.product.create({
        data: {
          sku: dto.sku,
          slug: dto.slug,
          category_id: dto.category_id,
          status: dto.status ?? ProductStatus.DRAFT,
          price_minor: dto.price_minor,
          compare_at_price_minor: dto.compare_at_price_minor ?? null,
          ...(dto.vat_rate_bp === undefined
            ? {}
            : { vat_rate_bp: dto.vat_rate_bp }),
          oem_part_numbers: dto.oem_part_numbers ?? [],
          attributes: (dto.attributes ?? {}) as object,
          is_universal: dto.is_universal ?? false,
          is_featured: dto.is_featured ?? false,
          weight_g: dto.weight_g ?? null,
          translations: { create: dto.translations.map(toTranslationData) },
        },
        include: PRODUCT_INCLUDE,
      });
      return toProductResponse(row);
    } catch (error) {
      throw this.toConflict(error, dto.sku, dto.slug);
    }
  }

  async update(id: string, dto: UpdateProductDto): Promise<ProductResponse> {
    const current = await this.prisma.product.findUnique({
      where: { id },
      select: { price_minor: true, compare_at_price_minor: true },
    });
    if (!current) {
      throw new AppError(404, 'PRODUCT_NOT_FOUND', `პროდუქტი ${id} ვერ მოიძებნა`);
    }

    if (dto.translations) requireDefaultLocale(dto.translations);
    if (dto.category_id) await this.assertCategoryExists(dto.category_id);

    assertComparePrice(
      dto.price_minor ?? current.price_minor,
      dto.compare_at_price_minor === undefined
        ? current.compare_at_price_minor
        : dto.compare_at_price_minor,
    );

    try {
      const row = await this.prisma.product.update({
        where: { id },
        data: {
          ...pick(dto, [
            'sku',
            'slug',
            'category_id',
            'status',
            'price_minor',
            'vat_rate_bp',
            'oem_part_numbers',
            'is_universal',
            'is_featured',
          ]),
          ...(dto.compare_at_price_minor === undefined
            ? {}
            : { compare_at_price_minor: dto.compare_at_price_minor }),
          ...(dto.weight_g === undefined ? {} : { weight_g: dto.weight_g }),
          ...(dto.attributes === undefined
            ? {}
            : { attributes: dto.attributes as object }),
          ...(dto.translations
            ? {
                translations: {
                  upsert: dto.translations.map((t) => ({
                    where: {
                      product_id_locale: { product_id: id, locale: t.locale },
                    },
                    create: toTranslationData(t),
                    update: toTranslationData(t),
                  })),
                },
              }
            : {}),
        },
        include: PRODUCT_INCLUDE,
      });
      return toProductResponse(row);
    } catch (error) {
      throw this.toConflict(error, dto.sku, dto.slug);
    }
  }

  /**
   * არქივში გადატანა. პროდუქტი არ იშლება: მასზე შეკვეთები და მარაგის ისტორია
   * შეიძლება იყოს მიბმული (`docs/04-data-model.md`).
   */
  async archive(id: string): Promise<ProductResponse> {
    const row = await this.prisma.product.findUnique({
      where: { id },
      select: { status: true },
    });
    if (!row) {
      throw new AppError(404, 'PRODUCT_NOT_FOUND', `პროდუქტი ${id} ვერ მოიძებნა`);
    }
    if (row.status === ProductStatus.ARCHIVED) {
      throw new AppError(409, 'PRODUCT_ALREADY_ARCHIVED', 'პროდუქტი უკვე არქივშია');
    }

    const updated = await this.prisma.product.update({
      where: { id },
      data: { status: ProductStatus.ARCHIVED },
      include: PRODUCT_INCLUDE,
    });
    return toProductResponse(updated);
  }

  // ------------------------------------------------------------------
  // სხვა მოდულებისთვის (`compatibility`, `inventory`): ისინი `products`-ს
  // პირდაპირ არ კითხულობენ — CLAUDE.md → „წესები ამ რეპოში“ → მოდულები.
  // ------------------------------------------------------------------

  /** პროდუქტი არსებობს თუ არა; არ არსებობს → `404 PRODUCT_NOT_FOUND` */
  async assertExists(id: string): Promise<void> {
    const found = await this.prisma.product.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!found) {
      throw new AppError(404, 'PRODUCT_NOT_FOUND', `პროდუქტი ${id} ვერ მოიძებნა`);
    }
  }

  /** რომელი id-ები არ არსებობს (ცარიელი მასივი — ყველა არსებობს) */
  async findMissingIds(ids: string[]): Promise<string[]> {
    if (ids.length === 0) return [];
    const rows = await this.prisma.product.findMany({
      where: { id: { in: ids } },
      select: { id: true },
    });
    const found = new Set(rows.map((r) => r.id));
    return ids.filter((id) => !found.has(id));
  }

  /** მოკლე აღწერები id-ებით; რიგითობა მოთხოვნილი id-ების მიხედვით */
  async summariesByIds(ids: string[]): Promise<ProductSummaryResponse[]> {
    if (ids.length === 0) return [];
    const rows = await this.prisma.product.findMany({
      where: { id: { in: ids } },
      select: {
        id: true,
        sku: true,
        slug: true,
        status: true,
        translations: { select: { locale: true, name: true } },
      },
    });

    const byId = new Map(
      rows.map((row) => [
        row.id,
        {
          id: row.id,
          sku: row.sku,
          slug: row.slug,
          status: row.status,
          name: displayName(row.translations),
        },
      ]),
    );
    return ids.map((id) => byId.get(id)).filter((s) => s !== undefined);
  }

  /** პროდუქტების ჯამური რაოდენობა (`inventory`-ის სინქრონიზაციისთვის) */
  async countAll(): Promise<number> {
    return this.prisma.product.count();
  }

  /** ყველა პროდუქტის id (`inventory`-ის სინქრონიზაციისთვის) */
  async allIds(): Promise<string[]> {
    const rows = await this.prisma.product.findMany({ select: { id: true } });
    return rows.map((r) => r.id);
  }

  /** ერგება თუ არა ყველა დამტენის მოდელს (`compatibility`-ის პასუხისთვის) */
  async isUniversal(id: string): Promise<boolean> {
    const row = await this.prisma.product.findUnique({
      where: { id },
      select: { is_universal: true },
    });
    if (!row) {
      throw new AppError(404, 'PRODUCT_NOT_FOUND', `პროდუქტი ${id} ვერ მოიძებნა`);
    }
    return row.is_universal;
  }

  /**
   * `is_universal`-ის ჩართვა/გამორთვა — `compatibility`-ის
   * `PUT /admin/products/{id}/compatibility`-სთვის.
   */
  async setUniversal(id: string, isUniversal: boolean): Promise<void> {
    await this.assertExists(id);
    await this.prisma.product.update({
      where: { id },
      data: { is_universal: isUniversal },
    });
  }

  private async assertCategoryExists(categoryId: string): Promise<void> {
    const found = await this.prisma.category.findUnique({
      where: { id: categoryId },
      select: { id: true },
    });
    if (!found) {
      throw new AppError(
        422,
        'CATEGORY_NOT_FOUND',
        `კატეგორია ${categoryId} ვერ მოიძებნა`,
      );
    }
  }

  /** `sku` და `slug` უნიკალურია — ორივესთვის ცალკე კოდი, რომ ფრონტმა ზუსტი ველი მონიშნოს */
  private toConflict(error: unknown, sku?: string, slug?: string): unknown {
    if (!isUniqueViolation(error)) return error;

    const target = String(
      (error as { meta?: { target?: unknown } }).meta?.target ?? '',
    );
    if (target.includes('slug')) {
      return new AppError(
        409,
        'PRODUCT_SLUG_TAKEN',
        `slug "${slug}" უკვე გამოყენებულია`,
      );
    }
    return new AppError(409, 'PRODUCT_SKU_TAKEN', `SKU "${sku}" უკვე გამოყენებულია`);
  }
}

function pick<T extends object, K extends keyof T>(
  source: T,
  keys: K[],
): Partial<Pick<T, K>> {
  const out: Partial<Pick<T, K>> = {};
  for (const key of keys) {
    if (source[key] !== undefined) out[key] = source[key];
  }
  return out;
}

function toTranslationData(t: ProductTranslationDto): TranslationRow {
  return {
    locale: t.locale,
    name: t.name,
    short_description: t.short_description ?? null,
    description: t.description ?? null,
    seo_title: t.seo_title ?? null,
    seo_description: t.seo_description ?? null,
  };
}

function requireDefaultLocale(translations: ProductTranslationDto[]): void {
  if (!translations.some((t) => t.locale === DEFAULT_LOCALE)) {
    throw new AppError(
      422,
      'TRANSLATION_REQUIRED',
      `"${DEFAULT_LOCALE}" თარგმანი სავალდებულოა`,
    );
  }
}

/** გადახაზული ფასი მიმდინარეზე ნაკლები ვერ იქნება — ასეთი ფასდაკლება არ არსებობს */
function assertComparePrice(
  priceMinor: number,
  compareAtMinor: number | null,
): void {
  if (compareAtMinor !== null && compareAtMinor <= priceMinor) {
    throw new AppError(
      422,
      'INVALID_COMPARE_PRICE',
      'compare_at_price_minor უნდა იყოს price_minor-ზე მეტი',
    );
  }
}

/** `ka` სახელი; თუ არ არის — პირველი არსებული */
function displayName(translations: { locale: string; name: string }[]): string {
  const preferred = translations.find((t) => t.locale === DEFAULT_LOCALE);
  return preferred?.name ?? translations[0]?.name ?? '';
}

function toListItem(row: ProductRow): ProductListResponse['items'][number] {
  return {
    id: row.id,
    sku: row.sku,
    slug: row.slug,
    status: row.status,
    category_id: row.category_id,
    category_slug: row.category.slug,
    name: displayName(row.translations),
    price_minor: row.price_minor,
    compare_at_price_minor: row.compare_at_price_minor,
    is_universal: row.is_universal,
    is_featured: row.is_featured,
    created_at: row.created_at.toISOString(),
    updated_at: row.updated_at.toISOString(),
  };
}

function toProductResponse(row: ProductRow): ProductResponse {
  return {
    ...toListItem(row),
    vat_rate_bp: row.vat_rate_bp,
    oem_part_numbers: row.oem_part_numbers,
    attributes: (row.attributes ?? {}) as Record<string, unknown>,
    weight_g: row.weight_g,
    translations: row.translations.map((t) => ({
      locale: t.locale as ProductResponse['translations'][number]['locale'],
      name: t.name,
      short_description: t.short_description,
      description: t.description,
      seo_title: t.seo_title,
      seo_description: t.seo_description,
    })),
    images: row.images.map((img) => ({
      id: img.id,
      storage_key: img.storage_key,
      alt: (img.alt ?? {}) as Record<string, unknown>,
      sort_order: img.sort_order,
      width: img.width,
      height: img.height,
    })),
  };
}
