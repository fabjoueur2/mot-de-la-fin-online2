/**
 * Patate Chaude (Hot Potato Code)
 * Chaîne de mots sous chrono — dernière lettre → explosion.
 */
'use strict';

const { sanitizeDisplayName } = require('../../lib/sanitize');
const { pickSeed, pickTheme } = require('./words');

const GAME_ID = 'hot-potato';
const MIN_PLAYERS = 3;
const MAX_PLAYERS = 10;

const VALID_ROUNDS = [5, 8, 12];
const VALID_POTATO_SEC = [4, 6, 8, 10];
const VALID_EXPLOSIONS = [2, 3, 5];

const DEFAULT_SETTINGS = {
  roundCount: 8,
  potatoSec: 6,
  explosionsPerRound: 3,
  accelerate: false
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
        wordsOk: 0,
        explosions: 0
      }
    ],
    settings: { ...DEFAULT_SETTINGS },
    phase: 'lobby',
    currentRound: 0,
    holderId: null,
    previousWord: null,
    usedWords: [],
    chain: [],
    theme: null,
    potatoEndsAt: null,
    potatoDurationMs: DEFAULT_SETTINGS.potatoSec * 1000,
    phaseEndsAt: null,
    explosionsThisRound: 0,
    lastEvent: null,
    turnOrder: [],
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
    if (typeof p.wordsOk !== 'number') p.wordsOk = 0;
    if (typeof p.explosions !== 'number') p.explosions = 0;
  });
}

