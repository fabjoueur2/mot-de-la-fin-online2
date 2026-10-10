'use strict';

const STATS = require('./stats.json');

const MIN_RATIO = 1 / 1000;
const MAX_RATIO = 1000;

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

function ratioOk(a, b) {
  const r = b.value / a.value;
  return Number.isFinite(r) && r >= MIN_RATIO && r <= MAX_RATIO;
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
        pairs.push({ a, b, differentCategory: a.category !== b.category });
      }
    }
  }
  return pairs;
}

const CANDIDATES = buildCandidatePairs();

function pickPair(usedKeys = []) {
  const used = new Set(usedKeys);
  const preferDiff = CANDIDATES.filter(
    (p) =>
      p.differentCategory &&
      !used.has(`${p.a.id}|${p.b.id}`) &&
      !used.has(`${p.b.id}|${p.a.id}`)
  );
  const pool =
    preferDiff.length > 0
      ? preferDiff
      : CANDIDATES.filter((p) => !used.has(`${p.a.id}|${p.b.id}`));
  const list = pool.length ? pool : CANDIDATES;
  const pick = list[Math.floor(Math.random() * list.length)];
  return {
    a: pick.a,
    b: pick.b,
    key: `${pick.a.id}|${pick.b.id}`,
    realRatio: pick.b.value / pick.a.value
  };
}

module.exports = {
  STATS,
  CANDIDATES,
  pickPair,
  publicStat,
  MIN_RATIO,
  MAX_RATIO
};
