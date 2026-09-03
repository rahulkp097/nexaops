import { ConfigService } from '@nestjs/config';
import { HealthCheckError } from '@nestjs/terminus';
import { PostgresHealthIndicator } from './postgres.health-indicator';

const mockQuery = jest.fn();

jest.mock('pg', () => ({
  Pool: jest.fn().mockImplementation(() => ({
    query: mockQuery,
    end: jest.fn(),
  })),
}));

describe('PostgresHealthIndicator', () => {
  let indicator: PostgresHealthIndicator;
  const config = { get: jest.fn().mockReturnValue('postgresql://test') } as unknown as ConfigService;

  beforeEach(() => {
    mockQuery.mockReset();
    indicator = new PostgresHealthIndicator(config);
  });

  it('reports up when the query succeeds', async () => {
    mockQuery.mockResolvedValue({ rows: [{ '?column?': 1 }] });

    await expect(indicator.isHealthy('postgres')).resolves.toEqual({
      postgres: { status: 'up' },
    });
  });

  it('throws HealthCheckError when the query fails', async () => {
    mockQuery.mockRejectedValue(new Error('connection refused'));

    await expect(indicator.isHealthy('postgres')).rejects.toBeInstanceOf(HealthCheckError);
  });
});
