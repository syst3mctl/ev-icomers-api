import { SetMetadata, type CustomDecorator } from '@nestjs/common';

/** ადმინის როლები Identity-ის ტოკენის `roles` claim-იდან (SYSTEM.md §4) */
export const ROLES = ['admin', 'manager', 'content_editor', 'warehouse'] as const;

export type Role = (typeof ROLES)[number];

export const ROLES_METADATA_KEY = 'icomers:roles';

/**
 * ვინ შეიძლება გამოიძახოს endpoint. დეკორატორის გარეშე `/v1/admin/*` მხოლოდ `admin`-ს უშვებს.
 * მაგ. `@Roles('content_editor', 'manager', 'admin')`
 */
export function Roles(...roles: Role[]): CustomDecorator<string> {
  return SetMetadata(ROLES_METADATA_KEY, roles);
}

/** კატალოგის რედაქტირება: docs/05-api.md §4 — „editor+“ */
export const CATALOG_EDITOR_ROLES: Role[] = [
  'content_editor',
  'manager',
  'admin',
];

/** მარაგის მართვა: docs/05-api.md §4 — „warehouse+“ */
export const INVENTORY_ROLES: Role[] = ['warehouse', 'manager', 'admin'];
