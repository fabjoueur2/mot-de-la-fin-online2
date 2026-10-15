/**
 * TIER À DEUX — Classement & déduction à deux.
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
const { validateRanking, scoreRound } = require('./score');
const { reactionForItem, reactionForRound, endTitles } = require('./reactions');

const GAME_ID = 'tier-a-deux';
const MIN_PLAYERS = 2;
const MAX_PLAYERS = 2;
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
    usedItemIds: [],
    roundItems: [],
    displayOrder: [],
    personal: {},
    predictions: {},
    drafts: { personal: {}, prediction: {} },
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
      matchingPositions: 0,
      placementsCompared: 0
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

function otherPlayer(room, socketId) {
  return room.players.find((p) => p.id !== socketId) || null;
}

function activePlayers(room) {
  return room.players.filter((p) => !p.disconnectedAt);
}

function bothReady(room) {
  return room.players.length === 2 && room.players.every((p) => p.ready);
}

function ensureTotals(room) {
  if (!room.totals) {
    room.totals = {
      correctPredictions: {},
      matchingPositions: 0,
      placementsCompared: 0
    };
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

  for (const bag of [room.personal, room.predictions, room.revealAcks, room.nextReady]) {
    if (bag && bag[oldId] != null) {
      bag[newId] = bag[oldId];
      delete bag[oldId];
    }
  }
  if (room.drafts) {
    for (const kind of ['personal', 'prediction']) {
      if (room.drafts[kind]?.[oldId] != null) {
        room.drafts[kind][newId] = room.drafts[kind][oldId];
        delete room.drafts[kind][oldId];
      }
    }
  }
  if (room.totals?.correctPredictions?.[oldId] != null) {
    room.totals.correctPredictions[newId] = room.totals.correctPredictions[oldId];
    delete room.totals.correctPredictions[oldId];
  }
  if (room.lastRoundScore) {
    if (room.lastRoundScore.playerA?.id === oldId) room.lastRoundScore.playerA.id = newId;
    if (room.lastRoundScore.playerB?.id === oldId) room.lastRoundScore.playerB.id = newId;
  }
  if (room.lastReveal?.items) {
    for (const it of room.lastReveal.items) {
      if (it.pointsA?.playerId === oldId) it.pointsA.playerId = newId;
      if (it.pointsB?.playerId === oldId) it.pointsB.playerId = newId;
    }
  }
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
  const oldId = p.id;
  migratePlayerId(room, oldId, newSocketId);
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
    return true;
  }
  return false;
}

function resetToLobby(room) {
  room.phase = 'lobby';
  room.currentRound = 0;
  room.usedItemIds = [];
  room.roundItems = [];
  room.displayOrder = [];
  room.personal = {};
  room.predictions = {};
  room.drafts = { personal: {}, prediction: {} };
  room.revealAcks = {};
  room.nextReady = {};
  room.phaseEndsAt = null;
  room.revealIndex = 0;
  room.revealOrder = [];
  room.lastReveal = null;
  room.lastRoundScore = null;
  room.history = [];
  room.totals = {
    correctPredictions: {},
    matchingPositions: 0,
    placementsCompared: 0
  };
  room.gameStats = null;
  room.configFrozen = false;
  room.players.forEach((p) => {
    p.score = 0;
    p.lastRoundScore = 0;
    p.ready = false;
  });
}

function canStart(room) {
  if (room.players.length < MIN_PLAYERS) {
    return { ok: false, msg: 'Il faut exactement 2 joueurs.' };
  }
  if (room.players.length > MAX_PLAYERS) {
    return { ok: false, msg: 'Salon plein (2 joueurs).' };
  }
  if (!bothReady(room)) {
    return { ok: false, msg: 'Les deux joueurs doivent être prêts.' };
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
      msg: `Banque trop petite pour ${cfg.roundCount} manches × ${cfg.itemsPerRound} (dispo : ${available}). Élargis les thèmes ou réduis les manches.`
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

function beginRound(room) {
  const picked = pickRoundItems(room.usedItemIds, room.config);
  const ids = picked.map((x) => x.id);
  room.usedItemIds.push(...ids);
  room.roundItems = picked;
  room.displayOrder = [...ids];
  room.personal = {};
  room.predictions = {};
  room.drafts = { personal: {}, prediction: {} };
  room.revealAcks = {};
  room.nextReady = {};
  room.revealIndex = 0;
  room.revealOrder = [];
  room.lastReveal = null;
  room.lastRoundScore = null;
  room.phase = 'personal_ranking';
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
  room.totals = {
    correctPredictions: {},
    matchingPositions: 0,
    placementsCompared: 0
  };
  room.players.forEach((p) => {
    p.score = 0;
    p.lastRoundScore = 0;
  });
  ensureTotals(room);
  beginRound(room);
  return { ok: true };
}

function bothHave(map, room) {
  return room.players.every((p) => map[p.id]);
}

function randomPermutation(ids) {
  const a = [...ids];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function lockPersonal(room, playerId, ranking) {
  if (room.phase !== 'personal_ranking') {
    return { ok: false, msg: 'Pas le moment.' };
  }
  if (room.personal[playerId]) {
    return { ok: false, msg: 'Classement déjà verrouillé.' };
  }
  const ids = room.displayOrder;
  const check = validateRanking(ids, ranking);
  if (!check.ok) return check;
  room.personal[playerId] = [...ranking];
  delete room.drafts.personal[playerId];

  if (bothHave(room.personal, room)) {
    room.phase = 'partner_prediction';
    setPhaseTimer(room, room.config.timer.predictionSeconds);
  }
  return { ok: true };
}

function lockPrediction(room, playerId, ranking) {
  if (room.phase !== 'partner_prediction') {
    return { ok: false, msg: 'Pas le moment.' };
  }
  if (room.predictions[playerId]) {
    return { ok: false, msg: 'Prédiction déjà verrouillée.' };
  }
  const ids = room.displayOrder;
  const check = validateRanking(ids, ranking);
  if (!check.ok) return check;
  room.predictions[playerId] = [...ranking];
  delete room.drafts.prediction[playerId];

  if (bothHave(room.predictions, room)) {
    enterReveal(room);
  }
  return { ok: true };
}

function autoLockDrafts(room) {
  if (!room.config.autoSubmitOnTimeout && !room.config.timer?.enabled) return false;
  let changed = false;
  const ids = room.displayOrder;

  if (room.phase === 'personal_ranking') {
    for (const p of room.players) {
      if (room.personal[p.id]) continue;
      const draft = room.drafts.personal[p.id];
      const ranking =
        draft && validateRanking(ids, draft).ok ? draft : randomPermutation(ids);
      lockPersonal(room, p.id, ranking);
      changed = true;
    }
  } else if (room.phase === 'partner_prediction') {
    for (const p of room.players) {
      if (room.predictions[p.id]) continue;
      const draft = room.drafts.prediction[p.id];
      const ranking =
        draft && validateRanking(ids, draft).ok ? draft : randomPermutation(ids);
      lockPrediction(room, p.id, ranking);
      changed = true;
    }
  }
  return changed;
}

function buildRevealOrder(room) {
  const [a, b] = room.players;
  const orderMode = room.config.reveal?.order || 'random';
  if (orderMode === 'playerA' && room.personal[a.id]) return [...room.personal[a.id]];
  if (orderMode === 'playerB' && room.personal[b.id]) return [...room.personal[b.id]];
  return randomPermutation(room.displayOrder);
}

function enterReveal(room) {
  if (room.phase === 'reveal') return;
  const [a, b] = room.players;
  ensureTotals(room);

  const scored = scoreRound({
    playerA: a.id,
    playerB: b.id,
    rankingA: room.personal[a.id],
    rankingB: room.personal[b.id],
    predictionA: room.predictions[a.id],
    predictionB: room.predictions[b.id],
    itemIds: room.displayOrder,
    scoring: room.config.scoring
  });

  a.lastRoundScore = scored.playerA.total;
  b.lastRoundScore = scored.playerB.total;
  a.score = (a.score || 0) + scored.playerA.total;
  b.score = (b.score || 0) + scored.playerB.total;

  room.totals.correctPredictions[a.id] =
    (room.totals.correctPredictions[a.id] || 0) + scored.playerA.correctPredictions;
  room.totals.correctPredictions[b.id] =
    (room.totals.correctPredictions[b.id] || 0) + scored.playerB.correctPredictions;
  room.totals.matchingPositions += scored.matchingPositions;
  room.totals.placementsCompared += room.displayOrder.length;

  const revealOrder = buildRevealOrder(room);
  room.revealOrder = revealOrder;

  const items = revealOrder.map((itemId) => {
    const item = getItemById(itemId);
    const perA = scored.playerA.perItem.find((x) => x.itemId === itemId);
    const perB = scored.playerB.perItem.find((x) => x.itemId === itemId);
    const matchedPersonal = perA?.myPosition === perA?.partnerPosition;
    return {
      itemId,
      text: item?.text || itemId,
      category: item?.category,
      positionA: perA?.myPosition,
      positionB: perB?.myPosition,
      predictionA: perA?.predictedPosition,
      predictionB: perB?.predictedPosition,
      pointsA: {
        playerId: a.id,
        prediction: perA?.predictionPoints || 0,
        match: perA?.matchPoints || 0,
        total: perA?.total || 0
      },
      pointsB: {
        playerId: b.id,
        prediction: perB?.predictionPoints || 0,
        match: perB?.matchPoints || 0,
        total: perB?.total || 0
      },
      matchedPersonal,
      reaction: reactionForItem({
        matchedPersonal,
        correctPredA: (perA?.predictionPoints || 0) > 0,
        correctPredB: (perB?.predictionPoints || 0) > 0
      })
    };
  });

  room.lastReveal = {
    items,
    scoreA: scored.playerA,
    scoreB: scored.playerB,
    compatibilityPercent: scored.compatibilityPercent,
    reaction: reactionForRound(scored.compatibilityPercent),
    rankingA: room.personal[a.id],
    rankingB: room.personal[b.id],
    playerAId: a.id,
    playerBId: b.id
  };
  room.lastRoundScore = scored;
  room.history.push({
    round: room.currentRound,
    itemIds: [...room.displayOrder],
    compatibilityPercent: scored.compatibilityPercent,
    scoreA: scored.playerA.total,
    scoreB: scored.playerB.total
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
  const [a, b] = room.players;
  ensureTotals(room);
  const placements = Math.max(1, room.totals.placementsCompared);
  const globalCompat = Math.round((room.totals.matchingPositions / placements) * 100);

  // Plus gros désaccords / meilleures prédictions sur last history reveals — simplifié
  const disagreements = [];
  const bestPredictions = [];
  for (const h of room.history) {
    // stored lightly; pull from lastReveal style not kept — use history compat
    if (h.compatibilityPercent <= 20) {
      disagreements.push({ round: h.round, compatibilityPercent: h.compatibilityPercent });
    }
    if (h.compatibilityPercent >= 80) {
      bestPredictions.push({ round: h.round, compatibilityPercent: h.compatibilityPercent });
    }
  }

  const titles = endTitles({
    playerA: a.id,
    playerB: b.id,
    scoreA: a.score || 0,
    scoreB: b.score || 0,
    correctPredA: room.totals.correctPredictions[a.id] || 0,
    correctPredB: room.totals.correctPredictions[b.id] || 0,
    globalCompat
  });

  let winnerId = null;
  if ((a.score || 0) > (b.score || 0)) winnerId = a.id;
  else if ((b.score || 0) > (a.score || 0)) winnerId = b.id;

  return {
    winnerId,
    scores: [
      { id: a.id, name: a.name, score: a.score || 0 },
      { id: b.id, name: b.name, score: b.score || 0 }
    ],
    correctPredictions: {
      [a.id]: room.totals.correctPredictions[a.id] || 0,
      [b.id]: room.totals.correctPredictions[b.id] || 0
    },
    matchingPositionsTotal: room.totals.matchingPositions,
    globalCompatibilityPercent: globalCompat,
    disagreements,
    bestRounds: bestPredictions,
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
    (room.phase === 'personal_ranking' || room.phase === 'partner_prediction')
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
  const partner = otherPlayer(room, socketId);
  const cfg = room.config;
  const showSecrets =
    room.phase === 'reveal' ||
    room.phase === 'round_results' ||
    room.phase === 'game_results';

  const myPersonal = room.personal[socketId] || null;
  const myPrediction = room.predictions[socketId] || null;
  const partnerPersonalLocked = partner ? Boolean(room.personal[partner.id]) : false;
  const partnerPredictionLocked = partner ? Boolean(room.predictions[partner.id]) : false;

  let revealPayload = null;
  if (room.phase === 'reveal' && room.lastReveal) {
    const item = room.lastReveal.items[room.revealIndex] || null;
    revealPayload = {
      index: room.revealIndex,
      total: room.lastReveal.items.length,
      suspense: room.revealIndex === 0 && !room.revealAcks[socketId],
      item,
      waitingPartner: !room.revealAcks[socketId]
        ? false
        : !room.players.every((p) => room.revealAcks[p.id]),
      iAcked: Boolean(room.revealAcks[socketId]),
      compatibilityPercent: room.lastReveal.compatibilityPercent
    };
  }

  let roundResults = null;
  if (
    (room.phase === 'round_results' || room.phase === 'game_results') &&
    room.lastReveal &&
    (cfg.showScores === 'each_round' || room.phase === 'game_results')
  ) {
    const [a, b] = room.players;
    roundResults = {
      compatibilityPercent: room.lastReveal.compatibilityPercent,
      reaction: room.lastReveal.reaction,
      rankingA: {
        playerId: a.id,
        name: a.name,
        order: itemsByIds(room.lastReveal.rankingA)
      },
      rankingB: {
        playerId: b.id,
        name: b.name,
        order: itemsByIds(room.lastReveal.rankingB)
      },
      scoreA: {
        playerId: a.id,
        name: a.name,
        ...room.lastReveal.scoreA,
        cumulative: a.score
      },
      scoreB: {
        playerId: b.id,
        name: b.name,
        ...room.lastReveal.scoreB,
        cumulative: b.score
      },
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
      ready: Boolean(p.ready),
      disconnected: Boolean(p.disconnectedAt),
      personalLocked: Boolean(room.personal[p.id]),
      predictionLocked: Boolean(room.predictions[p.id])
    })),
    currentRound: room.currentRound,
    roundCount: cfg.roundCount,
    itemsPerRound: cfg.itemsPerRound,
    items: room.phase === 'lobby' ? [] : room.roundItems,
    myPersonal,
    myPrediction,
    partnerPersonalLocked,
    partnerPredictionLocked,
    myPersonalLocked: Boolean(myPersonal),
    myPredictionLocked: Boolean(myPrediction),
    // Secrets only after reveal
    partnerPersonal: showSecrets && partner ? room.personal[partner.id] || null : null,
    partnerPrediction: showSecrets && partner ? room.predictions[partner.id] || null : null,
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
    globalCompatibilityPercent:
      room.totals && room.totals.placementsCompared
        ? Math.round(
            (room.totals.matchingPositions / room.totals.placementsCompared) * 100
          )
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
      if (!room) return;
      if (kind !== 'personal' && kind !== 'prediction') return;
      if (!Array.isArray(ranking)) return;
      if (!room.drafts[kind]) room.drafts[kind] = {};
      room.drafts[kind][socket.id] = ranking;
    });

    socket.on('tad-submit-personal', ({ ranking } = {}) => {
      const room = getRoom(ctx, socket);
      if (!room) {
        socket.emit('error-msg', 'Tu n’es plus dans une partie.');
        return;
      }
      const result = lockPersonal(room, socket.id, ranking);
      if (!result.ok) {
        socket.emit('error-msg', result.msg);
        return;
      }
      broadcastRoom(room);
    });

    socket.on('tad-submit-prediction', ({ ranking } = {}) => {
      const room = getRoom(ctx, socket);
      if (!room) {
        socket.emit('error-msg', 'Tu n’es plus dans une partie.');
        return;
      }
      const result = lockPrediction(room, socket.id, ranking);
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
  // exported for tests
  startGame,
  lockPersonal,
  lockPrediction,
  enterReveal,
  validateRanking: require('./score').validateRanking,
  scoreRound: require('./score').scoreRound,
  pickRoundItems,
  sanitizeConfig,
  DEFAULT_CONFIG,
  resetToLobby,
  reclaimPlayer,
  migratePlayerId
};
