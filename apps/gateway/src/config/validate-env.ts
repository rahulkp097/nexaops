const REQUIRED_KEYS = ['JWT_SECRET', 'JWT_REFRESH_SECRET', 'DATABASE_APP_URL', 'RABBITMQ_URL', 'REDIS_URL'] as const;

// Phase 22 (spec §31: "Environment-specific secret management"). None of
// these have a code-level fallback (unlike apps/ai-service's pydantic
// Settings, which default to local dev values) — today a missing one
// fails silently at whatever moment it's first actually read (e.g.
// JWT_SECRET only when the first token is signed), not at startup. This
// turns that into one clear boot-time error naming every missing variable.
export function validateEnv(config: Record<string, unknown>): Record<string, unknown> {
  const missing = REQUIRED_KEYS.filter((key) => !config[key]);
  if (missing.length > 0) {
    throw new Error(`Missing required environment variable(s): ${missing.join(', ')}`);
  }
  return config;
}
