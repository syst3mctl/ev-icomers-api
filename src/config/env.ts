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

  /**
   * `true` → ლოგში იწერება ყველა SQL query, პარამეტრებით და ხანგრძლივობით.
   * მხოლოდ გასარკვევად (რა SQL-ს აწარმოებს Prisma-ს კოდი) — ლოგი ბევრია,
   * ამიტომ `development`-ის გარეთ არ მოქმედებს.
   */
  LOG_SQL: z
    .enum(['true', 'false'])
    .default('false')
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
   * Express-ის `trust proxy`: რამდენი reverse proxy დგას API-ს წინ (usectl-ზე:
   * Cloudflare → Traefik → ადმინკის nginx). საჭიროა სწორი `req.ip`-ისთვის
   * (ლოგი, refresh token-ის `ip`). 0 — არცერთი (ლოკალურად).
   */
  TRUST_PROXY_HOPS: z.coerce.number().int().min(0).default(0),

  // --- ადმინის ავტორიზაცია (src/modules/auth) ---

  /**
   * JWT-ის ხელმოწერის გასაღები: ES256 (P-256) private key, PKCS#8 PEM.
   * `\n` შეიძლება ჩაიწეროს ერთ სტრიქონში — წაკითხვისას ნამდვილ ხაზად იქცევა.
   * production-ში სავალდებულოა. development/test-ში თუ არ არის, გაშვებისას
   * დროებითი გასაღები იქმნება (access token-ები API-ს გადატვირთვისას უქმდება,
   * refresh token-ები კი რჩება — ადმინკა მომხმარებლისთვის შეუმჩნევლად განაახლებს).
   * გენერაცია: `openssl genpkey -algorithm EC -pkeyopt ec_paramgen_curve:P-256`
   */
  JWT_PRIVATE_KEY: z
    .string()
    .optional()
    .transform((v) => (v ? v.replace(/\\n/g, '\n') : undefined)),
  /** JWKS-ში `kid`; გასაღების შეცვლისას იცვლება */
  JWT_KEY_ID: z.string().min(1).default('icomers-1'),
  /** ტოკენის `iss` — API-ს საჯარო მისამართი */
  JWT_ISSUER: z.string().min(1).default('http://localhost:4000'),
  /** ტოკენის `aud` */
  JWT_AUDIENCE: z.string().min(1).default('icomers-admin'),
  ACCESS_TOKEN_TTL_SECONDS: z.coerce.number().int().min(60).default(900),
  REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().min(1).default(14),
  /**
   * cookie-ს `Secure` ატრიბუტი. ნაგულისხმევად ჩართულია ყველგან, გარდა development-ისა
   * (ლოკალურად http://localhost-ზე ვმუშაობთ).
   */
  COOKIE_SECURE: z
    .enum(['true', 'false'])
    .optional()
    .transform((v) => (v === undefined ? undefined : v === 'true')),
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
  const env = result.data;
  if (env.NODE_ENV === 'production' && !env.JWT_PRIVATE_KEY) {
    throw new Error(
      'Invalid environment variables:\n  - JWT_PRIVATE_KEY: required in production',
    );
  }
  return env;
}
