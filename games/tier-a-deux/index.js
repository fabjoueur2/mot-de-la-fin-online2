/**
 * TIER À DEUX — 1 listeur rotatif + N devineurs.
 */
'use strict';

const crypto = require('crypto');
const { sanitizeDisplayName } = require('../../lib/sanitize');
const {
  DEFAULT_CONFIG,
  sanitizeConfig,
  applyPreset,
  configSummary,
  ALL_CATEGORIES,
  CATEGORY_LABELS,
  PRESETS
} = require('./config');
const { pickRoundItems, countAvailable, itemsByIds, getItemById } = require('./pick');
const { validateRanking, scoreGuessersRound, positionMap } = require('./score');
const { reactionForItem, reactionForRound, endTitles } = require('./reactions');

const GAME_ID = 'tier-a-deux';
const MIN_PLAYERS = 2;
const MAX_PLAYERS = 8;
const DISCONNECT_GRACE_MS = 120_000;

function newReconnectToken() {
  return crypto.randomBytes(16).toString('hex');
}

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
        lastRoundScore: 0,
        ready: false,
        reconnectToken: newReconnectToken()
      }
    ],
    config: sanitizeConfig(DEFAULT_CONFIG),
    configFrozen: false,
    phase: 'lobby',
    currentRound: 0,
    listeurId: null,
    usedItemIds: [],
    roundItems: [],
    displayOrder: [],
    listing: null,
    guesses: {},
    drafts: { listing: null, guess: {} },
    revealAcks: {},
    nextReady: {},
    phaseEndsAt: null,
    revealIndex: 0,
    revealOrder: [],
    lastReveal: null,
    lastRoundScore: null,
    history: [],
    totals: {
      correctPredictions: {},
      correctTotal: 0,
      possibleTotal: 0
    },
    gameStats: null
  };
}

function getPlayer(room, id) {
  return room.players.find((p) => p.id === id);
}

function isHost(room, socketId) {
  return room.hostId === socketId;
}

function guessers(room) {
  return room.players.filter((p) => p.id !== room.listeurId);
}

function pickListeurId(room) {
  if (!room.players.length) return null;
  const idx = (Math.max(1, room.currentRound) - 1) % room.players.length;
  return room.players[idx].id;
}

function ensureTotals(room) {
  if (!room.totals) {
    room.totals = { correctPredictions: {}, correctTotal: 0, possibleTotal: 0 };
  }
  for (const p of room.players) {
    if (room.totals.correctPredictions[p.id] == null) {
      room.totals.correctPredictions[p.id] = 0;
    }
  }
}

function migratePlayerId(room, oldId, newId) {
  if (!oldId || !newId || oldId === newId) return;
  const p = getPlayer(room, oldId);
  if (p) p.id = newId;
  if (room.hostId === oldId) room.hostId = newId;
  if (room.listeurId === oldId) room.listeurId = newId;

  if (room.guesses?.[oldId] != null) {
    room.guesses[newId] = room.guesses[oldId];
    delete room.guesses[oldId];
  }
  if (room.drafts?.guess?.[oldId] != null) {
    room.drafts.guess[newId] = room.drafts.guess[oldId];
    delete room.drafts.guess[oldId];
  }
  for (const bag of [room.revealAcks, room.nextReady]) {
    if (bag?.[oldId] != null) {
      bag[newId] = bag[oldId];
      delete bag[oldId];
    }
  }
  if (room.totals?.correctPredictions?.[oldId] != null) {
    room.totals.correctPredictions[newId] = room.totals.correctPredictions[oldId];
    delete room.totals.correctPredictions[oldId];
  }
  if (room.lastRoundScore?.byPlayer?.[oldId]) {
    room.lastRoundScore.byPlayer[newId] = room.lastRoundScore.byPlayer[oldId];
    room.lastRoundScore.byPlayer[newId].id = newId;
    delete room.lastRoundScore.byPlayer[oldId];
  }
  if (room.lastReveal?.listeurId === oldId) room.lastReveal.listeurId = newId;
}

function softDisconnect(room, socketId) {
  if (room.phase === 'lobby' || room.phase === 'game_results') return false;
  const p = getPlayer(room, socketId);
  if (!p) return false;
  p.disconnectedAt = Date.now();
  return true;
}

