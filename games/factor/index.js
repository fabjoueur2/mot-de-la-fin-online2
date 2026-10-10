/**
 * FACTOR — Combien de fois plus ?
 * Estimation de rapports entre statistiques réelles.
 */
'use strict';

const { sanitizeDisplayName } = require('../../lib/sanitize');
const { pickPair, publicStat } = require('./pairs');
const { guessToRatio, scoreGuess, formatRatio } = require('./score');

const GAME_ID = 'factor';
const MIN_PLAYERS = 1;
const MAX_PLAYERS = 12;

const VALID_ROUNDS = [5, 10, 15, 20];
const VALID_ANSWER_SEC = [10, 20, 30, 60];
const REVEAL_MS = 8000;

const DEFAULT_SETTINGS = {
  roundCount: 10,
  answerSec: 20
};

function createInitialRoomState({ hostSocketId, playerName, code }) {
  return {
    gameId: GAME_ID,
    code,
    hostId: hostSocketId,
    players: [
      {
        id: hostSocketId,
        name: sanitizeDisplayName(playerName, 'Joueur'),
        score: 0,
        lastRoundScore: 0
      }
    ],
    settings: { ...DEFAULT_SETTINGS },
    phase: 'lobby',
    currentRound: 0,
    usedPairKeys: [],
    pair: null,
    answers: {},
    phaseEndsAt: null,
    lastReveal: null,
    history: [],
    ranking: []
  };
}

function getPlayer(room, id) {
  return room.players.find((p) => p.id === id);
}

function isHost(room, socketId) {
  return room.hostId === socketId;
}

function ensureScores(room) {
  room.players.forEach((p) => {
    if (typeof p.score !== 'number') p.score = 0;
    if (typeof p.lastRoundScore !== 'number') p.lastRoundScore = 0;
  });
}

function rankPlayers(room) {
  return [...room.players]
    .map((p) => ({
      id: p.id,
      name: p.name,
      score: p.score || 0,
      lastRoundScore: p.lastRoundScore || 0
    }))
    .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));
}

function applySettings(room, settings = {}) {
  if (settings.roundCount != null) {
    const n = parseInt(settings.roundCount, 10);
    if (VALID_ROUNDS.includes(n)) room.settings.roundCount = n;
  }
  if (settings.answerSec != null) {
    const n = parseInt(settings.answerSec, 10);
    if (VALID_ANSWER_SEC.includes(n)) room.settings.answerSec = n;
  }
}

function resetToLobby(room) {
  room.phase = 'lobby';
  room.currentRound = 0;
  room.usedPairKeys = [];
  room.pair = null;
  room.answers = {};
  room.phaseEndsAt = null;
  room.lastReveal = null;
  room.history = [];
  room.ranking = [];
  room.players.forEach((p) => {
    p.score = 0;
    p.lastRoundScore = 0;
  });
}

function beginRound(room) {
  const picked = pickPair(room.usedPairKeys);
  room.usedPairKeys.push(picked.key);
  room.pair = {
    a: picked.a,
    b: picked.b,
    realRatio: picked.realRatio,
    key: picked.key
  };
  room.answers = {};
  room.lastReveal = null;
  room.phase = 'answering';
  room.phaseEndsAt =
    Date.now() + (room.settings.answerSec || DEFAULT_SETTINGS.answerSec) * 1000;
  room.players.forEach((p) => {
    p.lastRoundScore = 0;
  });
}

function startGame(room) {
  if (room.players.length < MIN_PLAYERS) {
    return { ok: false, msg: `Minimum ${MIN_PLAYERS} joueur.` };
  }
  if (room.players.length > MAX_PLAYERS) {
    return { ok: false, msg: `Maximum ${MAX_PLAYERS} joueurs.` };
  }
  room.players.forEach((p) => {
    p.score = 0;
    p.lastRoundScore = 0;
  });
  room.currentRound = 1;
  room.usedPairKeys = [];
  room.history = [];
  beginRound(room);
  return { ok: true };
}

function submitAnswer(room, playerId, payload = {}) {
  if (room.phase !== 'answering') return { ok: false, msg: 'Pas le moment.' };
  if (!getPlayer(room, playerId)) return { ok: false, msg: 'Joueur inconnu.' };
  if (room.answers[playerId]) {
    return { ok: false, msg: 'Réponse déjà verrouillée.' };
  }

  const direction = payload.direction === 'moins' ? 'moins' : 'plus';
  let factor = Number(payload.factor);
  if (!Number.isFinite(factor) || factor < 1) {
    return { ok: false, msg: 'Facteur invalide (minimum 1).' };
  }
  factor = Math.min(1000, Math.max(1, factor));
  // garder 1 décimale utile
  factor = Math.round(factor * 10) / 10;

  const guessRatio = guessToRatio(direction, factor);
  if (guessRatio == null) return { ok: false, msg: 'Estimation invalide.' };

  room.answers[playerId] = {
    direction,
    factor,
    guessRatio,
    lockedAt: Date.now()
  };
  return { ok: true };
}

function allAnswered(room) {
  return room.players.every((p) => room.answers[p.id]);
}

function enterReveal(room) {
  if (!room.pair) return;
  const R = room.pair.realRatio;
  const results = room.players.map((p) => {
    const ans = room.answers[p.id];
    const pts = ans ? scoreGuess(ans.guessRatio, R) : 0;
    p.lastRoundScore = pts;
    p.score = (p.score || 0) + pts;
    return {
      playerId: p.id,
      name: p.name,
      direction: ans?.direction || null,
      factor: ans?.factor || null,
      guessRatio: ans?.guessRatio || null,
      points: pts,
      answered: Boolean(ans)
    };
  });

  results.sort((a, b) => b.points - a.points || a.name.localeCompare(b.name));

  room.lastReveal = {
    a: publicStat(room.pair.a),
    b: publicStat(room.pair.b),
    realRatio: R,
    realRatioLabel: formatRatio(R),
    estimatedValue: room.pair.a.value * R,
    results
  };
  room.history.push({
    round: room.currentRound,
    aId: room.pair.a.id,
    bId: room.pair.b.id,
    realRatio: R
  });
  room.phase = 'reveal';
  room.phaseEndsAt = Date.now() + REVEAL_MS;
  room.ranking = rankPlayers(room);
}

