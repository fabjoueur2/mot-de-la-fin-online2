/**
 * Scoring Size It — erreur proportionnelle (×2 / ÷2 = même pénalité).
 * ratio = max(estimate/true, true/estimate) ≥ 1
 * ≤1.06 → 100 | =2 → 45 | ≥5 → 0  (interpolation log)
 */

function sizeRatio(estimate, trueSize) {
  const e = Number(estimate);
  const t = Number(trueSize);
  if (!Number.isFinite(e) || !Number.isFinite(t) || e <= 0 || t <= 0) return Infinity;
  return Math.max(e / t, t / e);
}

/** Points de base 0–100 selon le ratio. */
function baseScoreFromRatio(ratio) {
  if (!Number.isFinite(ratio) || ratio === Infinity) return 0;
  if (ratio <= 1.06) return 100;
  if (ratio >= 5) return 0;

  // log interpolate 1.06→100, 2→45, 5→0
  const anchors = [
    { r: 1.06, s: 100 },
    { r: 2, s: 45 },
    { r: 5, s: 0 }
  ];
  const lr = Math.log(ratio);
  for (let i = 0; i < anchors.length - 1; i++) {
    const a = anchors[i];
    const b = anchors[i + 1];
    if (ratio >= a.r && ratio <= b.r) {
      const t = (lr - Math.log(a.r)) / (Math.log(b.r) - Math.log(a.r));
      return Math.round(a.s + (b.s - a.s) * t);
    }
  }
  return 0;
}

function isPerfect(ratio) {
  return Number.isFinite(ratio) && ratio < 1.02;
}

/**
 * @param {Array<{ playerId: string, estimateM: number }>} estimates
 * @param {number} trueSizeM
 */
function scoreRound(estimates, trueSizeM) {
  const scored = estimates.map((row) => {
    const ratio = sizeRatio(row.estimateM, trueSizeM);
    const base = baseScoreFromRatio(ratio);
    const perfect = isPerfect(ratio);
    return {
      playerId: row.playerId,
      estimateM: row.estimateM,
      ratio,
      base,
      perfect,
      closest: false,
      bonusPerfect: perfect ? 10 : 0,
      bonusClosest: 0,
      total: base + (perfect ? 10 : 0)
    };
  });

  let bestRatio = Infinity;
  for (const s of scored) {
    if (s.ratio < bestRatio) bestRatio = s.ratio;
  }
  if (Number.isFinite(bestRatio)) {
    for (const s of scored) {
      if (s.ratio === bestRatio) {
        s.closest = true;
        s.bonusClosest = 5;
        s.total = s.base + s.bonusPerfect + s.bonusClosest;
      }
    }
  }

  return scored;
}

module.exports = {
  sizeRatio,
  baseScoreFromRatio,
  isPerfect,
  scoreRound
};
