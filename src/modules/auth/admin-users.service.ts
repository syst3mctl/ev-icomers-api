import { Injectable } from '@nestjs/common';
import { PageQueryDto, toSkipTake } from '../../common/dto/page-query.dto.js';
import { AppError } from '../../common/filters/problem-details.filter.js';
import { isUniqueViolation } from '../../infra/prisma/prisma-errors.js';
import { PrismaService } from '../../infra/prisma/prisma.service.js';
import {
  AuthService,
  normalizeEmail,
  toRoles,
  toUserView,
  type AdminPrincipal,
  type AdminUserView,
} from './auth.service.js';
import type {
  CreateAdminUserDto,
  UpdateAdminUserDto,
} from './dto/admin-user.dto.js';
import { hashPassword } from './password.js';

/** `pg_advisory_xact_lock`-ის გასაღები superadmin-ების ცვლილებისთვის (ნებისმიერი მუდმივი რიცხვი) */
const SUPERADMIN_LOCK_KEY = 4_250_001;

/**
 * ადმინკის მომხმარებლების მართვა („რეგისტრაცია“) — მხოლოდ superadmin.
 * მომხმარებელი არ იშლება, ითიშება: ისტორიაში (`actor_id`) მისი id რჩება.
 */
@Injectable()
export class AdminUsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auth: AuthService,
  ) {}

  async list(query: PageQueryDto): Promise<{
    items: AdminUserView[];
    page: number;
    page_size: number;
    total: number;
  }> {
    const { skip, take } = toSkipTake(query);
    const [rows, total] = await Promise.all([
      this.prisma.adminUser.findMany({
        orderBy: { created_at: 'asc' },
        skip,
        take,
      }),
      this.prisma.adminUser.count(),
    ]);
    return {
      items: rows.map(toUserView),
      page: query.page,
      page_size: query.page_size,
      total,
    };
  }

  async getById(id: string): Promise<AdminUserView> {
    return toUserView(await this.findOrThrow(id));
  }

  async create(
    dto: CreateAdminUserDto,
    actor: AdminPrincipal,
  ): Promise<AdminUserView> {
    const email = normalizeEmail(dto.email);
    try {
      const row = await this.prisma.adminUser.create({
        data: {
          email,
          password_hash: await hashPassword(dto.password),
          display_name: dto.display_name?.trim() || null,
          roles: dto.roles,
          created_by: actor.id,
        },
      });
      return toUserView(row);
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new AppError(
          409,
          'EMAIL_TAKEN',
          `${email} უკვე დარეგისტრირებულია`,
        );
      }
      throw error;
    }
  }

  async update(
    id: string,
    dto: UpdateAdminUserDto,
    actor: AdminPrincipal,
  ): Promise<AdminUserView> {
    // პაროლის ჰეში ტრანზაქციის გარეთ ითვლება (ნელია — lock-ს არ ვაკავებთ)
    const passwordHash =
      dto.password === undefined ? undefined : await hashPassword(dto.password);
    const passwordChanged = passwordHash !== undefined;

    const row = await this.prisma.$transaction(async (tx) => {
      // superadmin-ების ცვლილებები რიგში დგება: ორი superadmin ერთდროულად ერთმანეთს
      // ვერ მოხსნის ისე, რომ ერთიც არ დარჩეს (შემოწმება და ჩაწერა ერთ lock-ში)
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(${SUPERADMIN_LOCK_KEY})`;

      const current = await tx.adminUser.findUnique({ where: { id } });
      if (!current) {
        throw new AppError(
          404,
          'USER_NOT_FOUND',
          `მომხმარებელი ${id} ვერ მოიძებნა`,
        );
      }
      const currentRoles = toRoles(current.roles);
      const nextRoles = dto.roles ?? currentRoles;
      const nextActive = dto.is_active ?? current.is_active;

      const losesSuperadmin =
        currentRoles.includes('superadmin') &&
        current.is_active &&
        (!nextRoles.includes('superadmin') || !nextActive);

      if (losesSuperadmin) {
        if (id === actor.id) {
          throw new AppError(
            409,
            'CANNOT_DEMOTE_SELF',
            'საკუთარ თავს superadmin-ის როლს ან ანგარიშს ვერ გამორთავ',
          );
        }
        const others = await tx.adminUser.count({
          where: {
            id: { not: id },
            is_active: true,
            roles: { has: 'superadmin' },
          },
        });
        if (others === 0) {
          throw new AppError(
            409,
            'LAST_SUPERADMIN',
            'სისტემაში ერთი აქტიური superadmin მაინც უნდა დარჩეს',
          );
        }
      }

      return tx.adminUser.update({
        where: { id },
        data: {
          ...(dto.display_name === undefined
            ? {}
            : { display_name: dto.display_name?.trim() || null }),
          ...(dto.roles === undefined ? {} : { roles: dto.roles }),
          ...(dto.is_active === undefined ? {} : { is_active: dto.is_active }),
          ...(passwordHash
            ? {
                password_hash: passwordHash,
                password_changed_at: new Date(),
                failed_login_count: 0,
                locked_until: null,
              }
            : {}),
        },
      });
    });

    if (passwordChanged || dto.is_active === false) {
      await this.auth.revokeAllForUser(id);
    }
    return toUserView(row);
  }

  private async findOrThrow(id: string) {
    const row = await this.prisma.adminUser.findUnique({ where: { id } });
    if (!row)
      throw new AppError(
        404,
        'USER_NOT_FOUND',
        `მომხმარებელი ${id} ვერ მოიძებნა`,
      );
    return row;
  }
}
