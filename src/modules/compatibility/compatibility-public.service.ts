import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../infra/prisma/prisma.service.js';

const MODEL_SELECT = {
  id: true,
  slug: true,
  name: true,
  revision: true,
  power_kw: true,
  brand: { select: { slug: true, name: true } },
} as const;

export type PublicModelRow = {
  id: string;
  slug: string;
  name: string;
  revision: string | null;
  power_kw: number | null;
  brand: { slug: string; name: string };
};

/**
 * თავსებადობის საჯარო წაკითხვა: მხოლოდ აქტიური ბრენდები და მოდელები
 * (გამორთული ბრენდის მოდელებიც დამალულია).
 */
@Injectable()
export class CompatibilityPublicService {
  constructor(private readonly prisma: PrismaService) {}

  async brands() {
    const rows = await this.prisma.chargerBrand.findMany({
      where: { is_active: true },
      orderBy: [{ sort_order: 'asc' }, { name: 'asc' }],
      select: {
        id: true,
        slug: true,
        name: true,
        _count: { select: { models: { where: { is_active: true } } } },
      },
    });
    return rows.map(({ _count, ...b }) => ({
      ...b,
      model_count: _count.models,
    }));
  }

  /** `null` — ბრენდი არ არსებობს ან გამორთულია */
  async modelsByBrandSlug(brandSlug: string): Promise<PublicModelRow[] | null> {
    const brand = await this.prisma.chargerBrand.findFirst({
      where: { slug: brandSlug, is_active: true },
      select: { id: true },
    });
    if (!brand) return null;
    const rows = await this.prisma.chargerModel.findMany({
      where: { brand_id: brand.id, is_active: true },
      orderBy: [{ name: 'asc' }, { revision: 'asc' }],
      select: MODEL_SELECT,
    });
    return rows.map(toModel);
  }

  async modelById(id: string): Promise<PublicModelRow | null> {
    const row = await this.prisma.chargerModel.findFirst({
      where: { id, is_active: true, brand: { is_active: true } },
      select: MODEL_SELECT,
    });
    return row ? toModel(row) : null;
  }

  /** ბრენდის ყველა აქტიური მოდელის id; `null` — ბრენდი არ არსებობს */
  async modelIdsByBrandSlug(brandSlug: string): Promise<string[] | null> {
    const models = await this.modelsByBrandSlug(brandSlug);
    return models ? models.map((m) => m.id) : null;
  }

  /** პროდუქტები, რომლებიც ამ მოდელებიდან ერთს მაინც ერგება (უნივერსალურები აქ არ შედის) */
  async productIdsForModels(modelIds: string[]): Promise<string[]> {
    if (modelIds.length === 0) return [];
    const rows = await this.prisma.productCompatibility.findMany({
      where: { charger_model_id: { in: modelIds } },
      select: { product_id: true },
      distinct: ['product_id'],
    });
    return rows.map((r) => r.product_id);
  }

  /** პროდუქტის გვერდისთვის: რომელ დამტენებს ერგება */
  async modelsForProduct(productId: string): Promise<PublicModelRow[]> {
    const rows = await this.prisma.chargerModel.findMany({
      where: {
        is_active: true,
        brand: { is_active: true },
        products: { some: { product_id: productId } },
      },
      orderBy: [{ brand: { sort_order: 'asc' } }, { name: 'asc' }],
      select: MODEL_SELECT,
    });
    return rows.map(toModel);
  }

  async suggestModels(q: string, take: number): Promise<PublicModelRow[]> {
    const rows = await this.prisma.chargerModel.findMany({
      where: {
        is_active: true,
        brand: { is_active: true },
        OR: [
          { name: { contains: q, mode: 'insensitive' } },
          { brand: { name: { contains: q, mode: 'insensitive' } } },
        ],
      },
      orderBy: [{ name: 'asc' }],
      take,
      select: MODEL_SELECT,
    });
    return rows.map(toModel);
  }
}

function toModel(row: {
  id: string;
  slug: string;
  name: string;
  revision: string | null;
  power_kw: { toNumber(): number } | null;
  brand: { slug: string; name: string };
}): PublicModelRow {
  return {
    ...row,
    power_kw: row.power_kw === null ? null : row.power_kw.toNumber(),
  };
}
