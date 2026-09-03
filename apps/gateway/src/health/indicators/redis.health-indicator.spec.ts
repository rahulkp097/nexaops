import { ConfigService } from '@nestjs/config';
import { HealthCheckError } from '@nestjs/terminus';
import { RedisHealthIndicator } from './redis.health-indicator';

const mockPing = jest.fn();

jest.mock('ioredis', () => ({
  __esModule: true,
  default: jest.fn().mockImplementation(() => ({
    status: 'ready',
    ping: mockPing,
    connect: jest.fn(),
    disconnect: jest.fn(),
  })),
}));

describe('RedisHealthIndicator', () => {
  let indicator: RedisHealthIndicator;
  const config = { get: jest.fn().mockReturnValue('redis://test') } as unknown as ConfigService;

  beforeEach(() => {
    mockPing.mockReset();
    indicator = new RedisHealthIndicator(config);
  });

  it('reports up when ping succeeds', async () => {
    mockPing.mockResolvedValue('PONG');

    await expect(indicator.isHealthy('redis')).resolves.toEqual({
      redis: { status: 'up' },
    });
  });

  it('throws HealthCheckError when ping fails', async () => {
    mockPing.mockRejectedValue(new Error('connection refused'));

    await expect(indicator.isHealthy('redis')).rejects.toBeInstanceOf(HealthCheckError);
  });
});
