'use strict';

/**
 * Tests automatisés TIER À DEUX (sans serveur HTTP).
 */
const assert = require('assert');
const tad = require('../games/tier-a-deux');
const { pickRoundItems, countAvailable } = require('../games/tier-a-deux/pick');
const {
  validateRanking,
  scoreRound,
  compatibilityPercent,
  countMatchingPositions
} = require('../games/tier-a-deux/score');
const { sanitizeConfig, DEFAULT_CONFIG } = require('../games/tier-a-deux/config');

let passed = 0;
function ok(name, cond) {
  assert(cond, name);
  passed += 1;
  console.log('✓', name);
}

function makeRoom() {
  const room = tad.createInitialRoomState({
    hostSocketId: 'a',
    playerName: 'Alice',
    code: 'TEST01'
  });
  room.players.push({
    id: 'b',
    name: 'Bob',
    score: 0,
    lastRoundScore: 0,
    ready: true,
    reconnectToken: 'tokenb'
  });
  room.players[0].ready = true;
  room.config = sanitizeConfig(DEFAULT_CONFIG);
  return room;
}

// 1. Génération 5 uniques
{
  const cfg = sanitizeConfig({ itemsPerRound: 5, absurdity: 'chaos' });
  const items = pickRoundItems([], cfg);
  ok('pick 5 items', items.length === 5);
  ok(
    'pick unique ids',
    new Set(items.map((x) => x.id)).size === 5
  );
}

// 2. Pas de répétition dans une partie
{
  const cfg = sanitizeConfig({
    itemsPerRound: 5,
    avoidRepeats: true,
    absurdity: 'chaos'
  });
  const used = [];
  let dup = false;
  for (let i = 0; i < 5; i++) {
    const items = pickRoundItems(used, cfg);
    for (const it of items) {
      if (used.includes(it.id)) dup = true;
      used.push(it.id);
    }
  }
  ok('no repeats across 5 rounds', !dup && used.length === 25);
}

// 3. Validation ranking
{
  const ids = ['x', 'y', 'z'];
  ok('valid ranking', validateRanking(ids, ['z', 'x', 'y']).ok);
  ok('reject incomplete', !validateRanking(ids, ['x', 'y']).ok);
  ok('reject dup', !validateRanking(ids, ['x', 'x', 'y']).ok);
  ok('reject foreign', !validateRanking(ids, ['x', 'y', 'w']).ok);
}

// 4. Confidentialité sanitize
{
  const room = makeRoom();
  const start = tad.startGame(room);
  ok('start ok', start.ok);
  room.personal.a = [...room.displayOrder];
  const sanB = tad.sanitizeRoom(room, 'b');
  ok('phase personal', room.phase === 'personal_ranking');
  ok('partner ranking hidden', sanB.partnerPersonal == null);
  ok('items shared', sanB.items.length === room.config.itemsPerRound);
}

// 5–7. Scores
{
  const ids = ['i1', 'i2', 'i3', 'i4', 'i5'];
  const ranking = [...ids];
  const scored = scoreRound({
    playerA: 'a',
    playerB: 'b',
    rankingA: ranking,
    rankingB: ranking,
    predictionA: ranking,
    predictionB: ranking,
    itemIds: ids,
    scoring: { correctPrediction: 1, matchingPosition: 2, perfectPredictionBonus: 0, identicalRankingBonus: 0 }
  });
  ok('perfect round A = 15', scored.playerA.total === 15);
  ok('perfect round B = 15', scored.playerB.total === 15);
  ok('5 matches', scored.matchingPositions === 5);
  ok('compat 100', scored.compatibilityPercent === 100);

  const partial = scoreRound({
    playerA: 'a',
    playerB: 'b',
    rankingA: ranking,
    rankingB: ['i2', 'i1', 'i3', 'i4', 'i5'],
    predictionA: ['i2', 'i1', 'i3', 'i4', 'i5'],
    predictionB: ranking,
    itemIds: ids,
    scoring: DEFAULT_CONFIG.scoring
  });
  // A predicts B perfectly → 5 pred + matches on i3,i4,i5 (same pos 3,4,5) = 5+6=11
  ok('partial A has prediction pts', partial.playerA.predictionPoints === 5);
  ok('match count 3', countMatchingPositions(ranking, ['i2', 'i1', 'i3', 'i4', 'i5']) === 3);
}

// 8. Compatibilité %
{
  ok('compat 0', compatibilityPercent(['a', 'b', 'c'], ['c', 'a', 'b']) === 0);
  ok('compat 20', compatibilityPercent(['a', 'b', 'c', 'd', 'e'], ['a', 'x', 'y', 'z', 'w']) === 20);
}

// 9. Transitions
{
  const room = makeRoom();
  tad.startGame(room);
  const ids = [...room.displayOrder];
  ok('to personal', room.phase === 'personal_ranking');
  tad.lockPersonal(room, 'a', ids);
  ok('still personal until both', room.phase === 'personal_ranking');
  tad.lockPersonal(room, 'b', ids);
  ok('to prediction', room.phase === 'partner_prediction');
  const san = tad.sanitizeRoom(room, 'a');
  ok('secrets still hidden in prediction', san.partnerPersonal == null);
  tad.lockPrediction(room, 'a', ids);
  tad.lockPrediction(room, 'b', ids);
  ok('to reveal', room.phase === 'reveal');
  ok('reveal built', room.lastReveal?.items?.length === ids.length);
  const sanR = tad.sanitizeRoom(room, 'a');
  ok('secrets visible in reveal', Array.isArray(sanR.partnerPersonal));
}

// 10. Double submit + reclaim
{
  const room = makeRoom();
  tad.startGame(room);
  const ids = [...room.displayOrder];
  const r1 = tad.lockPersonal(room, 'a', ids);
  const r2 = tad.lockPersonal(room, 'a', ids);
  ok('first submit ok', r1.ok);
  ok('double submit rejected', !r2.ok);

  room.players[0].disconnectedAt = Date.now();
  const tok = room.players[0].reconnectToken;
  const reclaim = tad.reclaimPlayer(room, tok, 'a2');
  ok('reclaim ok', reclaim.ok);
  ok('id migrated', room.players.some((p) => p.id === 'a2'));
  ok('personal migrated', Boolean(room.personal.a2));
}

{
  const { ITEMS } = require('../games/tier-a-deux/pick');
  ok('bank file >= 500', ITEMS.length >= 500);
  ok(
    'default config pool >= 400',
    countAvailable(sanitizeConfig(DEFAULT_CONFIG), []) >= 400
  );
}

console.log(`\n${passed} assertions passed.`);
