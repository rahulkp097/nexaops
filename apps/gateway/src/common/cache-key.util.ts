/**
 * Namespaces a Redis key by organization, per spec §8/§29 (tenant isolation
 * applies to cache keys too). No real org context exists until Phase 2 adds
 * auth — this is the convention future callers build on.
 */
export function orgKey(organizationId: string, ...parts: string[]): string {
  return ['org', organizationId, ...parts].join(':');
}
