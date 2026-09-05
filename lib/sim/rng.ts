/**
 * Seeded pseudo-random number generation.
 *
 * Everything in the simulation derives from `mulberry32`, so a given seed
 * always reproduces the exact same run. Two flavours are used:
 *
 * - A sequential stream (`Rng`) advanced by the world step. Its state is a
 *   single 32-bit integer stored inside the world state, so snapshots and
 *   restores keep the stream in sync.
 * - Hashed, stateless noise (`hashRng`) for per-(tick, entity) effects such as
 *   box jitter or confidence drift. The result depends only on the hashed
 *   inputs, so seeking to an arbitrary time reproduces the same noise.
 */

export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function next(): number {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Mixes any number of 32-bit integers into one well-distributed 32-bit hash. */
export function hash32(...parts: number[]): number {
  let h = 0x811c9dc5;
  for (const p of parts) {
    let v = Math.trunc(p) >>> 0;
    for (let i = 0; i < 4; i++) {
      h ^= v & 0xff;
      h = Math.imul(h, 0x01000193);
      v >>>= 8;
    }
  }
  h ^= h >>> 16;
  h = Math.imul(h, 0x7feb352d);
  h ^= h >>> 15;
  h = Math.imul(h, 0x846ca68b);
  h ^= h >>> 16;
  return h >>> 0;
}

/** Stable string hash (FNV-1a) used to derive seeds from labels. */
export function strHash(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

export class Rng {
  private a: number;

  constructor(seed: number) {
    this.a = seed >>> 0;
  }

  /** Current 32-bit state; store it to resume the stream later. */
  get state(): number {
    return this.a;
  }

  set state(v: number) {
    this.a = v >>> 0;
  }

  /** Uniform float in [0, 1). */
  next(): number {
    this.a = (this.a + 0x6d2b79f5) >>> 0;
    let t = this.a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  float(min: number, max: number): number {
    return min + (max - min) * this.next();
  }

  /** Integer in [min, max] inclusive. */
  int(min: number, max: number): number {
    return min + Math.floor(this.next() * (max - min + 1));
  }

  chance(p: number): boolean {
    return this.next() < p;
  }

  /** Gaussian sample via Box–Muller. */
  gaussian(mean = 0, sd = 1): number {
    let u = 0;
    let v = 0;
    while (u === 0) u = this.next();
    while (v === 0) v = this.next();
    const n = Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
    return mean + n * sd;
  }

  pick<T>(arr: readonly T[]): T {
    const item = arr[Math.floor(this.next() * arr.length)];
    if (item === undefined) throw new Error("Rng.pick on empty array");
    return item;
  }

  /** Fisher–Yates shuffle, returns a new array. */
  shuffle<T>(arr: readonly T[]): T[] {
    const out = arr.slice();
    for (let i = out.length - 1; i > 0; i--) {
      const j = Math.floor(this.next() * (i + 1));
      const a = out[i] as T;
      out[i] = out[j] as T;
      out[j] = a;
    }
    return out;
  }
}

/**
 * Stateless noise source: a fresh generator whose seed is the hash of the
 * given parts. Use string parts for salts ("jitter", "conf") and numbers for
 * tick / entity identifiers.
 */
export function hashRng(...parts: Array<number | string>): Rng {
  const ints = parts.map((p) => (typeof p === "string" ? strHash(p) : p));
  return new Rng(hash32(...ints));
}

/** Deterministic 1-D value noise in [-1, 1], continuous in `x`. */
export function valueNoise1(seed: number, x: number): number {
  const i = Math.floor(x);
  const f = x - i;
  const s = f * f * (3 - 2 * f);
  const a = (hash32(seed, i) / 4294967296) * 2 - 1;
  const b = (hash32(seed, i + 1) / 4294967296) * 2 - 1;
  return a + (b - a) * s;
}

/** Deterministic 2-D value noise in [0, 1], continuous in `x` and `y`. */
export function valueNoise2(seed: number, x: number, y: number): number {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const fx = x - xi;
  const fy = y - yi;
  const sx = fx * fx * (3 - 2 * fx);
  const sy = fy * fy * (3 - 2 * fy);
  const n = (a: number, b: number): number => hash32(seed, a, b) / 4294967296;
  const top = n(xi, yi) + (n(xi + 1, yi) - n(xi, yi)) * sx;
  const bottom = n(xi, yi + 1) + (n(xi + 1, yi + 1) - n(xi, yi + 1)) * sx;
  return top + (bottom - top) * sy;
}
