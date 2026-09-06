import { PasswordService } from './password.service';

describe('PasswordService', () => {
  const service = new PasswordService();

  it('produces a hash that verifies against the original password', async () => {
    const hash = await service.hash('correct-horse-battery-staple');

    await expect(service.verify(hash, 'correct-horse-battery-staple')).resolves.toBe(true);
  });

  it('rejects an incorrect password', async () => {
    const hash = await service.hash('correct-horse-battery-staple');

    await expect(service.verify(hash, 'wrong-password')).resolves.toBe(false);
  });

  it('resolves false instead of throwing for a malformed stored hash', async () => {
    await expect(service.verify('not-a-real-bcrypt-hash', 'anything')).resolves.toBe(false);
  });
});
