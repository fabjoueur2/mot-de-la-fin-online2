'use strict';

/**
 * Rankings / predictions are arrays of itemIds from best (index 0 = rank 1) to worst.
 */

function positionMap(ranking) {
  const map = new Map();
  (ranking || []).forEach((id, i) => map.set(id, i + 1));
  return map;
}

function countMatchingPositions(rankingA, rankingB) {
  const a = positionMap(rankingA);
  const b = positionMap(rankingB);
  let n = 0;
  for (const [id, pos] of a) {
    if (b.get(id) === pos) n += 1;
  }
  return n;
}

function validateRanking(itemIds, ranking) {
  if (!Array.isArray(ranking)) return { ok: false, msg: 'Classement invalide.' };
  if (ranking.length !== itemIds.length) {
    return { ok: false, msg: 'Tu dois classer tous les éléments.' };
  }
  const set = new Set(ranking);
  if (set.size !== ranking.length) {
    return { ok: false, msg: 'Positions en double interdites.' };
  }
  for (const id of ranking) {
    if (!itemIds.includes(id)) {
      return { ok: false, msg: 'Élément inconnu dans le classement.' };
    }
  }
  for (const id of itemIds) {
    if (!set.has(id)) {
      return { ok: false, msg: 'Élément manquant dans le classement.' };
    }
  }
  return { ok: true };
}

/**
 * Score all guessers against the listeur ranking.
 * Listeur scores 0 this round.
 */
function scoreGuessersRound({
  listeurId,
  listeurRanking,
  guessesByPlayerId,
  guesserIds,
  itemIds,
  scoring
}) {
  const s = scoring || {};
  const correctPred = Number(s.correctPrediction) || 0;
  const perfectBonus = Number(s.perfectPredictionBonus) || 0;
  const ids = itemIds || listeurRanking || [];
  const listeurMap = positionMap(listeurRanking);

  const byPlayer = {};
  let totalCorrect = 0;
  let totalPossible = 0;

  for (const gid of guesserIds || []) {
    const guess = guessesByPlayerId?.[gid] || [];
    const predMap = positionMap(guess);
    const perItem = [];
    let predictionPoints = 0;
    let correctCount = 0;

    for (const id of ids) {
      const realPos = listeurMap.get(id);
      const predPos = predMap.get(id);
      let pts = 0;
      if (realPos != null && predPos === realPos) {
        pts = correctPred;
        predictionPoints += pts;
        correctCount += 1;
        totalCorrect += 1;
      }
      totalPossible += 1;
      perItem.push({
        itemId: id,
        listeurPosition: realPos || null,
        predictedPosition: predPos || null,
        predictionPoints: pts,
        total: pts
      });
    }

    let perfect = 0;
    if (perfectBonus > 0 && ids.length > 0 && correctCount === ids.length) {
      perfect = perfectBonus;
    }

    byPlayer[gid] = {
      id: gid,
      predictionPoints,
      perfectBonus: perfect,
      correctPredictions: correctCount,
      total: predictionPoints + perfect,
      perItem,
      isListeur: false
    };
  }

  byPlayer[listeurId] = {
    id: listeurId,
    predictionPoints: 0,
    perfectBonus: 0,
    correctPredictions: 0,
    total: 0,
    perItem: ids.map((id) => ({
      itemId: id,
      listeurPosition: listeurMap.get(id) || null,
      predictedPosition: null,
      predictionPoints: 0,
      total: 0
    })),
    isListeur: true
  };

  const accuracyPercent =
    totalPossible > 0 ? Math.round((totalCorrect / totalPossible) * 100) : 0;

  return {
    byPlayer,
    listeurId,
    correctPredictionsTotal: totalCorrect,
    possiblePredictions: totalPossible,
    accuracyPercent
  };
}

module.exports = {
  positionMap,
  countMatchingPositions,
  validateRanking,
  scoreGuessersRound
};
