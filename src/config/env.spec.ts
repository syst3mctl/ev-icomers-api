import { validateEnv } from './env.js';

describe('validateEnv', () => {
  const base = { DATABASE_URL: 'postgresql://u:p@localhost:5432/db' };

  it('applies defaults', () => {
    const env = validateEnv(base);
    expect(env.PORT).toBe(4000);
    expect(env.SWAGGER_ENABLED).toBe(true);
    expect(env.CORS_ORIGINS).toEqual([]);
    expect(env.RESERVATION_TTL_MINUTES).toBe(15);
  });

  it('parses CORS origins list', () => {
    const env = validateEnv({
      ...base,
      CORS_ORIGINS: 'http://localhost:3000, http://localhost:3001',
    });
    expect(env.CORS_ORIGINS).toEqual([
      'http://localhost:3000',
      'http://localhost:3001',
    ]);
  });

  it('fails without DATABASE_URL', () => {
    expect(() => validateEnv({})).toThrow(/DATABASE_URL/);
  });
});
