const path = require('path');
const fs = require('fs');
const { scoreRound } = require('./scoring');

const GAME_ID = 'size-it';
const BANK_PATH = path.join(__dirname, 'bank', 'bank.json');
const BANK = JSON.parse(fs.readFileSync(BANK_PATH, 'utf8').replace(/^\uFEFF/, ''));
const ALL_ITEMS = Array.isArray(BANK.items) ? BANK.items : [];

const DEFAULT_SETTINGS = {
  roundCount: 10,
  estimateSec: 20,
  categories: ['geography', 'standard_object', 'sports', 'space']
};

const MIN_PLAYERS = 2;
const VALID_ROUNDS = [5, 10];
const VALID_ESTIMATE_SEC = [15, 20, 30];
const VALID_CATEGORIES = ['geography', 'standard_object', 'sports', 'space'];

/** Références fixes (taille en mètres). */
const REFERENCES = [
  { id: 'human', label: 'Humain', sizeM: 1.8, maxTrueM: 3 },
  { id: 'bus', label: 'Bus', sizeM: 12, maxTrueM: 30 },
  { id: 'pitch', label: 'Terrain de foot', sizeM: 105, maxTrueM: 300 },
  { id: 'eiffel', label: 'Tour Eiffel', sizeM: 330, maxTrueM: 50000 },
  { id: 'france', label: 'France (largeur)', sizeM: 950000, maxTrueM: Infinity }
];

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function toMeters(value, unit) {
  const v = Number(value);
  if (!Number.isFinite(v)) return NaN;
  const u = String(unit || 'm').toLowerCase();
  if (u === 'mm') return v / 1000;
  if (u === 'cm') return v / 100;
  if (u === 'km') return v * 1000;
  return v; // m
}

function fromMeters(meters, unit) {
  const m = Number(meters);
  const u = String(unit || 'm').toLowerCase();
  if (u === 'mm') return m * 1000;
  if (u === 'cm') return m * 100;
  if (u === 'km') return m / 1000;
  return m;
}

function pickReference(trueSizeM, category) {
  if (category === 'space' && trueSizeM > 1e6) {
    return { id: 'earth', label: 'Terre (diamètre)', sizeM: 12742000 };
  }
  for (const ref of REFERENCES) {
    if (trueSizeM < ref.maxTrueM) {
      return { id: ref.id, label: ref.label, sizeM: ref.sizeM };
    }
  }
  return { id: 'france', label: 'France (largeur)', sizeM: 950000 };
}