function reclaimPlayer(room, token, newSocketId) {
  if (!token || !newSocketId) return { ok: false, msg: 'Session invalide.' };
  const p = room.players.find((x) => x.reconnectToken === token);
  if (!p) return { ok: false, msg: 'Impossible de reprendre la partie.' };
  if (!p.disconnectedAt && p.id !== newSocketId) {
    return { ok: false, msg: 'Ce siège est encore connecté.' };
  }
  migratePlayerId(room, p.id, newSocketId);
  delete p.disconnectedAt;
  if (!p.reconnectToken) p.reconnectToken = newReconnectToken();
  return { ok: true };
}

function pruneDisconnected(room) {
  const now = Date.now();
  const before = room.players.length;
  room.players = room.players.filter(
    (p) => !p.disconnectedAt || now - p.disconnectedAt < DISCONNECT_GRACE_MS
  );
  if (room.players.length !== before) {
    if (room.hostId && !getPlayer(room, room.hostId) && room.players.length) {
      room.hostId = room.players[0].id;
    }
    if (room.listeurId && !getPlayer(room, room.listeurId) && room.players.length) {
      room.listeurId = pickListeurId(room);
    }
    return true;
  }
  return false;
}

function resetToLobby(room) {
  room.phase = 'lobby';
  room.currentRound = 0;
  room.listeurId = null;
  room.usedItemIds = [];
  room.roundItems = [];
  room.displayOrder = [];
  room.listing = null;
  room.guesses = {};
  room.drafts = { listing: null, guess: {} };
  room.revealAcks = {};
  room.nextReady = {};
  room.phaseEndsAt = null;
  room.revealIndex = 0;
  room.revealOrder = [];
  room.lastReveal = null;
  room.lastRoundScore = null;
  room.history = [];
  room.totals = { correctPredictions: {}, correctTotal: 0, possibleTotal: 0 };
  room.gameStats = null;
  room.configFrozen = false;
  room.players.forEach((p) => {
    p.score = 0;
    p.lastRoundScore = 0;
    p.ready = false;
  });
}

function bothReady(room) {
  return room.players.length >= MIN_PLAYERS && room.players.every((p) => p.ready);
}

function canStart(room) {
  if (room.players.length < MIN_PLAYERS) {
    return { ok: false, msg: `Minimum ${MIN_PLAYERS} joueurs.` };
  }
  if (room.players.length > MAX_PLAYERS) {
    return { ok: false, msg: `Maximum ${MAX_PLAYERS} joueurs.` };
  }
  if (!bothReady(room)) {
    return { ok: false, msg: 'Tous les joueurs doivent être prêts.' };
  }
  const cfg = room.config;
  const need =
    cfg.roundCount === 'unlimited'
      ? cfg.itemsPerRound * 3
      : cfg.itemsPerRound * cfg.roundCount;
  const available = countAvailable(cfg, []);
  if (available < cfg.itemsPerRound) {
    return {
      ok: false,
      msg: `Pas assez d’éléments dans les catégories choisies (${available}).`
    };
  }
  if (cfg.avoidRepeats && cfg.roundCount !== 'unlimited' && available < need) {
    return {
      ok: false,
      msg: `Banque trop petite pour ${cfg.roundCount} manches × ${cfg.itemsPerRound} (dispo : ${available}).`
    };
  }
  return { ok: true };
}

function setPhaseTimer(room, seconds) {
  if (room.config.timer?.enabled && seconds > 0) {
    room.phaseEndsAt = Date.now() + seconds * 1000;
  } else {
    room.phaseEndsAt = null;
  }
}

