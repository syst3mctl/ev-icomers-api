import { Injectable } from '@nestjs/common';
import { decimalToNumber } from '../../common/decimal.js';
import { toSkipTake } from '../../common/dto/page-query.dto.js';
import { AppError } from '../../common/filters/problem-details.filter.js';
import { isUniqueViolation } from '../../infra/prisma/prisma-errors.js';
import { PrismaService } from '../../infra/prisma/prisma.service.js';
import { ChargerBrandsService } from './charger-brands.service.js';
import type {
  ChargerModelListResponse,
  ChargerModelResponse,
  CreateChargerModelDto,
  ListChargerModelsQueryDto,
  UpdateChargerModelDto,
} from './dto/charger-model.dto.js';

const MODEL_INCLUDE = {
  brand: { select: { slug: true, name: true } },
  _count: { select: { products: true } },
} as const;

type ModelRow = {
  id: string;
  brand_id: string;
  slug: string;
  name: string;
  revision: string | null;
  power_kw: unknown;
  image_key: string | null;
  is_active: boolean;
  created_at: Date;
  updated_at: Date;
  brand: { slug: string; name: string };
  _count: { products: number };
};

/** დამტენების მოდელები (`charger_models`). `slug` უნიკალურია ბრენდის შიგნით. */
@Injectable()
export class ChargerModelsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly brands: ChargerBrandsService,
  ) {}

  async list(
    query: ListChargerModelsQueryDto,
  ): Promise<ChargerModelListResponse> {
    const { skip, take } = toSkipTake(query);
    const where = buildWhere(query);

    const [rows, total] = await Promise.all([
      this.prisma.chargerModel.findMany({
        where,
        include: MODEL_INCLUDE,
        orderBy: [{ brand: { name: 'asc' } }, { name: 'asc' }],
        skip,
        take,
      }),
      this.prisma.chargerModel.count({ where }),
    ]);

    return {
      items: rows.map(toModelResponse),
      page: query.page,
      page_size: query.page_size,
      total,
    };
  }

  async getById(id: string): Promise<ChargerModelResponse> {
    const row = await this.prisma.chargerModel.findUnique({
      where: { id },
      include: MODEL_INCLUDE,
    });
    if (!row) throw modelNotFound(id);
    return toModelResponse(row);
  }

  async create(dto: CreateChargerModelDto): Promise<ChargerModelResponse> {
    await this.brands.assertExists(dto.brand_id);

    try {
      const row = await this.prisma.chargerModel.create({
        data: {
          brand_id: dto.brand_id,
          slug: dto.slug,
          name: dto.name,
          revision: dto.revision ?? null,
          power_kw: dto.power_kw ?? null,
          image_key: dto.image_key ?? null,
          is_active: dto.is_active ?? true,
        },
        include: MODEL_INCLUDE,
      });
      return toModelResponse(row);
    } catch (error) {
      throw toSlugConflict(error, dto.slug);
    }
  }

  async update(
    id: string,
    dto: UpdateChargerModelDto,
  ): Promise<ChargerModelResponse> {
    await this.assertExists(id);
    if (dto.brand_id) await this.brands.assertExists(dto.brand_id);

    try {
      const row = await this.prisma.chargerModel.update({
        where: { id },
        data: {
          ...(dto.brand_id === undefined ? {} : { brand_id: dto.brand_id }),
          ...(dto.slug === undefined ? {} : { slug: dto.slug }),
          ...(dto.name === undefined ? {} : { name: dto.name }),
          ...(dto.revision === undefined ? {} : { revision: dto.revision }),
          ...(dto.power_kw === undefined ? {} : { power_kw: dto.power_kw }),
          ...(dto.image_key === undefined ? {} : { image_key: dto.image_key }),
          ...(dto.is_active === undefined ? {} : { is_active: dto.is_active }),
        },
        include: MODEL_INCLUDE,
      });
      return toModelResponse(row);
    } catch (error) {
      throw toSlugConflict(error, dto.slug);
    }
  }

  /**
   * მოდელის წაშლა. `product_compatibility` `onDelete: Cascade`-ია, ამიტომ
   * მიბმული პროდუქტები „კარგავენ“ ამ მოდელს — მაგრამ თავად პროდუქტები რჩება.
   * რომ შეცდომით დიდი რაოდენობა არ წაიშალოს, მიბმულ მოდელზე პასუხია `409`:
   * ჯერ უნდა მოხდეს კავშირების მოხსნა ან `is_active: false`.
   */
  async remove(id: string): Promise<void> {
    await this.assertExists(id);

    const products = await this.prisma.productCompatibility.count({
      where: { charger_model_id: id },
    });
    if (products > 0) {
      throw new AppError(
        409,
        'CHARGER_MODEL_IN_USE',
        `მოდელი არ იშლება: მიბმულია ${products} პროდუქტზე. მოხსენი კავშირები ან გამორთე (is_active: false)`,
        [{ products }],
      );
    }

    await this.prisma.chargerModel.delete({ where: { id } });
  }

  /** სხვა service-ებისთვის: მოდელი არსებობს თუ არა */
  async assertExists(id: string): Promise<void> {
    const found = await this.prisma.chargerModel.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!found) throw modelNotFound(id);
  }

  /** რომელი id-ები არ არსებობს (ცარიელი მასივი — ყველა არსებობს) */
  async findMissingIds(ids: string[]): Promise<string[]> {
    if (ids.length === 0) return [];
    const rows = await this.prisma.chargerModel.findMany({
      where: { id: { in: ids } },
      select: { id: true },
    });
    const found = new Set(rows.map((r) => r.id));
    return ids.filter((id) => !found.has(id));
  }
}

function buildWhere(query: ListChargerModelsQueryDto) {
  const q = query.q?.trim();
  return {
    ...(query.brand_id ? { brand_id: query.brand_id } : {}),
    ...(query.is_active === undefined ? {} : { is_active: query.is_active }),
    ...(q
      ? {
          OR: [
            { slug: { contains: q, mode: 'insensitive' as const } },
            { name: { contains: q, mode: 'insensitive' as const } },
            { revision: { contains: q, mode: 'insensitive' as const } },
          ],
        }
      : {}),
  };
}

function modelNotFound(id: string): AppError {
  return new AppError(
    404,
    'CHARGER_MODEL_NOT_FOUND',
    `დამტენის მოდელი ${id} ვერ მოიძებნა`,
  );
}

/** `@@unique([brand_id, slug])` — ერთ ბრენდში ერთი slug ერთხელ */
function toSlugConflict(error: unknown, slug?: string): unknown {
  if (!isUniqueViolation(error)) return error;
  return new AppError(
    409,
    'CHARGER_MODEL_SLUG_TAKEN',
    `slug "${slug}" ამ ბრენდში უკვე გამოყენებულია`,
  );
}

function toModelResponse(row: ModelRow): ChargerModelResponse {
  return {
    id: row.id,
    brand_id: row.brand_id,
    brand_slug: row.brand.slug,
    brand_name: row.brand.name,
    slug: row.slug,
    name: row.name,
    revision: row.revision,
    power_kw: decimalToNumber(row.power_kw),
    image_key: row.image_key,
    is_active: row.is_active,
    product_count: row._count.products,
    created_at: row.created_at.toISOString(),
    updated_at: row.updated_at.toISOString(),
  };
}
