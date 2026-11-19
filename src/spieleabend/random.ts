// Unbiased randomness from crypto.getRandomValues. Rejection sampling: values in the
// incomplete last block of 2^32 are thrown away, so `x % n` has no modulo bias.

export type RandomSource = (out: Uint32Array) => Uint32Array;

export const cryptoSource: RandomSource = (out) => crypto.getRandomValues(out);

const RANGE = 0x1_0000_0000;

/** Largest multiple of n that fits in 2^32; draws at or above it are rejected. */
export function rejectionLimit(n: number): number {
  return RANGE - (RANGE % n);
}

/** Uniform integer in 0…n-1 (n ≤ 2^32). */
export function randomInt(n: number, source: RandomSource = cryptoSource): number {
  if (!Number.isInteger(n) || n < 1 || n > RANGE) throw new RangeError(`bad range ${n}`);
  if (n === 1) return 0;
  const limit = rejectionLimit(n);
  const buf = new Uint32Array(1);
  for (let tries = 0; tries < 1000; tries++) {
    const value = source(buf)[0]!;
    if (value < limit) return value % n;
  }
  throw new Error("random source keeps returning rejected values");
}

/** Fisher–Yates: every permutation equally likely. Returns a new array. */
export function shuffle<T>(items: readonly T[], source: RandomSource = cryptoSource): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = randomInt(i + 1, source);
    const tmp = out[i]!;
    out[i] = out[j]!;
    out[j] = tmp;
  }
  return out;
}

/** Deterministic source for tests (mulberry32 → 32-bit words). */
export function seededSource(seed: number): RandomSource {
  let a = seed >>> 0;
  return (out) => {
    for (let i = 0; i < out.length; i++) {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      out[i] = (t ^ (t >>> 14)) >>> 0;
    }
    return out;
  };
}
