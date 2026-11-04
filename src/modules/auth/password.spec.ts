import { hashPassword, verifyPassword } from './password.js';

describe('password', () => {
  it('ჰეში იძლევა სწორ პაროლს და უარყოფს არასწორს', async () => {
    const hash = await hashPassword('002201Password');
    expect(hash).toMatch(/^scrypt\$32768\$8\$1\$[\w-]+\$[\w-]+$/);
    expect(await verifyPassword('002201Password', hash)).toBe(true);
    expect(await verifyPassword('002201password', hash)).toBe(false);
  });

  it('ერთი პაროლის ორი ჰეში განსხვავდება (salt)', async () => {
    const [a, b] = await Promise.all([
      hashPassword('same-password'),
      hashPassword('same-password'),
    ]);
    expect(a).not.toBe(b);
  });

  it('დაზიანებული ჰეში → false და არა exception', async () => {
    expect(await verifyPassword('x', 'garbage')).toBe(false);
    expect(await verifyPassword('x', 'bcrypt$1$2$3$4$5')).toBe(false);
  });
});
