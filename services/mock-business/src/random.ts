// A tiny deterministic PRNG (mulberry32) — not for security, only so the
// seed data generator below produces byte-for-byte identical output on
// every run/restart, matching spec §19's "small deterministic operational
// API". A single well-known ~10-line algorithm didn't justify a dependency.
export function mulberry32(seed: number): () => number {
  let state = seed;
  return function next(): number {
    state |= 0;
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | state)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function randomInt(rng: () => number, min: number, max: number): number {
  return min + Math.floor(rng() * (max - min + 1));
}

export function pick<T>(rng: () => number, items: readonly T[]): T {
  return items[Math.floor(rng() * items.length)];
}
