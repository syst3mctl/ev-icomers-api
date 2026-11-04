import { SetMetadata, type CustomDecorator } from '@nestjs/common';

/**
 * ადმინის როლები (SYSTEM.md §4). ინახება `admin_users.roles`-ში.
 * `superadmin` ყველა როლის უფლებას მოიცავს და მხოლოდ მას შეუძლია
 * მომხმარებლების შექმნა და როლების მინიჭება.
 */
export const ROLES = [
  'superadmin',
  'admin',
  'manager',
  'content_editor',
  'warehouse',
] as const;

export type Role = (typeof ROLES)[number];

export function isRole(value: string): value is Role {
  return (ROLES as readonly string[]).includes(value);
}

export const ROLES_METADATA_KEY = 'icomers:roles';

/**
 * ვინ შეიძლება გამოიძახოს endpoint. დეკორატორის გარეშე `/v1/admin/*` მხოლოდ `admin`-ს უშვებს.
 * `superadmin` ყოველთვის გადის. მაგ. `@Roles('content_editor', 'manager', 'admin')`
 */
export function Roles(...roles: Role[]): CustomDecorator<string> {
  return SetMetadata(ROLES_METADATA_KEY, roles);
}

/** ნებისმიერი შესული მომხმარებელი, როლის მიუხედავად (მაგ. `/v1/auth/me`) */
export const ANY_ROLE: Role[] = [...ROLES];

/** კატალოგის რედაქტირება: docs/05-api.md §4 — „editor+“ */
export const CATALOG_EDITOR_ROLES: Role[] = [
  'content_editor',
  'manager',
  'admin',
];

/** მარაგის მართვა: docs/05-api.md §4 — „warehouse+“ */
export const INVENTORY_ROLES: Role[] = ['warehouse', 'manager', 'admin'];

/** აქვს თუ არა მომხმარებელს ერთ-ერთი საჭირო როლი */
export function hasAnyRole(
  userRoles: readonly Role[],
  required: readonly Role[],
): boolean {
  if (userRoles.includes('superadmin')) return true;
  return required.some((role) => userRoles.includes(role));
}