function randomPermutation(ids) {
  const a = [...ids];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function beginRound(room) {
  const picked = pickRoundItems(room.usedItemIds, room.config);
  const ids = picked.map((x) => x.id);
  room.usedItemIds.push(...ids);
  room.roundItems = picked;
  room.displayOrder = [...ids];
  room.listeurId = pickListeurId(room);
  room.listing = null;
  room.guesses = {};
  room.drafts = { listing: null, guess: {} };
  room.revealAcks = {};
  room.nextReady = {};
  room.revealIndex = 0;
  room.revealOrder = [];
  room.lastReveal = null;
  room.lastRoundScore = null;
  room.phase = 'listing';
  setPhaseTimer(room, room.config.timer.personalRankingSeconds);
  room.players.forEach((p) => {
    p.lastRoundScore = 0;
    p.ready = false;
  });
}

function startGame(room) {
  const check = canStart(room);
  if (!check.ok) return check;
  room.config = sanitizeConfig(room.config);
  room.configFrozen = true;
  room.currentRound = 1;
  room.usedItemIds = [];
  room.history = [];
  room.totals = { correctPredictions: {}, correctTotal: 0, possibleTotal: 0 };
  room.players.forEach((p) => {
    p.score = 0;
    p.lastRoundScore = 0;
  });
  ensureTotals(room);
  beginRound(room);
  return { ok: true };
}

function allGuessersLocked(room) {
  const g = guessers(room);
  if (!g.length) return false;
  return g.every((p) => room.guesses[p.id]);
}

function lockListing(room, playerId, ranking) {
  if (room.phase !== 'listing') return { ok: false, msg: 'Pas le moment.' };
  if (playerId !== room.listeurId) {
    return { ok: false, msg: 'Seul le listeur peut valider.' };
  }
  if (room.listing) return { ok: false, msg: 'Classement déjà verrouillé.' };
  const check = validateRanking(room.displayOrder, ranking);
  if (!check.ok) return check;
  room.listing = [...ranking];
  room.drafts.listing = null;
  room.phase = 'guessing';
  setPhaseTimer(room, room.config.timer.predictionSeconds);
  return { ok: true };
}

function lockGuess(room, playerId, ranking) {
  if (room.phase !== 'guessing') return { ok: false, msg: 'Pas le moment.' };
  if (playerId === room.listeurId) {
    return { ok: false, msg: 'Le listeur ne prédit pas.' };
  }
  if (room.guesses[playerId]) {
    return { ok: false, msg: 'Prédiction déjà verrouillée.' };
  }
  const check = validateRanking(room.displayOrder, ranking);
  if (!check.ok) return check;
  room.guesses[playerId] = [...ranking];
  delete room.drafts.guess[playerId];
  if (allGuessersLocked(room)) enterReveal(room);
  return { ok: true };
}

function autoLockDrafts(room) {
  if (!room.config.timer?.enabled) return false;
  const ids = room.displayOrder;
  let changed = false;

  if (room.phase === 'listing' && !room.listing && room.listeurId) {
    const draft = room.drafts.listing;
    const ranking =
      draft && validateRanking(ids, draft).ok ? draft : randomPermutation(ids);
    lockListing(room, room.listeurId, ranking);
    changed = true;
  } else if (room.phase === 'guessing') {
    for (const p of guessers(room)) {
      if (room.guesses[p.id]) continue;
      const draft = room.drafts.guess[p.id];
      const ranking =
        draft && validateRanking(ids, draft).ok ? draft : randomPermutation(ids);
      lockGuess(room, p.id, ranking);
      changed = true;
    }
  }
  return changed;
}

function buildRevealOrder(room) {
  const orderMode = room.config.reveal?.order || 'listeur';
  if (orderMode === 'listeur' && room.listing) return [...room.listing];
  return randomPermutation(room.displayOrder);
}

function enterReveal(room) {
  if (room.phase === 'reveal') return;
  ensureTotals(room);
  const listeurId = room.listeurId;
  const guids = guessers(room).map((p) => p.id);

  const scored = scoreGuessersRound({
    listeurId,
    listeurRanking: room.listing,
    guessesByPlayerId: room.guesses,
    guesserIds: guids,
    itemIds: room.displayOrder,
    scoring: room.config.scoring
  });

  for (const p of room.players) {
    const sc = scored.byPlayer[p.id];
    const pts = sc?.total || 0;
    p.lastRoundScore = pts;
    p.score = (p.score || 0) + pts;
    if (sc && !sc.isListeur) {
      room.totals.correctPredictions[p.id] =
        (room.totals.correctPredictions[p.id] || 0) + (sc.correctPredictions || 0);
    }
  }
  room.totals.correctTotal += scored.correctPredictionsTotal;
  room.totals.possibleTotal += scored.possiblePredictions;

  const revealOrder = buildRevealOrder(room);
  room.revealOrder = revealOrder;
  const listeurMap = positionMap(room.listing);
  const guesserCount = guids.length;

  const items = revealOrder.map((itemId) => {
    const item = getItemById(itemId);
    const listeurPos = listeurMap.get(itemId);
    const guesses = guids.map((gid) => {
      const sc = scored.byPlayer[gid];
      const per = sc?.perItem?.find((x) => x.itemId === itemId);
      const pl = getPlayer(room, gid);
      return {
        playerId: gid,
        name: pl?.name || '?',
        predictedPosition: per?.predictedPosition || null,
        points: per?.total || 0,
        correct: per?.predictedPosition === listeurPos
      };
    });
    const hits = guesses.filter((g) => g.correct).length;
    return {
      itemId,
      text: item?.text || itemId,
      category: item?.category,
      listeurPosition: listeurPos,
      guesses,
      hits,
      reaction: reactionForItem({ hits, guesserCount })
    };
  });

  const playerScores = room.players.map((p) => ({
    playerId: p.id,
    name: p.name,
    ...(scored.byPlayer[p.id] || { total: 0 }),
    cumulative: p.score,
    isListeur: p.id === listeurId
  }));

  room.lastReveal = {
    items,
    listeurId,
    listeurName: getPlayer(room, listeurId)?.name || 'Listeur',
    listeurRanking: room.listing,
    accuracyPercent: scored.accuracyPercent,
    reaction: reactionForRound(scored.accuracyPercent),
    playerScores
  };
  room.lastRoundScore = scored;
  room.history.push({
    round: room.currentRound,
    listeurId,
    itemIds: [...room.displayOrder],
    accuracyPercent: scored.accuracyPercent,
    scores: Object.fromEntries(
      room.players.map((p) => [p.id, scored.byPlayer[p.id]?.total || 0])
    )
  });

  room.phase = 'reveal';
  room.revealIndex = 0;
  room.revealAcks = {};
  room.phaseEndsAt =
    room.config.reveal.mode === 'automatic'
      ? Date.now() + (room.config.reveal.intervalSeconds || 6) * 1000
      : null;
}

function advanceReveal(room) {
  if (room.phase !== 'reveal') return false;
  room.revealIndex += 1;
  room.revealAcks = {};
  if (room.revealIndex >= room.revealOrder.length) {
    room.phase = 'round_results';
    room.phaseEndsAt = null;
    room.nextReady = {};
    return true;
  }
  if (room.config.reveal.mode === 'automatic') {
    room.phaseEndsAt = Date.now() + (room.config.reveal.intervalSeconds || 6) * 1000;
  } else {
    room.phaseEndsAt = null;
  }
  return true;
}

function ackReveal(room, playerId) {
  if (room.phase !== 'reveal') return { ok: false, msg: 'Pas le moment.' };
  room.revealAcks[playerId] = true;
  if (room.players.every((p) => room.revealAcks[p.id])) {
    advanceReveal(room);
  }
  return { ok: true };
}

function isLastRound(room) {
  if (room.config.roundCount === 'unlimited') return false;
  return room.currentRound >= room.config.roundCount;
}

function buildGameStats(room) {
  ensureTotals(room);
  const possible = Math.max(1, room.totals.possibleTotal);
  const globalAccuracy = Math.round((room.totals.correctTotal / possible) * 100);

  const disagreements = [];
  const bestRounds = [];
  for (const h of room.history) {
    if (h.accuracyPercent <= 20) {
      disagreements.push({ round: h.round, accuracyPercent: h.accuracyPercent });
    }
    if (h.accuracyPercent >= 80) {
      bestRounds.push({ round: h.round, accuracyPercent: h.accuracyPercent });
    }
  }

  const scoresById = Object.fromEntries(room.players.map((p) => [p.id, p.score || 0]));
  const correctById = { ...room.totals.correctPredictions };
  const titles = endTitles({
    players: room.players.map((p) => ({ id: p.id, name: p.name })),
    correctById,
    scoresById,
    globalAccuracy
  });

  const sorted = [...room.players].sort((a, b) => (b.score || 0) - (a.score || 0));
  let winnerId = null;
  if (sorted.length && (sorted[0].score || 0) > (sorted[1]?.score || 0)) {
    winnerId = sorted[0].id;
  }

  return {
    winnerId,
    scores: room.players.map((p) => ({
      id: p.id,
      name: p.name,
      score: p.score || 0
    })),
    correctPredictions: correctById,
    globalAccuracyPercent: globalAccuracy,
    correctTotal: room.totals.correctTotal,
    possibleTotal: room.totals.possibleTotal,
    disagreements,
    bestRounds,
    titles,
    roundsPlayed: room.history.length
  };
}

function finishGame(room) {
  room.phase = 'game_results';
  room.phaseEndsAt = null;
  room.gameStats = buildGameStats(room);
}

function readyNextRound(room, playerId) {
  if (room.phase !== 'round_results') {
    return { ok: false, msg: 'Pas le moment.' };
  }
  room.nextReady[playerId] = true;
  if (!room.players.every((p) => room.nextReady[p.id])) {
    return { ok: true };
  }
  if (isLastRound(room)) {
    finishGame(room);
    return { ok: true };
  }
  room.currentRound += 1;
  beginRound(room);
  return { ok: true };
}

function ensureValidMaster(room) {
  if (!getPlayer(room, room.hostId) && room.players.length) {
    room.hostId = room.players[0].id;
  }
}

function onTick(room) {
  let changed = pruneDisconnected(room);
  if (room.players.length === 0) return 'delete';

  const now = Date.now();
  if (
    room.phaseEndsAt &&
    now >= room.phaseEndsAt &&
    (room.phase === 'listing' || room.phase === 'guessing')
  ) {
    if (room.config.timer?.enabled) {
      autoLockDrafts(room);
      return true;
    }
  }

  if (
    room.phase === 'reveal' &&
    room.config.reveal.mode === 'automatic' &&
    room.phaseEndsAt &&
    now >= room.phaseEndsAt
  ) {
    advanceReveal(room);
    return true;
  }

  return changed;
}

function sanitizeRoom(room, socketId) {
  const me = getPlayer(room, socketId);
  const cfg = room.config;
  const showSecrets =
    room.phase === 'reveal' ||
    room.phase === 'round_results' ||
    room.phase === 'game_results';

  const isListeur = socketId === room.listeurId;
  const role =
    room.phase === 'lobby' || !room.listeurId
      ? null
      : isListeur
        ? 'listeur'
        : 'devineur';

  let revealPayload = null;
  if (room.phase === 'reveal' && room.lastReveal) {
    const item = room.lastReveal.items[room.revealIndex] || null;
    revealPayload = {
      index: room.revealIndex,
      total: room.lastReveal.items.length,
      item,
      waitingPartner: Boolean(room.revealAcks[socketId])
        ? !room.players.every((p) => room.revealAcks[p.id])
        : false,
      iAcked: Boolean(room.revealAcks[socketId]),
      accuracyPercent: room.lastReveal.accuracyPercent,
      listeurName: room.lastReveal.listeurName
    };
  }

  let roundResults = null;
  if (
    (room.phase === 'round_results' || room.phase === 'game_results') &&
    room.lastReveal &&
    (cfg.showScores === 'each_round' || room.phase === 'game_results')
  ) {
    roundResults = {
      accuracyPercent: room.lastReveal.accuracyPercent,
      reaction: room.lastReveal.reaction,
      listeurId: room.lastReveal.listeurId,
      listeurName: room.lastReveal.listeurName,
      listeurRanking: itemsByIds(room.lastReveal.listeurRanking),
      playerScores: room.lastReveal.playerScores,
      nextReady: room.players.map((p) => ({
        id: p.id,
        name: p.name,
        ready: Boolean(room.nextReady[p.id])
      }))
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
    reconnectToken: me?.reconnectToken || null,
    hostId: room.hostId,
    listeurId: room.listeurId,
    listeurName: room.listeurId ? getPlayer(room, room.listeurId)?.name || '' : '',
    role,
    config: sanitizeConfig(cfg),
    configSummary: configSummary(cfg),
    configFrozen: room.configFrozen,
    categoryLabels: CATEGORY_LABELS,
    presets: Object.fromEntries(
      Object.entries(PRESETS).map(([k, v]) => [k, { label: v.label }])
    ),
    allCategories: ALL_CATEGORIES,
    players: room.players.map((p) => ({
      id: p.id,
      name: p.name,
      score: p.score || 0,
      lastRoundScore: p.lastRoundScore || 0,
      isHost: p.id === room.hostId,
      isListeur: p.id === room.listeurId,
      ready: Boolean(p.ready),
      disconnected: Boolean(p.disconnectedAt),
      listingLocked: p.id === room.listeurId ? Boolean(room.listing) : false,
      guessLocked: Boolean(room.guesses[p.id])
    })),
    currentRound: room.currentRound,
    roundCount: cfg.roundCount,
    itemsPerRound: cfg.itemsPerRound,
    items: room.phase === 'lobby' ? [] : room.roundItems,
    myListing: isListeur ? room.listing : showSecrets ? room.listing : null,
    myGuess: room.guesses[socketId] || null,
    listingLocked: Boolean(room.listing),
    myGuessLocked: Boolean(room.guesses[socketId]),
    guessesLockedCount: Object.keys(room.guesses).length,
    guesserCount: guessers(room).length,
    listeurRanking: showSecrets ? room.listing : null,
    allGuesses: showSecrets ? room.guesses : null,
    reveal: revealPayload,
    roundResults,
    gameStats: room.phase === 'game_results' ? room.gameStats : null,
    phaseEndsAt: room.phaseEndsAt,
    phaseRemainingMs: room.phaseEndsAt
      ? Math.max(0, room.phaseEndsAt - Date.now())
      : null,
    serverNow: Date.now(),
    minPlayers: MIN_PLAYERS,
    maxPlayers: MAX_PLAYERS,
    historyCount: (room.history || []).length,
    globalAccuracyPercent:
      room.totals && room.totals.possibleTotal
        ? Math.round((room.totals.correctTotal / room.totals.possibleTotal) * 100)
        : null
  };
}

function getRoom(ctx, socket) {
  const room = ctx.rooms.get(ctx.socketToRoom.get(socket.id));
  if (!room || room.gameId !== GAME_ID) return null;
  return room;
}

function registerHandlers(io, ctx) {
  const { broadcastRoom, joinSocketToRoom, leaveRoom, rooms, socketToRoom } = ctx;

  io.on('connection', (socket) => {
    socket.on('tad-update-config', (payload = {}) => {
      const room = getRoom(ctx, socket);
      if (!room || !isHost(room, socket.id) || room.phase !== 'lobby') return;
      if (room.configFrozen) return;
      room.config = sanitizeConfig({ ...room.config, ...payload });
      broadcastRoom(room);
    });

    socket.on('tad-apply-preset', ({ preset } = {}) => {
      const room = getRoom(ctx, socket);
      if (!room || !isHost(room, socket.id) || room.phase !== 'lobby') return;
      room.config = applyPreset(preset);
      broadcastRoom(room);
    });

    socket.on('tad-reset-config', () => {
      const room = getRoom(ctx, socket);
      if (!room || !isHost(room, socket.id) || room.phase !== 'lobby') return;
      room.config = sanitizeConfig(DEFAULT_CONFIG);
      broadcastRoom(room);
    });

    socket.on('tad-set-ready', ({ ready } = {}) => {
      const room = getRoom(ctx, socket);
      if (!room || room.phase !== 'lobby') return;
      const p = getPlayer(room, socket.id);
      if (!p) return;
      p.ready = Boolean(ready);
      broadcastRoom(room);
    });

    socket.on('tad-start-game', () => {
      const room = getRoom(ctx, socket);
      if (!room || !isHost(room, socket.id) || room.phase !== 'lobby') return;
      const check = startGame(room);
      if (!check.ok) {
        socket.emit('error-msg', check.msg);
        return;
      }
      broadcastRoom(room);
    });

    socket.on('tad-sync-draft', ({ kind, ranking } = {}) => {
      const room = getRoom(ctx, socket);
      if (!room || !Array.isArray(ranking)) return;
      if (kind === 'listing' && socket.id === room.listeurId) {
        room.drafts.listing = ranking;
      } else if (kind === 'guess' && socket.id !== room.listeurId) {
        room.drafts.guess[socket.id] = ranking;
      }
    });

    socket.on('tad-submit-listing', ({ ranking } = {}) => {
      const room = getRoom(ctx, socket);
      if (!room) {
        socket.emit('error-msg', 'Tu n’es plus dans une partie.');
        return;
      }
      const result = lockListing(room, socket.id, ranking);
      if (!result.ok) {
        socket.emit('error-msg', result.msg);
        return;
      }
      broadcastRoom(room);
    });

    socket.on('tad-submit-guess', ({ ranking } = {}) => {
      const room = getRoom(ctx, socket);
      if (!room) {
        socket.emit('error-msg', 'Tu n’es plus dans une partie.');
        return;
      }
      const result = lockGuess(room, socket.id, ranking);
      if (!result.ok) {
        socket.emit('error-msg', result.msg);
        return;
      }
      broadcastRoom(room);
    });

    socket.on('tad-reveal-continue', () => {
      const room = getRoom(ctx, socket);
      if (!room) return;
      const result = ackReveal(room, socket.id);
      if (!result.ok) {
        socket.emit('error-msg', result.msg);
        return;
      }
      broadcastRoom(room);
    });

    socket.on('tad-next-round', () => {
      const room = getRoom(ctx, socket);
      if (!room) return;
      const result = readyNextRound(room, socket.id);
      if (!result.ok) {
        socket.emit('error-msg', result.msg);
        return;
      }
      broadcastRoom(room);
    });

    socket.on('tad-end-game', () => {
      const room = getRoom(ctx, socket);
      if (!room || !isHost(room, socket.id)) return;
      if (room.phase !== 'round_results' && room.phase !== 'reveal') return;
      finishGame(room);
      broadcastRoom(room);
    });

    socket.on('tad-rematch', () => {
      const room = getRoom(ctx, socket);
      if (!room || !isHost(room, socket.id) || room.phase !== 'game_results') return;
      room.players.forEach((p) => {
        p.ready = true;
      });
      const check = startGame(room);
      if (!check.ok) {
        socket.emit('error-msg', check.msg);
        room.players.forEach((p) => {
          p.ready = false;
        });
        return;
      }
      broadcastRoom(room);
    });

    socket.on('tad-back-to-lobby', () => {
      const room = getRoom(ctx, socket);
      if (!room || !isHost(room, socket.id)) return;
      resetToLobby(room);
      broadcastRoom(room);
    });

    socket.on('tad-reclaim', ({ code, token } = {}) => {
      const roomCode = String(code || '')
        .toUpperCase()
        .replace(/[^A-Z0-9]/g, '')
        .slice(0, 6);
      const room = rooms.get(roomCode);
      if (!room || room.gameId !== GAME_ID) {
        socket.emit('error-msg', 'Partie introuvable — relance une partie.');
        return;
      }
      if (room.phase === 'lobby' || room.phase === 'game_results') {
        socket.emit('error-msg', 'Impossible de reprendre automatiquement.');
        return;
      }
      const prev = socketToRoom.get(socket.id);
      if (prev && prev !== roomCode) leaveRoom(socket);

      const result = reclaimPlayer(room, token, socket.id);
      if (!result.ok) {
        socket.emit('error-msg', result.msg);
        return;
      }
      joinSocketToRoom(socket, room);
      broadcastRoom(room);
    });
  });
}

module.exports = {
  id: GAME_ID,
  createInitialRoomState,
  sanitizeRoom,
  ensureValidMaster,
  softDisconnect,
  onTick,
  registerHandlers,
  MIN_PLAYERS,
  MAX_PLAYERS,
  startGame,
  lockListing,
  lockGuess,
  enterReveal,
  pickListeurId,
  reclaimPlayer,
  resetToLobby,
  sanitizeConfig,
  DEFAULT_CONFIG,
  scoreGuessersRound,
  validateRanking
};
