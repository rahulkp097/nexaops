import { ConfigService } from '@nestjs/config';
import { HealthCheckError } from '@nestjs/terminus';
import { RabbitmqHealthIndicator } from './rabbitmq.health-indicator';

const mockConnect = jest.fn();

jest.mock('amqplib', () => ({
  connect: (...args: unknown[]) => mockConnect(...args),
}));

describe('RabbitmqHealthIndicator', () => {
  let indicator: RabbitmqHealthIndicator;
  const config = { get: jest.fn().mockReturnValue('amqp://test') } as unknown as ConfigService;

  beforeEach(() => {
    mockConnect.mockReset();
    indicator = new RabbitmqHealthIndicator(config);
  });

  it('reports up when a channel can be opened', async () => {
    const closeChannel = jest.fn().mockResolvedValue(undefined);
    mockConnect.mockResolvedValue({
      createChannel: jest.fn().mockResolvedValue({ close: closeChannel }),
      close: jest.fn(),
    });

    await expect(indicator.isHealthy('rabbitmq')).resolves.toEqual({
      rabbitmq: { status: 'up' },
    });
    expect(closeChannel).toHaveBeenCalled();
  });

  it('throws HealthCheckError when the connection fails', async () => {
    mockConnect.mockRejectedValue(new Error('connection refused'));

    await expect(indicator.isHealthy('rabbitmq')).rejects.toBeInstanceOf(HealthCheckError);
  });

  it('retries the connection after a failure instead of reusing a dead one', async () => {
    mockConnect.mockRejectedValueOnce(new Error('connection refused'));
    await expect(indicator.isHealthy('rabbitmq')).rejects.toBeInstanceOf(HealthCheckError);

    const closeChannel = jest.fn().mockResolvedValue(undefined);
    mockConnect.mockResolvedValueOnce({
      createChannel: jest.fn().mockResolvedValue({ close: closeChannel }),
      close: jest.fn(),
    });

    await expect(indicator.isHealthy('rabbitmq')).resolves.toEqual({
      rabbitmq: { status: 'up' },
    });
    expect(mockConnect).toHaveBeenCalledTimes(2);
  });
});
