export type HealthStatus = {
  status: 'ok' | 'degraded' | 'down';
};

// Mirrors apps/gateway/src/users/user.types.ts — this is the canonical
// definition; the gateway re-exports it rather than declaring its own, so
// the API contract and the server's internal model can't drift apart.
export type Role = 'ADMIN' | 'MANAGER' | 'EMPLOYEE';
export type UserStatus = 'ACTIVE' | 'DISABLED';
