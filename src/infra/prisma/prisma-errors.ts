/**
 * Prisma-ს შეცდომების ამოცნობა კოდით, კლასის იმპორტის გარეშე
 * (გენერირებული client-ის ექსპორტებზე დამოკიდებულების თავიდან ასარიდებლად).
 * კოდების სია: https://www.prisma.io/docs/orm/reference/error-reference
 */
function errorCode(error: unknown): string | undefined {
  if (typeof error === 'object' && error !== null && 'code' in error) {
    const { code } = error as { code: unknown };
    return typeof code === 'string' ? code : undefined;
  }
  return undefined;
}

/** `unique` შეზღუდვის დარღვევა */
export function isUniqueViolation(error: unknown): boolean {
  return errorCode(error) === 'P2002';
}

/** ჩანაწერი ვერ მოიძებნა (`update` / `delete` არარსებულზე) */
export function isNotFound(error: unknown): boolean {
  return errorCode(error) === 'P2025';
}

/** foreign key-ის დარღვევა: დაკავშირებული ჩანაწერები არსებობს (`onDelete: Restrict`) */
export function isForeignKeyViolation(error: unknown): boolean {
  return errorCode(error) === 'P2003';
}
