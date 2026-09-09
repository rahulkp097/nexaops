import { RequestContextService } from './request-context.service';

describe('RequestContextService', () => {
  it('returns undefined outside of run()', () => {
    const service = new RequestContextService();

    expect(service.requestId).toBeUndefined();
  });

  it('exposes the requestId set for the current run() only', async () => {
    const service = new RequestContextService();

    await service.run({ requestId: 'req-1' }, async () => {
      expect(service.requestId).toBe('req-1');
    });

    expect(service.requestId).toBeUndefined();
  });

  it('keeps concurrent run() calls isolated from each other', async () => {
    const service = new RequestContextService();
    const seen: string[] = [];

    await Promise.all([
      service.run({ requestId: 'req-a' }, async () => {
        await new Promise((resolve) => setTimeout(resolve, 10));
        seen.push(service.requestId as string);
      }),
      service.run({ requestId: 'req-b' }, async () => {
        seen.push(service.requestId as string);
      }),
    ]);

    expect(seen.sort()).toEqual(['req-a', 'req-b']);
  });
});
