import { validateEnv } from './validate-env';

function baseConfig(overrides: Record<string, unknown> = {}) {
  return {
    JWT_SECRET: 'secret',
    JWT_REFRESH_SECRET: 'refresh-secret',
    DATABASE_APP_URL: 'postgresql://user:pass@localhost:5432/db',
    RABBITMQ_URL: 'amqp://localhost',
    REDIS_URL: 'redis://localhost:6379',
    ...overrides,
  };
}

describe('validateEnv', () => {
  it('returns the config unchanged when every required variable is present', () => {
    const config = baseConfig();

    expect(validateEnv(config)).toBe(config);
  });

  it('throws naming a single missing variable', () => {
    const config = baseConfig({ JWT_SECRET: undefined });

    expect(() => validateEnv(config)).toThrow('JWT_SECRET');
  });

  it('throws naming every missing variable at once', () => {
    const config = baseConfig({ JWT_SECRET: undefined, REDIS_URL: undefined });

    expect(() => validateEnv(config)).toThrow('JWT_SECRET, REDIS_URL');
  });

  it('treats an empty string the same as a missing variable', () => {
    const config = baseConfig({ DATABASE_APP_URL: '' });

    expect(() => validateEnv(config)).toThrow('DATABASE_APP_URL');
  });
});
