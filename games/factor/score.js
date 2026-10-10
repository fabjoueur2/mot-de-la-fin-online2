'use strict';

/**
 * G = rapport proposé (ex. 3 pour ×3, 0.25 pour ÷4)
 * R = B / A rapport réel
 * score = round(100 * exp(-abs(ln(G/R))))
 */
function guessToRatio(direction, factor) {
  const f = Number(factor);
  if (!Number.isFinite(f) || f <= 0) return null;
  if (direction === 'moins') return 1 / f;
  if (direction === 'plus' || direction === 'egal') return f;
  return null;
}

function scoreGuess(guessRatio, realRatio) {
  const G = Number(guessRatio);
  const R = Number(realRatio);
  if (!Number.isFinite(G) || !Number.isFinite(R) || G <= 0 || R <= 0) return 0;
  const error = Math.abs(Math.log(G / R));
  return Math.round(100 * Math.exp(-error));
}

/** Format humain du rapport réel (×N ou ÷N). */
function formatRatio(realRatio) {
  const R = Number(realRatio);
  if (!Number.isFinite(R) || R <= 0) return '—';
  if (Math.abs(R - 1) < 0.05) return '×1 (≈ égales)';
  if (R >= 1) {
    const n = R >= 10 ? Math.round(R) : Math.round(R * 10) / 10;
    return `×${n}`;
  }
  const inv = 1 / R;
  const n = inv >= 10 ? Math.round(inv) : Math.round(inv * 10) / 10;
  return `÷${n}`;
}

module.exports = { guessToRatio, scoreGuess, formatRatio };
