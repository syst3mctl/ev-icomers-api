import { Injectable } from '@nestjs/common';
import { toSkipTake } from '../../common/dto/page-query.dto.js';
import { AppError } from '../../common/filters/problem-details.filter.js';
import { isUniqueViolation } from '../../infra/prisma/prisma-errors.js';
import { PrismaService } from '../../infra/prisma/prisma.service.js';
import type {
  ChargerBrandListResponse,
  ChargerBrandResponse,
  CreateChargerBrandDto,
  ListChargerBrandsQueryDto,
  UpdateChargerBrandDto,
} from './dto/charger-brand.dto.js';

const BRAND_INCLUDE = {
  _count: { select: { models: true } },
} as const;

type BrandRow = {
  id: string;
  slug: string;
  name: string;
  logo_key: string | null;
  sort_order: number;
  is_active: boolean;
  created_at: Date;
  updated_at: Date;
  _count: { models: number };
};

/** დამტენების ბრენდები (`charger_brands`) — docs/04-data-model.md → „თავსებადობა“ */
@Injectable()
export class ChargerBrandsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(
    query: ListChargerBrandsQueryDto,
  ): Promise<ChargerBrandListResponse> {
    const { skip, take } = toSkipTake(query);
    const where = buildWhere(query);

    const [rows, total] = await Promise.all([
      this.prisma.chargerBrand.findMany({
        where,
        include: BRAND_INCLUDE,
        orderBy: [{ sort_order: 'asc' }, { name: 'asc' }],
        skip,
        take,
      }),
      this.prisma.chargerBrand.count({ where }),
    ]);

    return {
      items: rows.map(toBrandResponse),
      page: query.page,
      page_size: query.page_size,
      total,
    };
  }

  async getById(id: string): Promise<ChargerBrandResponse> {
    const row = await this.prisma.chargerBrand.findUnique({
      where: { id },
      include: BRAND_INCLUDE,
    });
    if (!row) throw brandNotFound(id);
    return toBrandResponse(row);
  }

  async create(dto: CreateChargerBrandDto): Promise<ChargerBrandResponse> {
    try {
      const row = await this.prisma.chargerBrand.create({
        data: {
          slug: dto.slug,
          name: dto.name,
          logo_key: dto.logo_key ?? null,
          sort_order: dto.sort_order ?? 0,
          is_active: dto.is_active ?? true,
        },
        include: BRAND_INCLUDE,
      });
      return toBrandResponse(row);
    } catch (error) {
      throw toSlugConflict(error, dto.slug);
    }
  }

  async update(
    id: string,
    dto: UpdateChargerBrandDto,
  ): Promise<ChargerBrandResponse> {
    await this.assertExists(id);

    try {
      const row = await this.prisma.chargerBrand.update({
        where: { id },
        data: {
          ...(dto.slug === undefined ? {} : { slug: dto.slug }),
          ...(dto.name === undefined ? {} : { name: dto.name }),
          ...(dto.logo_key === undefined ? {} : { logo_key: dto.logo_key }),
          ...(dto.sort_order === undefined
            ? {}
            : { sort_order: dto.sort_order }),
          ...(dto.is_active === undefined ? {} : { is_active: dto.is_active }),
        },
        include: BRAND_INCLUDE,
      });
      return toBrandResponse(row);
    } catch (error) {
      throw toSlugConflict(error, dto.slug);
    }
  }

  /**
   * წაშლა მხოლოდ მაშინ, თუ ბრენდს მოდელები არ აქვს: `charger_models.brand_id`
   * `onDelete: Restrict`-ია, ანუ ბაზაც აკრძალავდა — აქ უბრალოდ ნათელი შეცდომა ბრუნდება.
   * დროებით დასამალად გამოიყენე `is_active: false`.
   */
  async remove(id: string): Promise<void> {
    await this.assertExists(id);

    const models = await this.prisma.chargerModel.count({
      where: { brand_id: id },
    });
    if (models > 0) {
      throw new AppError(
        409,
        'CHARGER_BRAND_NOT_EMPTY',
        `ბრენდი არ იშლება: მას ${models} მოდელი აქვს`,
        [{ models }],
      );
    }

    await this.prisma.chargerBrand.delete({ where: { id } });
  }

  /** სხვა service-ებისთვის: ბრენდი არსებობს თუ არა */
  async assertExists(id: string): Promise<void> {
    const found = await this.prisma.chargerBrand.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!found) throw brandNotFound(id);
  }
}

function buildWhere(query: ListChargerBrandsQueryDto) {
  const q = query.q?.trim();
  return {
    ...(query.is_active === undefined ? {} : { is_active: query.is_active }),
    ...(q
      ? {
          OR: [
            { slug: { contains: q, mode: 'insensitive' as const } },
            { name: { contains: q, mode: 'insensitive' as const } },
          ],
        }
      : {}),
  };
}

function brandNotFound(id: string): AppError {
  return new AppError(
    404,
    'CHARGER_BRAND_NOT_FOUND',
    `დამტენის ბრენდი ${id} ვერ მოიძებნა`,
  );
}

function toSlugConflict(error: unknown, slug?: string): unknown {
  if (!isUniqueViolation(error)) return error;
  return new AppError(
    409,
    'CHARGER_BRAND_SLUG_TAKEN',
    `slug "${slug}" უკვე გამოყენებულია`,
  );
}

function toBrandResponse(row: BrandRow): ChargerBrandResponse {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    logo_key: row.logo_key,
    sort_order: row.sort_order,
    is_active: row.is_active,
    model_count: row._count.models,
    created_at: row.created_at.toISOString(),
    updated_at: row.updated_at.toISOString(),
  };
}
