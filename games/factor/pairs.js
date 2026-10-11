'use strict';

const STATS = require('./stats.json');

/** Limites absolues du sélecteur (×1/1000 … ×1000). */
const MIN_RATIO = 1 / 1000;
const MAX_RATIO = 1000;

/**
 * Bande « fun » : le facteur réel (plus grand / plus petit) est entre ×2 et ×50.
 * Trop proche → quiz trop dur ; trop énorme → tout le monde tape ×1000.
 */
const FUN_RATIO_MIN = 2;
const FUN_RATIO_MAX = 50;
/** Petite dose de paires hors bande pour le choc occasionnel. */
const WILD_CHANCE = 0.12;

function publicStat(stat, { hideValue = false } = {}) {
  if (!stat) return null;
  const base = {
    id: stat.id,
    label: stat.label,
    unit: stat.unit,
    unitFamily: stat.unitFamily,
    category: stat.category,
    year: stat.year,
    region: stat.region,
    source: stat.source,
    sourceUrl: stat.sourceUrl
  };
  if (!hideValue) {
    base.value = stat.value;
  }
  return base;
}

function ratioMagnitude(r) {
  if (!Number.isFinite(r) || r <= 0) return Infinity;
  return r >= 1 ? r : 1 / r;
}

function isFunRatio(r) {
  const m = ratioMagnitude(r);
  return m >= FUN_RATIO_MIN && m <= FUN_RATIO_MAX;
}

function ratioOk(a, b) {
  const r = b.value / a.value;
  return Number.isFinite(r) && r >= MIN_RATIO && r <= MAX_RATIO;
}

function pairKey(a, b) {
  return `${a.id}|${b.id}`;
}

function buildCandidatePairs() {
  const byFamily = new Map();
  for (const s of STATS) {
    if (!s.value || s.value <= 0) continue;
    if (!byFamily.has(s.unitFamily)) byFamily.set(s.unitFamily, []);
    byFamily.get(s.unitFamily).push(s);
  }
  const pairs = [];
  for (const list of byFamily.values()) {
    for (let i = 0; i < list.length; i++) {
      for (let j = 0; j < list.length; j++) {
        if (i === j) continue;
        const a = list[i];
        const b = list[j];
        if (!ratioOk(a, b)) continue;
        const realRatio = b.value / a.value;
        pairs.push({
          a,
          b,
          realRatio,
          funBand: isFunRatio(realRatio),
          differentCategory: a.category !== b.category
        });
      }
    }
  }
  return pairs;
}

const CANDIDATES = buildCandidatePairs();

function firstNonEmpty(...pools) {
  for (const pool of pools) {
    if (pool && pool.length) return pool;
  }
  return CANDIDATES;
}

function pickPair(usedKeys = []) {
  const used = new Set(usedKeys);
  const isFresh = (p) => {
    const k = pairKey(p.a, p.b);
    const rev = pairKey(p.b, p.a);
    return !used.has(k) && !used.has(rev);
  };

  const fresh = CANDIDATES.filter(isFresh);
  const funDiff = fresh.filter((p) => p.funBand && p.differentCategory);
  const funAny = fresh.filter((p) => p.funBand);
  const wildDiff = fresh.filter((p) => !p.funBand && p.differentCategory);
  const wildAny = fresh.filter((p) => !p.funBand);
  const anyDiff = fresh.filter((p) => p.differentCategory);

  const wantWild = Math.random() < WILD_CHANCE;
  const pool = wantWild
    ? firstNonEmpty(wildDiff, wildAny, anyDiff, fresh, CANDIDATES)
    : firstNonEmpty(funDiff, funAny, anyDiff, fresh, CANDIDATES);

  const pick = pool[Math.floor(Math.random() * pool.length)];
  return {
    a: pick.a,
    b: pick.b,
    key: pairKey(pick.a, pick.b),
    realRatio: pick.realRatio
  };
}

module.exports = {
  STATS,
  CANDIDATES,
  pickPair,
  publicStat,
  MIN_RATIO,
  MAX_RATIO,
  FUN_RATIO_MIN,
  FUN_RATIO_MAX,
  isFunRatio,
  ratioMagnitude
};
