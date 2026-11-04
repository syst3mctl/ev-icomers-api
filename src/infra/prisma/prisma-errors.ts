/**
 * Prisma-ს შეცდომების ამოცნობა კოდით, კლასის იმპორტის გარეშე
 * (გენერირებული client-ის ექსპორტებზე დამოკიდებულების თავიდან ასარიდებლად).
 * კოდების სია: https://www.prisma.io/docs/orm/reference/error-reference
 */
export function prismaErrorCode(error: unknown): string | undefined {
  if (typeof error !== 'object' || error === null) return undefined;
  // `PrismaClientKnownRequestError`-ს `code` აქვს, `PrismaClientInitializationError`-ს — `errorCode`
  const { code, errorCode: initCode } = error as {
    code?: unknown;
    errorCode?: unknown;
  };
  if (typeof code === 'string') return code;
  if (typeof initCode === 'string') return initCode;
  return undefined;
}

/** `unique` შეზღუდვის დარღვევა */
export function isUniqueViolation(error: unknown): boolean {
  return prismaErrorCode(error) === 'P2002';
}

/** ჩანაწერი ვერ მოიძებნა (`update` / `delete` არარსებულზე) */
export function isNotFound(error: unknown): boolean {
  return prismaErrorCode(error) === 'P2025';
}

/** foreign key-ის დარღვევა: დაკავშირებული ჩანაწერები არსებობს (`onDelete: Restrict`) */
export function isForeignKeyViolation(error: unknown): boolean {
  return prismaErrorCode(error) === 'P2003';
}

/**
 * ბაზა მიუწვდომელია: კავშირი არ დამყარდა, გაწყდა, ან pool-ის ლოდინი ამოიწურა.
 * კოდები ორი წყაროდან მოდის:
 *   - Prisma-ს საკუთარი `P1xxx` (+ `P2024` — pool);
 *   - დრაივერის (node-postgres) errno, რომელსაც `@prisma/adapter-pg` უცვლელად გადმოსცემს
 *     — მაგ. `ECONNREFUSED`, როცა Postgres-ის კონტეინერი არ მუშაობს.
 * ეს ინფრასტრუქტურის და არა მოთხოვნის შეცდომაა, ამიტომ `503 DATABASE_UNAVAILABLE`.
 */
const UNAVAILABLE_CODES: ReadonlySet<string> = new Set([
  'P1000', // ავთენტიფიკაცია ვერ გაიარა
  'P1001', // სერვერი მიუწვდომელია
  'P1002', // კავშირის ლოდინი ამოიწურა
  'P1008', // ოპერაციის ლოდინი ამოიწურა
  'P1010', // მომხმარებელს ბაზაზე წვდომა არ აქვს
  'P1017', // სერვერმა კავშირი დახურა
  'P2024', // pool-ში თავისუფალი კავშირის ლოდინი ამოიწურა
  'ECONNREFUSED', // პორტი დახურულია (კონტეინერი არ მუშაობს)
  'ECONNRESET', // კავშირი შუა გზაში გაწყდა
  'ENOTFOUND', // host ვერ მოიძებნა
  'EHOSTUNREACH',
  'ETIMEDOUT',
  'EAI_AGAIN', // DNS დროებით არ პასუხობს
]);

export function isDatabaseUnavailable(error: unknown): boolean {
  const code = prismaErrorCode(error);
  return code !== undefined && UNAVAILABLE_CODES.has(code);
}
