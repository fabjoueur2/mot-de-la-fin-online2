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

function compatibilityPercent(rankingA, rankingB) {
  const n = Math.max((rankingA || []).length, 1);
  return Math.round((countMatchingPositions(rankingA, rankingB) / n) * 100);
}

/**
 * Score one player for a round.
 * @returns {{ predictionPoints, matchPoints, perfectBonus, identicalBonus, total, perItem }}
 */
function scorePlayerRound({
  myPersonal,
  partnerPersonal,
  myPrediction,
  scoring,
  itemIds
}) {
  const s = scoring || {};
  const correctPred = Number(s.correctPrediction) || 0;
  const matchingPos = Number(s.matchingPosition) || 0;
  const perfectBonus = Number(s.perfectPredictionBonus) || 0;
  const identicalBonus = Number(s.identicalRankingBonus) || 0;

  const partnerMap = positionMap(partnerPersonal);
  const myPersMap = positionMap(myPersonal);
  const predMap = positionMap(myPrediction);

  const ids = itemIds || myPersonal || [];
  const perItem = [];
  let predictionPoints = 0;
  let matchPoints = 0;
  let correctCount = 0;

  for (const id of ids) {
    const partnerPos = partnerMap.get(id);
    const myPos = myPersMap.get(id);
    const predPos = predMap.get(id);
    let predPts = 0;
    let matchPts = 0;
    if (partnerPos != null && predPos === partnerPos) {
      predPts = correctPred;
      predictionPoints += predPts;
      correctCount += 1;
    }
    if (partnerPos != null && myPos === partnerPos) {
      matchPts = matchingPos;
      matchPoints += matchPts;
    }
    perItem.push({
      itemId: id,
      myPosition: myPos || null,
      partnerPosition: partnerPos || null,
      predictedPosition: predPos || null,
      predictionPoints: predPts,
      matchPoints: matchPts,
      total: predPts + matchPts
    });
  }

  let perfect = 0;
  if (perfectBonus > 0 && ids.length > 0 && correctCount === ids.length) {
    perfect = perfectBonus;
  }

  let identical = 0;
  if (
    identicalBonus > 0 &&
    ids.length > 0 &&
    countMatchingPositions(myPersonal, partnerPersonal) === ids.length
  ) {
    identical = identicalBonus;
  }

  return {
    predictionPoints,
    matchPoints,
    perfectBonus: perfect,
    identicalBonus: identical,
    correctPredictions: correctCount,
    matchingPositions: countMatchingPositions(myPersonal, partnerPersonal),
    total: predictionPoints + matchPoints + perfect + identical,
    perItem
  };
}

function scoreRound({ playerA, playerB, rankingA, rankingB, predictionA, predictionB, itemIds, scoring }) {
  const scoreA = scorePlayerRound({
    myPersonal: rankingA,
    partnerPersonal: rankingB,
    myPrediction: predictionA,
    scoring,
    itemIds
  });
  const scoreB = scorePlayerRound({
    myPersonal: rankingB,
    partnerPersonal: rankingA,
    myPrediction: predictionB,
    scoring,
    itemIds
  });
  const matches = countMatchingPositions(rankingA, rankingB);
  return {
    playerA: { id: playerA, ...scoreA },
    playerB: { id: playerB, ...scoreB },
    matchingPositions: matches,
    compatibilityPercent: compatibilityPercent(rankingA, rankingB)
  };
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

module.exports = {
  positionMap,
  countMatchingPositions,
  compatibilityPercent,
  scorePlayerRound,
  scoreRound,
  validateRanking
};
