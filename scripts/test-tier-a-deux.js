'use strict';

const assert = require('assert');
const tad = require('../games/tier-a-deux');
const { pickRoundItems, countAvailable, ITEMS } = require('../games/tier-a-deux/pick');
const {
  validateRanking,
  scoreGuessersRound,
  countMatchingPositions
} = require('../games/tier-a-deux/score');
const { sanitizeConfig, DEFAULT_CONFIG } = require('../games/tier-a-deux/config');

let passed = 0;
function ok(name, cond) {
  assert(cond, name);
  passed += 1;
  console.log('✓', name);
}

function makeRoom(n = 3) {
  const room = tad.createInitialRoomState({
    hostSocketId: 'p0',
    playerName: 'P0',
    code: 'TEST01'
  });
  room.players[0].ready = true;
  for (let i = 1; i < n; i++) {
    room.players.push({
      id: `p${i}`,
      name: `P${i}`,
      score: 0,
      lastRoundScore: 0,
      ready: true,
      reconnectToken: `tok${i}`
    });
  }
  room.config = sanitizeConfig(DEFAULT_CONFIG);
  return room;
}

{
  const cfg = sanitizeConfig({ itemsPerRound: 5, absurdity: 'chaos' });
  const items = pickRoundItems([], cfg);
  ok('pick 5', items.length === 5);
  ok('unique', new Set(items.map((x) => x.id)).size === 5);
}

{
  const cfg = sanitizeConfig({ itemsPerRound: 5, avoidRepeats: true, absurdity: 'chaos' });
  const used = [];
  let dup = false;
  for (let i = 0; i < 5; i++) {
    for (const it of pickRoundItems(used, cfg)) {
      if (used.includes(it.id)) dup = true;
      used.push(it.id);
    }
  }
  ok('no repeats 5 rounds', !dup && used.length === 25);
}

{
  const ids = ['x', 'y', 'z'];
  ok('valid ranking', validateRanking(ids, ['z', 'x', 'y']).ok);
  ok('reject incomplete', !validateRanking(ids, ['x', 'y']).ok);
  ok('reject dup', !validateRanking(ids, ['x', 'x', 'y']).ok);
}

{
  const ids = ['i1', 'i2', 'i3', 'i4', 'i5'];
  const listeur = [...ids];
  const scored = scoreGuessersRound({
    listeurId: 'L',
    listeurRanking: listeur,
    guessesByPlayerId: {
      g1: [...ids],
      g2: [...ids].reverse()
    },
    guesserIds: ['g1', 'g2'],
    itemIds: ids,
    scoring: { correctPrediction: 1, perfectPredictionBonus: 0 }
  });
  ok('perfect guesser 5', scored.byPlayer.g1.total === 5);
  ok('reverse guesser 1 (middle)', scored.byPlayer.g2.correctPredictions === 1);
  ok('listeur 0', scored.byPlayer.L.total === 0);
  ok('accuracy 60', scored.accuracyPercent === 60); // 5+1 / 10
}

{
  const room = makeRoom(3);
  const start = tad.startGame(room);
  ok('start 3p', start.ok);
  ok('phase listing', room.phase === 'listing');
  ok('listeur p0 round1', room.listeurId === 'p0');

  const ids = [...room.displayOrder];
  const bad = tad.lockListing(room, 'p1', ids);
  ok('non-listeur cannot list', !bad.ok);

  const sanG = tad.sanitizeRoom(room, 'p1');
  ok('guesser no listing secret', sanG.listeurRanking == null);
  ok('role devineur', sanG.role === 'devineur');

  tad.lockListing(room, 'p0', ids);
  ok('to guessing', room.phase === 'guessing');

  const badL = tad.lockGuess(room, 'p0', ids);
  ok('listeur cannot guess', !badL.ok);

  tad.lockGuess(room, 'p1', ids);
  ok('still guessing until all', room.phase === 'guessing');
  tad.lockGuess(room, 'p2', [...ids].reverse());
  ok('to reveal', room.phase === 'reveal');

  const sanR = tad.sanitizeRoom(room, 'p1');
  ok('secrets in reveal', Array.isArray(sanR.listeurRanking));
  ok('reveal has guesses', (sanR.reveal?.item?.guesses || []).length === 2);
}

{
  const room = makeRoom(3);
  tad.startGame(room);
  const ids = [...room.displayOrder];
  tad.lockListing(room, 'p0', ids);
  const r1 = tad.lockGuess(room, 'p1', ids);
  const r2 = tad.lockGuess(room, 'p1', ids);
  ok('first guess ok', r1.ok);
  ok('double guess rejected', !r2.ok);
}

{
  const room = makeRoom(3);
  tad.startGame(room);
  // finish round quickly
  const ids = [...room.displayOrder];
  tad.lockListing(room, room.listeurId, ids);
  for (const p of room.players) {
    if (p.id === room.listeurId) continue;
    tad.lockGuess(room, p.id, ids);
  }
  // skip reveal -> force next via round_results
  room.phase = 'round_results';
  room.nextReady = { p0: true, p1: true, p2: true };
  // manually advance
  room.currentRound = 2;
  // re-begin
  const { pickRoundItems: pick } = require('../games/tier-a-deux/pick');
  // use start path: readyNextRound needs phase round_results and all ready
  room.phase = 'round_results';
  room.nextReady = {};
  // Call internal via exporting - use begin by completing next
  // Simulate: set all next ready through module - readyNextRound not exported
  // Use pickListeurId for round 2
  ok('listeur round2 is p1', tad.pickListeurId({ ...room, currentRound: 2 }) === 'p1');
  ok('listeur round3 is p2', tad.pickListeurId({ ...room, currentRound: 3 }) === 'p2');
  ok('listeur round4 wraps p0', tad.pickListeurId({ ...room, currentRound: 4 }) === 'p0');
}

{
  const room = makeRoom(2);
  tad.startGame(room);
  const tok = room.players[0].reconnectToken;
  room.players[0].disconnectedAt = Date.now();
  const r = tad.reclaimPlayer(room, tok, 'p0b');
  ok('reclaim', r.ok && room.players.some((p) => p.id === 'p0b'));
}

ok('bank >= 500', ITEMS.length >= 500);
ok('pool default >= 400', countAvailable(sanitizeConfig(DEFAULT_CONFIG), []) >= 400);
ok('max players 8', tad.MAX_PLAYERS === 8);

console.log(`\n${passed} assertions passed.`);
