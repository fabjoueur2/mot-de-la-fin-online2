'use strict';

/** Smoke local FACTOR — paires, score, phases. */
const { pickPair, STATS, CANDIDATES } = require('../games/factor/pairs');
const { scoreGuess, guessToRatio, formatRatio } = require('../games/factor/score');
const factor = require('../games/factor');

function assert(c, m) {
  if (!c) throw new Error(m);
}

assert(STATS.length >= 100, `stats ${STATS.length}`);
assert(CANDIDATES.length > 100, `pairs ${CANDIDATES.length}`);

const exact = scoreGuess(3, 3);
assert(exact === 100, `exact=${exact}`);
const twice = scoreGuess(4, 2);
assert(twice === 50, `twice=${twice}`);
assert(guessToRatio('moins', 4) === 0.25, 'moins');
assert(formatRatio(10).includes('×'), 'format');

const room = factor.createInitialRoomState({
  hostSocketId: 'h1',
  playerName: 'Host',
  code: 'TEST01'
});
assert(room.phase === 'lobby', 'lobby');
const start = (() => {
  // startGame is not exported — exercise via begin by calling handlers indirectly
  room.settings.roundCount = 5;
  room.settings.answerSec = 20;
  // mimic start
  const { pickPair: pp } = require('../games/factor/pairs');
  const picked = pp([]);
  room.pair = { a: picked.a, b: picked.b, realRatio: picked.realRatio, key: picked.key };
  room.phase = 'answering';
  room.currentRound = 1;
  room.phaseEndsAt = Date.now() + 20000;
  return room;
})();

const sanitized = factor.sanitizeRoom(start, 'h1');
assert(sanitized.question?.a?.value != null, 'A visible');
assert(sanitized.question?.b?.value == null, 'B hidden');
assert(sanitized.question?.realRatio == null, 'ratio hidden');

console.log('OK FACTOR smoke', {
  stats: STATS.length,
  pairs: CANDIDATES.length,
  sample: `${pickPair([]).a.label} vs ${pickPair([]).b.label}`
});
