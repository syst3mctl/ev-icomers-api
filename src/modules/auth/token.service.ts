import { Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  exportJWK,
  generateKeyPair,
  importJWK,
  importPKCS8,
  jwtVerify,
  SignJWT,
  type CryptoKey,
  type JWK,
} from 'jose';
import {
  createHash,
  createPublicKey,
  randomBytes,
  randomUUID,
} from 'node:crypto';
import type { Env } from '../../config/env.js';
import type { Role } from './roles.js';

const ALG = 'ES256';

export interface AccessTokenClaims {
  sub: string;
  email: string;
  roles: Role[];
  /** გაცემის დრო, წამებში */
  iat: number;
  exp: number;
}

/**
 * JWT access token-ების ხელმოწერა და შემოწმება (ES256), JWKS-ის გამოქვეყნება.
 * refresh token-ები JWT არ არის: შემთხვევითი 256-ბიტიანი სტრიქონია, ბაზაში ჰეშით.
 */
@Injectable()
export class TokenService implements OnModuleInit {
  private readonly logger = new Logger(TokenService.name);
  private privateKey!: CryptoKey;
  private publicKey!: CryptoKey;
  private publicJwk!: JWK;
  private loading?: Promise<void>;

  constructor(private readonly config: ConfigService<Env, true>) {}

  async onModuleInit(): Promise<void> {
    await this.loadKeys();
  }

  /** ერთხელ იტვირთება; პარალელური გამოძახებები ერთსა და იმავე Promise-ს ელოდება */
  private loadKeys(): Promise<void> {
    this.loading ??= this.doLoadKeys();
    return this.loading;
  }

  private async doLoadKeys(): Promise<void> {
    const pem = this.config.get('JWT_PRIVATE_KEY', { infer: true });
    if (pem) {
      this.privateKey = await importPKCS8(pem, ALG, { extractable: false });
      const publicKeyObject = createPublicKey(pem);
      this.publicJwk = publicKeyObject.export({ format: 'jwk' }) as JWK;
      this.publicKey = (await importJWK(this.publicJwk, ALG)) as CryptoKey;
    } else {
      const pair = await generateKeyPair(ALG, { extractable: true });
      this.privateKey = pair.privateKey;
      this.publicKey = pair.publicKey;
      this.publicJwk = await exportJWK(pair.publicKey);
      this.logger.warn(
        'JWT_PRIVATE_KEY არ არის — გამოიყენება დროებითი გასაღები (მხოლოდ development/test)',
      );
    }
    this.publicJwk = {
      kty: this.publicJwk.kty,
      crv: this.publicJwk.crv,
      x: this.publicJwk.x,
      y: this.publicJwk.y,
      kid: this.config.get('JWT_KEY_ID', { infer: true }),
      alg: ALG,
      use: 'sig',
    };
  }

  get accessTokenTtlSeconds(): number {
    return this.config.get('ACCESS_TOKEN_TTL_SECONDS', { infer: true });
  }

  get refreshTokenTtlMs(): number {
    return (
      this.config.get('REFRESH_TOKEN_TTL_DAYS', { infer: true }) *
      24 *
      60 *
      60 *
      1000
    );
  }

  async signAccessToken(user: {
    id: string;
    email: string;
    roles: Role[];
  }): Promise<string> {
    await this.loadKeys();
    return new SignJWT({ email: user.email, roles: user.roles })
      .setProtectedHeader({
        alg: ALG,
        typ: 'at+jwt',
        kid: this.config.get('JWT_KEY_ID', { infer: true }),
      })
      .setSubject(user.id)
      .setIssuer(this.config.get('JWT_ISSUER', { infer: true }))
      .setAudience(this.config.get('JWT_AUDIENCE', { infer: true }))
      .setIssuedAt()
      .setExpirationTime(`${this.accessTokenTtlSeconds}s`)
      .setJti(randomUUID())
      .sign(this.privateKey);
  }

  /** აბრუნებს claim-ებს ან `null`-ს (ვადაგასული, ყალბი, სხვა issuer/audience) */
  async verifyAccessToken(token: string): Promise<AccessTokenClaims | null> {
    await this.loadKeys();
    try {
      const { payload } = await jwtVerify(token, this.publicKey, {
        algorithms: [ALG],
        issuer: this.config.get('JWT_ISSUER', { infer: true }),
        audience: this.config.get('JWT_AUDIENCE', { infer: true }),
        typ: 'at+jwt',
      });
      if (typeof payload.sub !== 'string' || typeof payload.iat !== 'number')
        return null;
      return payload as unknown as AccessTokenClaims;
    } catch {
      return null;
    }
  }

  /** `/.well-known/jwks.json` — სხვა სერვისებს შეუძლიათ ტოკენი თავად შეამოწმონ */
  async jwks(): Promise<{ keys: JWK[] }> {
    await this.loadKeys();
    return { keys: [this.publicJwk] };
  }

  newRefreshToken(): { token: string; hash: string } {
    const token = randomBytes(32).toString('base64url');
    return { token, hash: TokenService.hashRefreshToken(token) };
  }

  static hashRefreshToken(token: string): string {
    return createHash('sha256').update(token).digest('base64url');
  }
}
