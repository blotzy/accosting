const HASH_BASE = 0x811c9dc5;

function mulberry32(a) {
  return function () {
    let t = (a += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hashString(str) {
  let h = HASH_BASE;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
    h >>>= 0;
  }
  return h;
}

export class RNG {
  constructor(seedString) {
    this.seedString = seedString;
    this._seed = hashString(seedString);
    this._rand = mulberry32(this._seed);
  }

  next() {
    return this._rand();
  }

  nextRange(min, max) {
    return min + (max - min) * this.next();
  }

  nextInt(min, max) {
    return Math.floor(this.nextRange(min, max + 1));
  }

  nextSigned() {
    return this.next() * 2 - 1;
  }

  pick(array) {
    return array[Math.floor(this.next() * array.length)];
  }

  fork(label) {
    return new RNG(`${this.seedString}:${label}`);
  }
}

function safeStorageGet(key) {
  try {
    return window.localStorage.getItem(key);
  } catch (err) {
    return null;
  }
}

function safeStorageSet(key, value) {
  try {
    window.localStorage.setItem(key, value);
  } catch (err) {
    /* no-op */
  }
}

function resolveSeed() {
  const params = new URLSearchParams(window.location.search);
  if (params.has('seed')) {
    return params.get('seed');
  }

  const stored = safeStorageGet('wingedSeed');
  if (stored) return stored;

  const now = new Date();
  const seed = `${now.getUTCFullYear()}-${now.getUTCMonth() + 1}-${now.getUTCDate()}`;
  safeStorageSet('wingedSeed', seed);
  return seed;
}

const BASE_SEED = resolveSeed();
const GLOBAL_RNG = new RNG(BASE_SEED);

export function getSeed() {
  return BASE_SEED;
}

export function getGlobalRNG() {
  return GLOBAL_RNG;
}