function publicSvgUrl(svgPath) {
  const rel = String(svgPath || '').replace(/^assets\//, '');
  return `/games/size-it/assets/${rel}`;
}

function createInitialRoomState({ hostSocketId, playerName, code }) {
  return {
    gameId: GAME_ID,
    code,
    hostId: hostSocketId,
    players: [{
      id: hostSocketId,
      name: String(playerName || 'Joueur').slice(0, 20),
      teamIndex: 0,
      role: 'devineur',
      score: 0
    }],
    settings: {
      roundCount: DEFAULT_SETTINGS.roundCount,
      estimateSec: DEFAULT_SETTINGS.estimateSec,
      categories: [...DEFAULT_SETTINGS.categories]
    },
    phase: 'lobby',
    currentRound: 0,
    deck: [],
    usedIds: [],
    puzzle: null,
    reference: null,
    estimates: {},
    estimateEndsAt: null,
    roundResults: null,
    lastRoundResults: null,
    revealAutoAt: null
  };
}

function getPlayer(room, socketId) {
  return room.players.find((p) => p.id === socketId);
}

function isHost(room, socketId) {
  return room.hostId === socketId;
}

function ensureScores(room) {
  room.players.forEach((p) => {
    if (typeof p.score !== 'number') p.score = 0;
  });
}

function buildDeck(room) {
  const cats = new Set(room.settings.categories || VALID_CATEGORIES);
  const used = new Set(room.usedIds || []);
  let pool = ALL_ITEMS.filter(
    (it) => cats.has(it.category) && !used.has(it.id) && Number.isFinite(Number(it.trueSize))
  );
  if (pool.length < room.settings.roundCount) {
    room.usedIds = [];
    pool = ALL_ITEMS.filter(
      (it) => cats.has(it.category) && Number.isFinite(Number(it.trueSize))
    );
  }
  room.deck = shuffle(pool);
}

function puzzlePublicMeta(item, reference, { withTruth } = {}) {
  const trueSizeM = toMeters(item.trueSize, item.unit);
  const meta = {
    id: item.id,
    name: item.name,
    category: item.category,
    dimension: item.dimension,
    unit: item.unit,
    svgUrl: publicSvgUrl(item.svg),
    reference
  };
  if (withTruth) {
    meta.trueSize = item.trueSize;
    meta.trueSizeM = trueSizeM;
  }
  return meta;
}

function startEstimateRound(room) {
  ensureScores(room);
  room.currentRound += 1;
  room.estimates = {};
  room.roundResults = null;
  room.revealAutoAt = null;

  if (!room.deck?.length) buildDeck(room);
  const item = room.deck.shift();
  if (!item) {
    room.phase = 'end';
    room.puzzle = null;
    room.estimateEndsAt = null;
    return;
  }

  room.usedIds = [...(room.usedIds || []), item.id];
  const trueSizeM = toMeters(item.trueSize, item.unit);
  const reference = pickReference(trueSizeM, item.category);
  room.puzzle = {
    ...item,
    trueSizeM
  };
  room.reference = reference;
  room.phase = 'estimate';
  const sec = room.settings.estimateSec || DEFAULT_SETTINGS.estimateSec;
  room.estimateEndsAt = Date.now() + sec * 1000;
}

function allLocked(room) {
  return room.players.length > 0 && room.players.every((p) => room.estimates[p.id]?.locked);
}

function finalizeRound(room) {
  if (room.phase !== 'estimate' && room.phase !== 'locked') return false;
  const trueSizeM = room.puzzle?.trueSizeM;
  if (!trueSizeM) return false;

  // Auto-lock remaining with last submitted value or default = reference size
  const rows = [];
  for (const p of room.players) {
    const est = room.estimates[p.id];
    let valueM = est?.valueM;
    if (!Number.isFinite(valueM) || valueM <= 0) {
      valueM = room.reference?.sizeM || trueSizeM;
    }
    room.estimates[p.id] = {
      valueM,
      locked: true,
      lockedAt: est?.lockedAt || Date.now()
    };
    rows.push({ playerId: p.id, estimateM: valueM });
  }

  const scored = scoreRound(rows, trueSizeM);
  for (const s of scored) {
    const player = getPlayer(room, s.playerId);
    if (player) player.score += s.total;
  }

  room.roundResults = scored.map((s) => ({
    ...s,
    name: getPlayer(room, s.playerId)?.name || 'Joueur',
    estimateNative: fromMeters(s.estimateM, room.puzzle.unit)
  }));
  room.lastRoundResults = room.roundResults;
  room.phase = 'reveal';
  room.estimateEndsAt = null;
  room.revealAutoAt = Date.now() + 8000;
  return true;
}

function advanceAfterReveal(room) {
  if (room.phase !== 'reveal') return false;
  room.revealAutoAt = null;
  if (room.currentRound >= room.settings.roundCount) {
    room.phase = 'end';
    room.puzzle = null;
    return true;
  }
  startEstimateRound(room);
  return true;
}

function resetToLobby(room) {
  room.phase = 'lobby';
  room.currentRound = 0;
  room.deck = [];
  room.usedIds = [];
  room.puzzle = null;
  room.reference = null;
  room.estimates = {};
  room.estimateEndsAt = null;
  room.roundResults = null;
  room.lastRoundResults = null;
  room.revealAutoAt = null;
  room.players.forEach((p) => { p.score = 0; });
}

function startGame(room) {
  ensureScores(room);
  if (room.players.length < MIN_PLAYERS) {
    return { ok: false, msg: `Il faut au moins ${MIN_PLAYERS} joueurs.` };
  }
  room.players.forEach((p) => { p.score = 0; });
  room.currentRound = 0;
  room.usedIds = [];
  room.deck = [];
  room.roundResults = null;
  room.lastRoundResults = null;
  buildDeck(room);
  if (!room.deck.length) {
    return { ok: false, msg: 'Aucun puzzle dans les catégories choisies.' };
  }
  startEstimateRound(room);
  return { ok: true };
}

function sanitizeRoom(room, socketId) {
  ensureScores(room);
  const me = getPlayer(room, socketId);
  const myEst = room.estimates[socketId];
  const ranking = [...room.players]
    .map((p) => ({ id: p.id, name: p.name, score: p.score || 0 }))
    .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));

  const withTruth = room.phase === 'reveal' || room.phase === 'end';
  const puzzle = room.puzzle
    ? puzzlePublicMeta(room.puzzle, room.reference, { withTruth })
    : null;

  const locks = room.players.map((p) => ({
    id: p.id,
    name: p.name,
    locked: Boolean(room.estimates[p.id]?.locked)
  }));

  return {
    gameId: room.gameId,
    code: room.code,
    phase: room.phase,
    isHost: isHost(room, socketId),
    myId: socketId,
    myName: me?.name || '',
    myScore: me?.score || 0,
    hostId: room.hostId,
    settings: {
      roundCount: room.settings.roundCount,
      estimateSec: room.settings.estimateSec,
      categories: [...(room.settings.categories || [])]
    },
    players: room.players.map((p) => ({
      id: p.id,
      name: p.name,
      score: p.score || 0,
      isHost: p.id === room.hostId,
      locked: Boolean(room.estimates[p.id]?.locked)
    })),
    ranking,
    currentRound: room.currentRound,
    roundCount: room.settings.roundCount,
    puzzle,
    reference: room.reference,
    estimateEndsAt: room.estimateEndsAt,
    estimateRemainingMs: room.estimateEndsAt
      ? Math.max(0, room.estimateEndsAt - Date.now())
      : null,
    myEstimateM: myEst?.valueM ?? null,
    myLocked: Boolean(myEst?.locked),
    locks,
    roundResults: withTruth ? room.roundResults : null,
    lastRoundResults: room.lastRoundResults,
    minPlayers: MIN_PLAYERS,
    categoriesAvailable: VALID_CATEGORIES
  };
}

