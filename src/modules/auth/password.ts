import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';

/**
 * პაროლის ჰეში — scrypt (Node-ის ჩაშენებული, დამატებითი native დამოკიდებულების გარეშე).
 * ფორმატი: `scrypt$N$r$p$<salt base64url>$<hash base64url>` — პარამეტრები ჰეშშივე
 * ინახება, ამიტომ მომავალში მათი გაძლიერება ძველ პაროლებს არ ტეხს.
 */
const N = 2 ** 15;
const R = 8;
const P = 1;
const KEY_LENGTH = 64;
const SALT_BYTES = 16;
/** N=2^15, r=8 → ~32 MiB; Node-ის ნაგულისხმევი ლიმიტი (32 MiB) ზედმიწევნით არ ყოფნის */
const MAX_MEM = 64 * 1024 * 1024;

export const PASSWORD_MIN_LENGTH = 10;
export const PASSWORD_MAX_LENGTH = 128;

function derive(
  password: string,
  salt: Buffer,
  n: number,
  r: number,
  p: number,
  keyLength: number,
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(
      password.normalize('NFKC'),
      salt,
      keyLength,
      { N: n, r, p, maxmem: MAX_MEM },
      (err, key) => (err ? reject(err) : resolve(key)),
    );
  });
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(SALT_BYTES);
  const hash = await derive(password, salt, N, R, P, KEY_LENGTH);
  return [
    'scrypt',
    N,
    R,
    P,
    salt.toString('base64url'),
    hash.toString('base64url'),
  ].join('$');
}

export async function verifyPassword(
  password: string,
  stored: string,
): Promise<boolean> {
  const parts = stored.split('$');
  if (parts.length !== 6 || parts[0] !== 'scrypt') return false;
  const [, n, r, p, saltB64, hashB64] = parts as [
    string,
    string,
    string,
    string,
    string,
    string,
  ];
  const expected = Buffer.from(hashB64, 'base64url');
  try {
    const actual = await derive(
      password,
      Buffer.from(saltB64, 'base64url'),
      Number(n),
      Number(r),
      Number(p),
      expected.length,
    );
    return (
      actual.length === expected.length && timingSafeEqual(actual, expected)
    );
  } catch {
    // დაზიანებული ჰეში (არასწორი პარამეტრები) — 500-ის ნაცვლად „პაროლი არასწორია“
    return false;
  }
}

/**
 * არარსებული მომხმარებლის ლოგინზეც იგივე დრო უნდა დაიხარჯოს, რომ პასუხის
 * სიჩქარით არ გამოჩნდეს, რომელი ელ. ფოსტა არსებობს.
 */
let dummyHash: Promise<string> | undefined;
export async function burnPasswordCheck(password: string): Promise<void> {
  dummyHash ??= hashPassword('icomers-timing-equalizer');
  await verifyPassword(password, await dummyHash);
}
