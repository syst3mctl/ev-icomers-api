import type { ConfigService } from '@nestjs/config';
import { generateKeyPairSync } from 'node:crypto';
import { SignJWT } from 'jose';
import type { Env } from '../../config/env.js';
import { TokenService } from './token.service.js';

function config(overrides: Partial<Env> = {}): ConfigService<Env, true> {
  const values: Partial<Env> = {
    JWT_KEY_ID: 'test-1',
    JWT_ISSUER: 'http://api.test',
    JWT_AUDIENCE: 'icomers-admin',
    ACCESS_TOKEN_TTL_SECONDS: 900,
    REFRESH_TOKEN_TTL_DAYS: 14,
    ...overrides,
  };
  return { get: (key: keyof Env) => values[key] } as unknown as ConfigService<
    Env,
    true
  >;
}

const user = {
  id: '11111111-1111-4111-8111-111111111111',
  email: 'a@b.ge',
  roles: ['admin' as const],
};

describe('TokenService', () => {
  it('ხელმოწერილი ტოკენი მოწმდება და claim-ებს აბრუნებს', async () => {
    const svc = new TokenService(config());
    await svc.onModuleInit();
    const token = await svc.signAccessToken(user);
    const claims = await svc.verifyAccessToken(token);
    expect(claims).toMatchObject({
      sub: user.id,
      email: 'a@b.ge',
      roles: ['admin'],
    });
    expect(claims!.exp - claims!.iat).toBe(900);
  });

  it('სხვა issuer / audience / გასაღები → null', async () => {
    const a = new TokenService(config());
    const otherIssuer = new TokenService(config({ JWT_ISSUER: 'http://evil' }));
    const token = await a.signAccessToken(user);
    // სხვა instance-ს სხვა დროებითი გასაღები აქვს
    expect(await otherIssuer.verifyAccessToken(token)).toBeNull();
    expect(await a.verifyAccessToken(token + 'x')).toBeNull();
    expect(await a.verifyAccessToken('not-a-jwt')).toBeNull();
  });

  it('PEM გასაღები env-იდან: JWKS-ში მხოლოდ საჯარო ნაწილია', async () => {
    const { privateKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' });
    const pem = privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
    const svc = new TokenService(config({ JWT_PRIVATE_KEY: pem }));
    await svc.onModuleInit();

    const { keys } = await svc.jwks();
    expect(keys).toHaveLength(1);
    expect(keys[0]).toMatchObject({
      kty: 'EC',
      crv: 'P-256',
      alg: 'ES256',
      kid: 'test-1',
      use: 'sig',
    });
    expect(keys[0]).not.toHaveProperty('d');

    expect(
      await svc.verifyAccessToken(await svc.signAccessToken(user)),
    ).not.toBeNull();
  });

  it('typ-ის გარეშე (მაგ. id_token) ტოკენი არ მიიღება', async () => {
    const { privateKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' });
    const pem = privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
    const svc = new TokenService(config({ JWT_PRIVATE_KEY: pem }));
    const forged = await new SignJWT({ roles: ['superadmin'] })
      .setProtectedHeader({ alg: 'ES256' })
      .setSubject(user.id)
      .setIssuer('http://api.test')
      .setAudience('icomers-admin')
      .setIssuedAt()
      .setExpirationTime('5m')
      .sign(privateKey);
    expect(await svc.verifyAccessToken(forged)).toBeNull();
  });

  it('refresh token: შემთხვევითი, ჰეში დეტერმინისტული', () => {
    const svc = new TokenService(config());
    const a = svc.newRefreshToken();
    const b = svc.newRefreshToken();
    expect(a.token).not.toBe(b.token);
    expect(a.token.length).toBeGreaterThanOrEqual(43);
    expect(TokenService.hashRefreshToken(a.token)).toBe(a.hash);
  });
});
