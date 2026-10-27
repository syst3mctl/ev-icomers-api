import { z } from 'zod';

/**
 * ყველა env ცვლადი აქ აღიწერება და მოწმდება გაშვებისას.
 * არასწორი ან აკლია → აპი არ ეშვება და ლოგში ჩანს, რომელი ცვლადია პრობლემა.
 */
const envSchema = z.object({
  NODE_ENV: z
    .enum(['development', 'test', 'production'])
    .default('development'),
  PORT: z.coerce.number().int().positive().default(4000),
  LOG_LEVEL: z
    .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace'])
    .default('info'),

  DATABASE_URL: z.url(),

  /** Swagger UI `/docs` — dev და staging-ზე ჩართული, production-ში გამორთული */
  SWAGGER_ENABLED: z
    .enum(['true', 'false'])
    .default('true')
    .transform((v) => v === 'true'),

  /** მძიმით გამოყოფილი სია: http://localhost:3000,http://localhost:3001 */
  CORS_ORIGINS: z
    .string()
    .default('')
    .transform((v) =>
      v
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean),
    ),

  RESERVATION_TTL_MINUTES: z.coerce.number().int().positive().default(15),

  /**
   * მხოლოდ ლოკალური დეველოპმენტისთვის: რომელი როლებით მივდივართ `/v1/admin/*`-ზე,
   * სანამ Identity-ის JWT-ის შემოწმება არ გაკეთდება (იხ. `AdminGuard`).
   * `NODE_ENV=development`-ის გარეთ არ მოქმედებს.
   */
  DEV_ADMIN_ROLES: z
    .string()
    .default('')
    .transform((v) =>
      v
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean),
    ),
});

export type Env = z.infer<typeof envSchema>;

export function validateEnv(raw: Record<string, unknown>): Env {
  const result = envSchema.safeParse(raw);
  if (!result.success) {
    const details = result.error.issues
      .map((i) => `  - ${i.path.join('.')}: ${i.message}`)
      .join('\n');
    throw new Error(`Invalid environment variables:\n${details}`);
  }
  return result.data;
}