function ensureValidMaster(room) {
  if (!getPlayer(room, room.hostId) && room.players.length) {
    room.hostId = room.players[0].id;
  }
}

function onTick(room) {
  if (room.phase === 'estimate' && room.estimateEndsAt != null && Date.now() >= room.estimateEndsAt) {
    finalizeRound(room);
    return true;
  }
  if (room.phase === 'reveal' && room.revealAutoAt != null && Date.now() >= room.revealAutoAt) {
    advanceAfterReveal(room);
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
    socket.on('si-update-settings', (settings = {}) => {
      const room = getRoom(ctx, socket);
      if (!room || !isHost(room, socket.id) || room.phase !== 'lobby') return;

      if (settings.roundCount != null) {
        const n = parseInt(settings.roundCount, 10);
        if (VALID_ROUNDS.includes(n)) room.settings.roundCount = n;
      }
      if (settings.estimateSec != null) {
        const n = parseInt(settings.estimateSec, 10);
        if (VALID_ESTIMATE_SEC.includes(n)) room.settings.estimateSec = n;
      }
      if (Array.isArray(settings.categories)) {
        const cats = settings.categories.filter((c) => VALID_CATEGORIES.includes(c));
        if (cats.length) room.settings.categories = cats;
      }
      broadcastRoom(room);
    });

    socket.on('si-start-game', () => {
      const room = getRoom(ctx, socket);
      if (!room || !isHost(room, socket.id) || room.phase !== 'lobby') return;
      const check = startGame(room);
      if (!check.ok) {
        socket.emit('error-msg', check.msg);
        return;
      }
      broadcastRoom(room);
    });

    socket.on('si-update-estimate', ({ valueM } = {}) => {
      const room = getRoom(ctx, socket);
      if (!room || room.phase !== 'estimate') return;
      if (!getPlayer(room, socket.id)) return;
      if (room.estimates[socket.id]?.locked) return;

      const v = Number(valueM);
      if (!Number.isFinite(v) || v <= 0 || v > 1e15) return;
      room.estimates[socket.id] = {
        valueM: v,
        locked: false,
        lockedAt: null
      };
      // pas de broadcast à chaque drag — trop bruyant
    });

    socket.on('si-lock', ({ valueM } = {}) => {
      const room = getRoom(ctx, socket);
      if (!room || room.phase !== 'estimate') return;
      if (!getPlayer(room, socket.id)) return;
      if (room.estimates[socket.id]?.locked) return;

      let v = Number(valueM);
      if (!Number.isFinite(v) || v <= 0) {
        v = room.estimates[socket.id]?.valueM;
      }
      if (!Number.isFinite(v) || v <= 0) {
        socket.emit('error-msg', 'Estimation invalide.');
        return;
      }

      room.estimates[socket.id] = {
        valueM: v,
        locked: true,
        lockedAt: Date.now()
      };

      if (allLocked(room)) {
        finalizeRound(room);
      } else if (Object.values(room.estimates).filter((e) => e.locked).length === room.players.length) {
        // noop
      }
      broadcastRoom(room);
    });

    socket.on('si-next-round', () => {
      const room = getRoom(ctx, socket);
      if (!room || !isHost(room, socket.id) || room.phase !== 'reveal') return;
      advanceAfterReveal(room);
      broadcastRoom(room);
    });

    socket.on('si-back-to-lobby', () => {
      const room = getRoom(ctx, socket);
      if (!room || !isHost(room, socket.id)) return;
      resetToLobby(room);
      broadcastRoom(room);
    });

    socket.on('si-rematch', () => {
      const room = getRoom(ctx, socket);
      if (!room || !isHost(room, socket.id) || room.phase !== 'end') return;
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
  // exports for tests
  toMeters,
  fromMeters,
  pickReference,
  startGame,
  finalizeRound
};