function afterReveal(room) {
  if (room.currentRound >= room.settings.roundCount) {
    room.phase = 'game_over';
    room.phaseEndsAt = null;
    room.pair = null;
    room.ranking = rankPlayers(room);
    return;
  }
  room.currentRound += 1;
  beginRound(room);
}

function sanitizeRoom(room, socketId) {
  ensureScores(room);
  const me = getPlayer(room, socketId);
  const ranking = rankPlayers(room);
  const myAnswer = room.answers[socketId] || null;

  let question = null;
  if (room.pair && (room.phase === 'answering' || room.phase === 'reveal')) {
    question = {
      a: publicStat(room.pair.a),
      b: publicStat(room.pair.b, {
        hideValue: room.phase === 'answering'
      }),
      realRatio:
        room.phase === 'answering' ? undefined : room.pair.realRatio,
      realRatioLabel:
        room.phase === 'answering'
          ? undefined
          : formatRatio(room.pair.realRatio)
    };
  }

  return {
    gameId: room.gameId,
    code: room.code,
    phase: room.phase,
    isHost: isHost(room, socketId),
    myId: socketId,
    myName: me?.name || '',
    myScore: me?.score || 0,
    hostId: room.hostId,
    settings: { ...room.settings },
    players: room.players.map((p) => ({
      id: p.id,
      name: p.name,
      score: p.score || 0,
      lastRoundScore: p.lastRoundScore || 0,
      isHost: p.id === room.hostId,
      hasAnswered: Boolean(room.answers[p.id])
    })),
    ranking,
    currentRound: room.currentRound,
    roundCount: room.settings.roundCount,
    question,
    myAnswer: myAnswer
      ? {
          direction: myAnswer.direction,
          factor: myAnswer.factor,
          guessRatio: myAnswer.guessRatio
        }
      : null,
    answeredCount: Object.keys(room.answers).length,
    reveal: room.phase === 'reveal' || room.phase === 'game_over' ? room.lastReveal : null,
    phaseEndsAt: room.phaseEndsAt,
    phaseRemainingMs: room.phaseEndsAt
      ? Math.max(0, room.phaseEndsAt - Date.now())
      : null,
    serverNow: Date.now(),
    minPlayers: MIN_PLAYERS,
    maxPlayers: MAX_PLAYERS,
    historyCount: (room.history || []).length
  };
}

function ensureValidMaster(room) {
  if (!getPlayer(room, room.hostId) && room.players.length) {
    room.hostId = room.players[0].id;
  }
}

function onTick(room) {
  if (room.phase === 'answering' && room.phaseEndsAt && Date.now() >= room.phaseEndsAt) {
    enterReveal(room);
    return true;
  }
  if (room.phase === 'answering' && allAnswered(room) && room.players.length > 0) {
    enterReveal(room);
    return true;
  }
  if (room.phase === 'reveal' && room.phaseEndsAt && Date.now() >= room.phaseEndsAt) {
    afterReveal(room);
    return true;
  }
  return false;
}

function getRoom(ctx, socket) {
  const room = ctx.rooms.get(ctx.socketToRoom.get(socket.id));
  if (!room || room.gameId !== GAME_ID) return null;
  return room;
}

function registerHandlers(io, ctx) {
  const { broadcastRoom } = ctx;

  io.on('connection', (socket) => {
    socket.on('fct-update-settings', (settings = {}) => {
      const room = getRoom(ctx, socket);
      if (!room || !isHost(room, socket.id) || room.phase !== 'lobby') return;
      applySettings(room, settings);
      broadcastRoom(room);
    });

    socket.on('fct-start-game', (payload = {}) => {
      const room = getRoom(ctx, socket);
      if (!room || !isHost(room, socket.id) || room.phase !== 'lobby') return;
      if (payload && typeof payload === 'object') applySettings(room, payload);
      const check = startGame(room);
      if (!check.ok) {
        socket.emit('error-msg', check.msg);
        return;
      }
      broadcastRoom(room);
    });

    socket.on('fct-submit', (payload = {}) => {
      const room = getRoom(ctx, socket);
      if (!room) return;
      const result = submitAnswer(room, socket.id, payload);
      if (!result.ok) {
        socket.emit('error-msg', result.msg);
        return;
      }
      if (allAnswered(room)) {
        enterReveal(room);
      }
      broadcastRoom(room);
    });

    socket.on('fct-back-to-lobby', () => {
      const room = getRoom(ctx, socket);
      if (!room || !isHost(room, socket.id)) return;
      resetToLobby(room);
      broadcastRoom(room);
    });

    socket.on('fct-rematch', () => {
      const room = getRoom(ctx, socket);
      if (!room || !isHost(room, socket.id) || room.phase !== 'game_over') return;
      const check = startGame(room);
      if (!check.ok) {
        socket.emit('error-msg', check.msg);
        return;
      }
      broadcastRoom(room);
    });
  });
}

module.exports = {
  id: GAME_ID,
  createInitialRoomState,
  sanitizeRoom,
  ensureValidMaster,
  onTick,
  registerHandlers,
  MIN_PLAYERS,
  MAX_PLAYERS
};
