import { Injectable } from '@nestjs/common';
import { ProductStatus } from '../../generated/prisma/enums.js';
import type { Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../infra/prisma/prisma.service.js';

export type PublicTranslation = {
  locale: string;
  name: string;
  short_description?: string | null;
  description?: string | null;
  seo_title?: string | null;
  seo_description?: string | null;
};

export type PublicCategoryRow = {
  id: string;
  parent_id: string | null;
  slug: string;
  sort_order: number;
  translations: PublicTranslation[];
  active_product_count: number;
};

const PUBLIC_PRODUCT_SELECT = {
  id: true,
  sku: true,
  slug: true,
  category_id: true,
  price_minor: true,
  compare_at_price_minor: true,
  is_universal: true,
  is_featured: true,
  translations: {
    select: { locale: true, name: true, short_description: true },
  },
  images: {
    orderBy: { sort_order: 'asc' },
    take: 1,
    select: { storage_key: true, alt: true, width: true, height: true },
  },
  category: {
    select: {
      slug: true,
      translations: { select: { locale: true, name: true } },
    },
  },
} as const satisfies Prisma.ProductSelect;

const PUBLIC_PRODUCT_DETAIL_SELECT = {
  ...PUBLIC_PRODUCT_SELECT,
  attributes: true,
  oem_part_numbers: true,
  weight_g: true,
  translations: true,
  images: {
    orderBy: { sort_order: 'asc' },
    select: { storage_key: true, alt: true, width: true, height: true },
  },
} as const satisfies Prisma.ProductSelect;

export type PublicProductRow = Prisma.ProductGetPayload<{
  select: typeof PUBLIC_PRODUCT_SELECT;
}>;
export type PublicProductDetailRow = Prisma.ProductGetPayload<{
  select: typeof PUBLIC_PRODUCT_DETAIL_SELECT;
}>;

export const PUBLIC_PRODUCT_SORTS = [
  'featured',
  'newest',
  'price_asc',
  'price_desc',
] as const;
export type PublicProductSort = (typeof PUBLIC_PRODUCT_SORTS)[number];

const ORDER_BY: Record<
  PublicProductSort,
  Prisma.ProductOrderByWithRelationInput[]
> = {
  featured: [{ is_featured: 'desc' }, { created_at: 'desc' }, { id: 'asc' }],
  newest: [{ created_at: 'desc' }, { id: 'asc' }],
  price_asc: [{ price_minor: 'asc' }, { id: 'asc' }],
  price_desc: [{ price_minor: 'desc' }, { id: 'asc' }],
};

export type PublicProductSearch = {
  categoryIds?: string[];
  q?: string;
  minPrice?: number;
  maxPrice?: number;
  /** მხოლოდ ეს id-ები (მაგ. მარაგში არსებული) */
  onlyIds?: string[];
  /** თავსებადობის ფილტრი: ამ id-ებიდან ნებისმიერი **ან** უნივერსალური */
  compatibleIds?: string[];
  excludeId?: string;
  sort: PublicProductSort;
  skip: number;
  take: number;
};

/**
 * კატალოგის საჯარო (storefront) წაკითხვა: **მხოლოდ** აქტიური კატეგორიები და `ACTIVE`
 * პროდუქტები აქტიურ კატეგორიაში. აბრუნებს ბაზის სტრიქონებს — პასუხის ფორმას,
 * ენას, მარაგის სტატუსს და თავსებადობას `storefront` მოდული აწყობს.
 */
@Injectable()
export class CatalogPublicService {
  constructor(private readonly prisma: PrismaService) {}

  async categories(): Promise<PublicCategoryRow[]> {
    const rows = await this.prisma.category.findMany({
      where: { is_active: true },
      orderBy: [{ sort_order: 'asc' }, { slug: 'asc' }],
      select: {
        id: true,
        parent_id: true,
        slug: true,
        sort_order: true,
        translations: {
          select: { locale: true, name: true, description: true },
        },
        _count: {
          select: { products: { where: { status: ProductStatus.ACTIVE } } },
        },
      },
    });
    return rows.map(({ _count, ...row }) => ({
      ...row,
      active_product_count: _count.products,
    }));
  }

  /**
   * კატეგორია slug-ით + მისი ყველა აქტიური ქვეკატეგორია (ხის ქვემოთ).
   * `null` — ასეთი აქტიური კატეგორია არ არსებობს.
   */
  async categoryWithDescendants(slug: string): Promise<string[] | null> {
    const all = await this.prisma.category.findMany({
      where: { is_active: true },
      select: { id: true, parent_id: true, slug: true },
    });
    const root = all.find((c) => c.slug === slug);
    if (!root) return null;
    const ids = [root.id];
    for (let i = 0; i < ids.length; i++) {
      for (const c of all) if (c.parent_id === ids[i]) ids.push(c.id);
    }
    return ids;
  }

  /** კატეგორიის გზა ფესვიდან (breadcrumbs). გამორთული წინაპარი წყვეტს ჯაჭვს */
  async categoryPath(
    categoryId: string,
  ): Promise<{ slug: string; translations: PublicTranslation[] }[]> {
    const all = await this.prisma.category.findMany({
      where: { is_active: true },
      select: {
        id: true,
        parent_id: true,
        slug: true,
        translations: { select: { locale: true, name: true } },
      },
    });
    const byId = new Map(all.map((c) => [c.id, c]));
    const path: { slug: string; translations: PublicTranslation[] }[] = [];
    let current = byId.get(categoryId);
    while (current && path.length < 20) {
      path.unshift({ slug: current.slug, translations: current.translations });
      current = current.parent_id ? byId.get(current.parent_id) : undefined;
    }
    return path;
  }

  async searchProducts(
    params: PublicProductSearch,
  ): Promise<{ rows: PublicProductRow[]; total: number }> {
    const where = publicWhere(params);
    const [rows, total] = await Promise.all([
      this.prisma.product.findMany({
        where,
        select: PUBLIC_PRODUCT_SELECT,
        orderBy: ORDER_BY[params.sort],
        skip: params.skip,
        take: params.take,
      }),
      this.prisma.product.count({ where }),
    ]);
    return { rows, total };
  }

  async productBySlug(slug: string): Promise<PublicProductDetailRow | null> {
    return this.prisma.product.findFirst({
      where: {
        slug,
        status: ProductStatus.ACTIVE,
        category: { is_active: true },
      },
      select: PUBLIC_PRODUCT_DETAIL_SELECT,
    });
  }

  /** ძებნის ავტოშევსებისთვის: კატეგორიები სახელით ან slug-ით */
  async suggestCategories(q: string, take: number) {
    return this.prisma.category.findMany({
      where: {
        is_active: true,
        OR: [
          { slug: { contains: q, mode: 'insensitive' } },
          {
            translations: {
              some: { name: { contains: q, mode: 'insensitive' } },
            },
          },
        ],
      },
      orderBy: [{ sort_order: 'asc' }, { slug: 'asc' }],
      take,
      select: {
        slug: true,
        translations: { select: { locale: true, name: true } },
      },
    });
  }
}

function publicWhere(p: PublicProductSearch): Prisma.ProductWhereInput {
  const and: Prisma.ProductWhereInput[] = [
    { status: ProductStatus.ACTIVE },
    { category: { is_active: true } },
  ];
  if (p.categoryIds) and.push({ category_id: { in: p.categoryIds } });
  if (p.onlyIds) and.push({ id: { in: p.onlyIds } });
  if (p.excludeId) and.push({ id: { not: p.excludeId } });
  if (p.compatibleIds) {
    and.push({ OR: [{ id: { in: p.compatibleIds } }, { is_universal: true }] });
  }
  if (p.minPrice !== undefined) and.push({ price_minor: { gte: p.minPrice } });
  if (p.maxPrice !== undefined) and.push({ price_minor: { lte: p.maxPrice } });
  const q = p.q?.trim();
  if (q) {
    and.push({
      OR: [
        { sku: { contains: q, mode: 'insensitive' } },
        { oem_part_numbers: { has: q } },
        {
          translations: {
            some: { name: { contains: q, mode: 'insensitive' } },
          },
        },
      ],
    });
  }
  return { AND: and };
}