/** Normalise pour stockage / doublons. */
function normalizeWord(raw) {
  return String(raw || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z\-']/g, '');
}

/** Dernière lettre alphabétique (ignore tiret/apostrophe finaux). */
function lastLetter(word) {
  const n = normalizeWord(word).replace(/[^a-z]/g, '');
  return n ? n[n.length - 1] : '';
}

function firstLetter(word) {
  const n = normalizeWord(word).replace(/[^a-z]/g, '');
  return n ? n[0] : '';
}

function buildTurnOrder(room) {
  room.turnOrder = room.players.map((p) => p.id);
}

function nextHolder(room, fromId) {
  const order = room.turnOrder?.length ? room.turnOrder : room.players.map((p) => p.id);
  if (!order.length) return null;
  const idx = Math.max(0, order.indexOf(fromId));
  return order[(idx + 1) % order.length];
}

function potatoDurationMs(room) {
  let sec = room.settings.potatoSec || DEFAULT_SETTINGS.potatoSec;
  if (room.settings.accelerate) {
    const successes = room.chain?.length || 0;
    sec = Math.max(3, sec - Math.floor(successes / 4) * 0.5);
  }
  return Math.round(sec * 1000);
}

function startPotatoTimer(room) {
  room.potatoDurationMs = potatoDurationMs(room);
  room.potatoEndsAt = Date.now() + room.potatoDurationMs;
}

function freshSeed(room) {
  const word = pickSeed(room.usedWords);
  room.previousWord = word;
  room.usedWords = [...(room.usedWords || []), normalizeWord(word)];
  return word;
}

/**
 * Après explosion : on retire la dernière lettre du mot courant
 * → la contrainte devient l'avant-dernière lettre (ex. tomate → tomat → « T »).
 */
function rewindToPenultimate(room) {
  const letters = normalizeWord(room.previousWord || '').replace(/[^a-z]/g, '');
  if (letters.length >= 2) {
    room.previousWord = letters.slice(0, -1);
    return room.previousWord;
  }
  // Mot trop court : nouveau seed
  return freshSeed(room);
}

function beginRound(room) {
  ensureScores(room);
  room.currentRound += 1;
  if (room.currentRound > room.settings.roundCount) {
    room.phase = 'game_over';
    room.potatoEndsAt = null;
    room.phaseEndsAt = null;
    room.holderId = null;
    room.ranking = rankPlayers(room);
    return;
  }

  buildTurnOrder(room);
  room.theme = pickTheme();
  room.usedWords = [];
  room.chain = [];
  room.explosionsThisRound = 0;
  room.lastEvent = null;
  freshSeed(room);

  const startFrom =
    room.holderId && getPlayer(room, room.holderId)
      ? room.holderId
      : room.hostId;
  room.holderId = nextHolder(room, startFrom) || room.players[0]?.id;

  room.phase = 'round_intro';
  room.potatoEndsAt = null;
  room.phaseEndsAt = Date.now() + 3000;
}

function enterHot(room) {
  if (!room.holderId) room.holderId = room.players[0]?.id;
  room.phase = 'hot';
  room.phaseEndsAt = null;
  startPotatoTimer(room);
}

function explode(room, reason) {
  const holder = getPlayer(room, room.holderId);
  if (holder) {
    holder.score -= 2;
    holder.explosions = (holder.explosions || 0) + 1;
  }
  room.explosionsThisRound = (room.explosionsThisRound || 0) + 1;
  room.lastEvent = {
    type: 'explode',
    playerId: room.holderId,
    playerName: holder?.name || '?',
    reason: reason || 'timeout',
    word: room.previousWord
  };

  const prevHolder = room.holderId;
  room.holderId = nextHolder(room, prevHolder);
  rewindToPenultimate(room);

  room.phase = 'explode';
  room.potatoEndsAt = null;
  room.phaseEndsAt = Date.now() + 1500;
}

function afterExplode(room) {
  const limit = room.settings.explosionsPerRound || DEFAULT_SETTINGS.explosionsPerRound;
  if (room.explosionsThisRound >= limit) {
    room.phase = 'scoreboard';
    room.holderId = null;
    room.potatoEndsAt = null;
    room.phaseEndsAt = Date.now() + 4000;
    room.ranking = rankPlayers(room);
    return;
  }
  enterHot(room);
}

function acceptWord(room, playerId, rawWord) {
  if (room.phase !== 'hot') return { ok: false, msg: 'Pas le moment.' };
  if (playerId !== room.holderId) return { ok: false, msg: 'Ce n’est pas ta patate.' };

  const normalized = normalizeWord(rawWord);
  if (normalized.length < 2 || normalized.length > 24) {
    return { ok: false, msg: 'Mot invalide (2–24 lettres).' };
  }
  if (!/^[a-z]+(?:['-][a-z]+)*$/.test(normalized)) {
    return { ok: false, msg: 'Lettres uniquement.' };
  }

  const need = lastLetter(room.previousWord);
  const got = firstLetter(normalized);
  if (!need || got !== need) {
    return {
      ok: false,
      msg: `Doit commencer par « ${need.toUpperCase()} ».`
    };
  }

  if ((room.usedWords || []).includes(normalized)) {
    return { ok: false, msg: 'Déjà utilisé dans cette manche.' };
  }

  const player = getPlayer(room, playerId);
  if (player) {
    player.score += 1;
    player.wordsOk = (player.wordsOk || 0) + 1;
  }

  room.usedWords.push(normalized);
  room.chain.push({
    word: normalized,
    playerId,
    name: player?.name || '?'
  });
  room.previousWord = normalized;
  room.lastEvent = {
    type: 'success',
    playerId,
    playerName: player?.name || '?',
    word: normalized
  };

  room.holderId = nextHolder(room, playerId);
  startPotatoTimer(room);
  return { ok: true };
}

function rankPlayers(room) {
  return [...room.players]
    .map((p) => ({
      id: p.id,
      name: p.name,
      score: p.score || 0,
      wordsOk: p.wordsOk || 0,
      explosions: p.explosions || 0
    }))
    .sort(
      (a, b) =>
        b.score - a.score ||
        b.wordsOk - a.wordsOk ||
        a.explosions - b.explosions ||
        a.name.localeCompare(b.name)
    );
}

function resetToLobby(room) {
  room.phase = 'lobby';
  room.currentRound = 0;
  room.holderId = null;
  room.previousWord = null;
  room.usedWords = [];
  room.chain = [];
  room.theme = null;
  room.potatoEndsAt = null;
  room.phaseEndsAt = null;
  room.explosionsThisRound = 0;
  room.lastEvent = null;
  room.turnOrder = [];
  room.ranking = [];
  room.players.forEach((p) => {
    p.score = 0;
    p.wordsOk = 0;
    p.explosions = 0;
  });
}

function startGame(room) {
  if (room.players.length < MIN_PLAYERS) {
    return { ok: false, msg: `Minimum ${MIN_PLAYERS} joueurs.` };
  }
  if (room.players.length > MAX_PLAYERS) {
    return { ok: false, msg: `Maximum ${MAX_PLAYERS} joueurs.` };
  }
  room.players.forEach((p) => {
    p.score = 0;
    p.wordsOk = 0;
    p.explosions = 0;
  });
  room.currentRound = 0;
  room.holderId = room.hostId;
  beginRound(room);
  return { ok: true };
}

function sanitizeRoom(room, socketId) {
  ensureScores(room);
  const me = getPlayer(room, socketId);
  const ranking = rankPlayers(room);

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
      wordsOk: p.wordsOk || 0,
      explosions: p.explosions || 0,
      isHost: p.id === room.hostId,
      isHolder: p.id === room.holderId
    })),
    ranking,
    currentRound: room.currentRound,
    roundCount: room.settings.roundCount,
    theme: room.theme,
    previousWord: room.previousWord,
    expectedLetter: room.previousWord ? lastLetter(room.previousWord).toUpperCase() : null,
    holderId: room.holderId,
    holderName: room.holderId ? getPlayer(room, room.holderId)?.name || '?' : null,
    isHolder: Boolean(me && me.id === room.holderId),
    chain: (room.chain || []).slice(-12),
    usedCount: (room.usedWords || []).length,
    explosionsThisRound: room.explosionsThisRound || 0,
    explosionsPerRound: room.settings.explosionsPerRound,
    potatoEndsAt: room.potatoEndsAt,
    potatoDurationMs: room.potatoDurationMs,
    potatoRemainingMs: room.potatoEndsAt
      ? Math.max(0, room.potatoEndsAt - Date.now())
      : null,
    phaseEndsAt: room.phaseEndsAt,
    phaseRemainingMs: room.phaseEndsAt
      ? Math.max(0, room.phaseEndsAt - Date.now())
      : null,
    serverNow: Date.now(),
    lastEvent: room.lastEvent,
    minPlayers: MIN_PLAYERS,
    maxPlayers: MAX_PLAYERS
  };
}

function ensureValidMaster(room) {
  if (!getPlayer(room, room.hostId) && room.players.length) {
    room.hostId = room.players[0].id;
  }
  if (room.holderId && !getPlayer(room, room.holderId)) {
    if (room.phase === 'hot') {
      explode(room, 'disconnect');
    } else {
      room.holderId = nextHolder(room, room.hostId) || room.players[0]?.id;
    }
  }
  buildTurnOrder(room);
}

function onTick(room) {
  if (room.phase === 'round_intro' && room.phaseEndsAt && Date.now() >= room.phaseEndsAt) {
    enterHot(room);
    return true;
  }
  if (room.phase === 'explode' && room.phaseEndsAt && Date.now() >= room.phaseEndsAt) {
    afterExplode(room);
    return true;
  }
  if (room.phase === 'scoreboard' && room.phaseEndsAt && Date.now() >= room.phaseEndsAt) {
    beginRound(room);
    return true;
  }
  if (room.phase === 'hot' && room.potatoEndsAt && Date.now() >= room.potatoEndsAt) {
    explode(room, 'timeout');
    return true;
  }
  return false;
}

function applySettings(room, settings = {}) {
  if (settings.roundCount != null) {
    const n = parseInt(settings.roundCount, 10);
    if (VALID_ROUNDS.includes(n)) room.settings.roundCount = n;
  }
  if (settings.potatoSec != null) {
    const n = parseInt(settings.potatoSec, 10);
    if (VALID_POTATO_SEC.includes(n)) room.settings.potatoSec = n;
  }
  if (settings.explosionsPerRound != null) {
    const n = parseInt(settings.explosionsPerRound, 10);
    if (VALID_EXPLOSIONS.includes(n)) room.settings.explosionsPerRound = n;
  }
  if (settings.accelerate != null) {
    room.settings.accelerate = Boolean(settings.accelerate);
  }
}

function getRoom(ctx, socket) {
  const room = ctx.rooms.get(ctx.socketToRoom.get(socket.id));
  if (!room || room.gameId !== GAME_ID) return null;
  return room;
}

function registerHandlers(io, ctx) {
  const { broadcastRoom } = ctx;

  io.on('connection', (socket) => {
    socket.on('hpc-update-settings', (settings = {}) => {
      const room = getRoom(ctx, socket);
      if (!room || !isHost(room, socket.id) || room.phase !== 'lobby') return;
      applySettings(room, settings);
      broadcastRoom(room);
    });

    socket.on('hpc-start-game', (payload = {}) => {
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

    socket.on('hpc-submit-word', ({ word } = {}) => {
      const room = getRoom(ctx, socket);
      if (!room) return;
      const result = acceptWord(room, socket.id, word);
      if (!result.ok) {
        socket.emit('error-msg', result.msg);
        return;
      }
      broadcastRoom(room);
    });

    socket.on('hpc-back-to-lobby', () => {
      const room = getRoom(ctx, socket);
      if (!room || !isHost(room, socket.id)) return;
      resetToLobby(room);
      broadcastRoom(room);
    });

    socket.on('hpc-rematch', () => {
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
