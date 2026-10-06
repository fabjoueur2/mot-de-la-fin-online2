/**
 * WatchOut — déduction sociale sur vidéos YouTube.
 * Le serveur est la seule autorité : mainVideo / impostorVideo / impostorPlayerId.
 */
'use strict';

const { pickPair, listCategories, isYoutubeConfigured } = require('./youtube');

const GAME_ID = 'watchout';
const MIN_PLAYERS = 3;
const MAX_PLAYERS = 12;
const VALID_ROUNDS = [3, 5, 7, 10];
const VALID_DISCUSSION = [45, 60, 90, 120];
const VALID_VOTE = [20, 30, 45];
const VALID_MAX_VIDEO = [30, 45, 60, 90];
const VALID_DIFFICULTY = ['easy', 'normal', 'hard', 'any'];
const CATEGORIES = listCategories();

const DEFAULT_SETTINGS = {
  roundCount: 5,
  maxVideoSec: 60,
  categories: [...CATEGORIES],
  discussionSec: 90,
  voteSec: 30,
  difficulty: 'normal',
  /** true = écran rôle au début ; false = rôle secret jusqu’au reveal */
  showRoleAtStart: true
};

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function createInitialRoomState({ hostSocketId, playerName, code }) {
  return {
    gameId: GAME_ID,
    code,
    hostId: hostSocketId,
    players: [
      {
        id: hostSocketId,
        name: String(playerName || 'Joueur').slice(0, 20),
        score: 0
      }
    ],
    settings: {
      roundCount: DEFAULT_SETTINGS.roundCount,
      maxVideoSec: DEFAULT_SETTINGS.maxVideoSec,
      categories: [...DEFAULT_SETTINGS.categories],
      discussionSec: DEFAULT_SETTINGS.discussionSec,
      voteSec: DEFAULT_SETTINGS.voteSec,
      difficulty: DEFAULT_SETTINGS.difficulty,
      showRoleAtStart: DEFAULT_SETTINGS.showRoleAtStart
    },
    phase: 'lobby',
    currentRound: 0,
    usedPairIds: [],
    usedVideoIds: [],
    impostorHistory: [],
    /** @type {null | object} secrets de manche — jamais exposés tels quels */
    roundSecret: null,
    phaseEndsAt: null,
    chat: [],
    votes: {},
    tieCandidates: null,
    roundResults: null,
    lastRoundResults: null,
    ranking: []
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

function pickImpostor(room) {
  const hist = room.impostorHistory || [];
  const never = room.players.filter((p) => !hist.includes(p.id));
  const pool = never.length ? never : room.players;
  return shuffle(pool)[0];
}

function watchDurationSec(pair, maxVideoSec) {
  const a = Number(pair.mainVideo.duration) || 30;
  const b = Number(pair.impostorVideo.duration) || 30;
  const cap = Math.min(Number(maxVideoSec) || 60, 90) + 5;
  // Buffer court : on avance aussi dès que tous ont fini (wo-video-ended)
  return Math.max(12, Math.min(Math.max(a, b) + 3, cap));
}

function tryAdvanceWatching(room) {
  if (room.phase !== 'watching') return false;
  const ended = room.videoEnded || {};
  const ids = room.players.map((p) => p.id);
  if (!ids.length) return false;
  const allDone = ids.every((id) => ended[id]);
  const timedOut = room.phaseEndsAt && Date.now() >= room.phaseEndsAt;
  // Dès que tout le monde a fini (min 8s) ou timer écoulé
  const minElapsed =
    !room.watchStartedAt || Date.now() - room.watchStartedAt >= 8000;
  if ((allDone && minElapsed) || timedOut) {
    enterDiscussion(room);
    return true;
  }
  return false;
}

async function beginRound(room) {
  ensureScores(room);
  room.currentRound += 1;
  room.chat = [];
  room.votes = {};
  room.tieCandidates = null;
  room.roundResults = null;
  room.phaseEndsAt = null;

  if (room.currentRound > room.settings.roundCount) {
    room.phase = 'game_over';
    room.roundSecret = null;
    room.ranking = [...room.players]
      .map((p) => ({ id: p.id, name: p.name, score: p.score || 0 }))
      .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));
    return { ok: true };
  }

  const impostor = pickImpostor(room);
  if (!impostor) return { ok: false, msg: 'Pas assez de joueurs.' };

  const cats = Array.isArray(room.settings.categories) ? room.settings.categories : [...CATEGORIES];
  if (!cats.length) {
    return { ok: false, msg: 'Sélectionne au moins une catégorie.' };
  }

  let pair;
  try {
    pair = await pickPair({
      categories: cats,
      difficulty: room.settings.difficulty,
      excludePairIds: room.usedPairIds,
      excludeVideoIds: room.usedVideoIds,
      maxVideoSec: room.settings.maxVideoSec
    });
  } catch (e) {
    console.warn('[watchout] pickPair error:', e.message);
    return { ok: false, msg: 'Impossible de sélectionner des vidéos.' };
  }
  if (!pair) return { ok: false, msg: 'Aucune paire de vidéos pour ces catégories.' };

  // Garde-fou : rejeter une paire hors catégories demandées
  if (cats.length && pair.category && !cats.includes(pair.category)) {
    return { ok: false, msg: 'Aucune paire de vidéos pour ces catégories.' };
  }

  room.usedPairIds = [...(room.usedPairIds || []), pair.pairId];
  room.usedVideoIds = [
    ...(room.usedVideoIds || []),
    pair.mainVideo.youtubeId,
    pair.impostorVideo.youtubeId
  ].filter(Boolean);
  room.impostorHistory = [...(room.impostorHistory || []), impostor.id];
  room.lastPairSource = pair.source || 'bank';
  room.roundSecret = {
    pairId: pair.pairId,
    category: pair.category,
    difficulty: pair.difficulty,
    label: pair.label,
    source: pair.source || 'bank',
    mainVideoId: pair.mainVideo.youtubeId,
    impostorVideoId: pair.impostorVideo.youtubeId,
    mainDuration: pair.mainVideo.duration,
    impostorDuration: pair.impostorVideo.duration,
    watchSec: watchDurationSec(pair, room.settings.maxVideoSec),
    impostorPlayerId: impostor.id
  };

  room.phase = 'role_reveal';
  room.phaseEndsAt =
    Date.now() + (room.settings.showRoleAtStart === false ? 3000 : 5000);
  room.videoEnded = {};
  return { ok: true };
}

function enterWatching(room) {
  if (!room.roundSecret) return;
  room.phase = 'watching';
  room.videoEnded = {};
  room.watchStartedAt = Date.now();
  room.phaseEndsAt = Date.now() + room.roundSecret.watchSec * 1000;
}

function enterDiscussion(room) {
  room.phase = 'discussion';
  const sec = room.settings.discussionSec || DEFAULT_SETTINGS.discussionSec;
  room.phaseEndsAt = Date.now() + sec * 1000;
}

function enterVoting(room) {
  room.phase = 'voting';
  room.votes = {};
  room.tieCandidates = null;
  const sec = room.settings.voteSec || DEFAULT_SETTINGS.voteSec;
  room.phaseEndsAt = Date.now() + sec * 1000;
}

function tallyVotes(room, allowedTargets) {
  const counts = {};
  for (const pid of allowedTargets || room.players.map((p) => p.id)) {
    counts[pid] = 0;
  }
  for (const [voterId, targetId] of Object.entries(room.votes || {})) {
    if (!getPlayer(room, voterId)) continue;
    if (allowedTargets && !allowedTargets.includes(targetId)) continue;
    if (counts[targetId] == null) continue;
    counts[targetId] += 1;
  }
  return counts;
}

function finalizeVotes(room) {
  const secret = room.roundSecret;
  if (!secret) return false;

  const allowed = room.tieCandidates || room.players.map((p) => p.id);
  const counts = tallyVotes(room, allowed);
  const entries = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  const topScore = entries[0]?.[1] || 0;
  const tied = entries.filter(([, c]) => c === topScore && c > 0).map(([id]) => id);

  // Égalité (2+) hors tie-break déjà restreint → défense
  if (tied.length >= 2 && !room.tieCandidates) {
    room.tieCandidates = tied;
    room.phase = 'tie_break';
    room.votes = {};
    room.phaseEndsAt = Date.now() + 30 * 1000;
    return true;
  }

  // Après tie_break ou vainqueur unique
  let accusedId = tied[0] || null;
  if (tied.length >= 2 && room.tieCandidates) {
    // second vote égalité → personne d'accusé clairement ; on prend le premier au hasard parmi tied
    accusedId = shuffle(tied)[0];
  }
  if (!accusedId && entries.length) {
    accusedId = entries[0][0];
  }

  const impostorId = secret.impostorPlayerId;
  const accusedCorrect = accusedId === impostorId;
  const votesOnImpostor = counts[impostorId] || 0;
  const nobodyVotedImpostor = votesOnImpostor === 0;

  const scoreDelta = {};
  room.players.forEach((p) => {
    scoreDelta[p.id] = 0;
  });

  for (const [voterId, targetId] of Object.entries(room.votes || {})) {
    if (targetId === impostorId && voterId !== impostorId) {
      scoreDelta[voterId] += 100;
      const pl = getPlayer(room, voterId);
      if (pl) pl.score = (pl.score || 0) + 100;
    }
  }

  if (accusedCorrect) {
    for (const p of room.players) {
      if (p.id === impostorId) continue;
      scoreDelta[p.id] += 25;
      p.score = (p.score || 0) + 25;
    }
  } else {
    const imp = getPlayer(room, impostorId);
    if (imp) {
      scoreDelta[impostorId] += 150;
      imp.score = (imp.score || 0) + 150;
    }
  }

  if (nobodyVotedImpostor) {
    const imp = getPlayer(room, impostorId);
    if (imp) {
      scoreDelta[impostorId] += 50;
      imp.score = (imp.score || 0) + 50;
    }
  }

  room.roundResults = {
    impostorPlayerId: impostorId,
    impostorName: getPlayer(room, impostorId)?.name || '?',
    accusedPlayerId: accusedId,
    accusedName: getPlayer(room, accusedId)?.name || '?',
    accusedCorrect,
    voteCounts: counts,
    votes: { ...room.votes },
    scoreDelta,
    mainVideoId: secret.mainVideoId,
    impostorVideoId: secret.impostorVideoId,
    pairLabel: secret.label,
    category: secret.category,
    difficulty: secret.difficulty,
    source: secret.source || null
  };
  room.lastRoundResults = room.roundResults;
  room.phase = 'reveal';
  room.phaseEndsAt = Date.now() + 20000;
  return true;
}

function enterScoreboard(room) {
  room.phase = 'scoreboard';
  room.ranking = [...room.players]
    .map((p) => ({ id: p.id, name: p.name, score: p.score || 0 }))
    .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));
  room.phaseEndsAt = Date.now() + 6000;
  room.roundSecret = null;
}

async function advanceAfterScoreboard(room) {
  if (room.currentRound >= room.settings.roundCount) {
    room.phase = 'game_over';
    room.phaseEndsAt = null;
    room.ranking = [...room.players]
      .map((p) => ({ id: p.id, name: p.name, score: p.score || 0 }))
      .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));
    return { ok: true };
  }
  return beginRound(room);
}

function applySettings(room, settings = {}) {
  if (settings.roundCount != null) {
    const n = parseInt(settings.roundCount, 10);
    if (VALID_ROUNDS.includes(n)) room.settings.roundCount = n;
  }
  if (settings.maxVideoSec != null) {
    const n = parseInt(settings.maxVideoSec, 10);
    if (VALID_MAX_VIDEO.includes(n)) room.settings.maxVideoSec = n;
  }
  if (settings.discussionSec != null) {
    const n = parseInt(settings.discussionSec, 10);
    if (VALID_DISCUSSION.includes(n)) room.settings.discussionSec = n;
  }
  if (settings.voteSec != null) {
    const n = parseInt(settings.voteSec, 10);
    if (VALID_VOTE.includes(n)) room.settings.voteSec = n;
  }
  if (settings.difficulty != null && VALID_DIFFICULTY.includes(settings.difficulty)) {
    room.settings.difficulty = settings.difficulty;
  }
  if (settings.showRoleAtStart != null) {
    room.settings.showRoleAtStart = Boolean(settings.showRoleAtStart);
  }
  if (Array.isArray(settings.categories)) {
    const cats = settings.categories.filter((c) => CATEGORIES.includes(c));
    if (cats.length) room.settings.categories = cats;
  }
}

function resetToLobby(room) {
  room.phase = 'lobby';
  room.currentRound = 0;
  room.usedPairIds = [];
  room.usedVideoIds = [];
  room.impostorHistory = [];
  room.roundSecret = null;
  room.phaseEndsAt = null;
  room.chat = [];
  room.votes = {};
  room.tieCandidates = null;
  room.roundResults = null;
  room.players.forEach((p) => {
    p.score = 0;
  });
}

async function startGame(room) {
  if (room.players.length < MIN_PLAYERS) {
    return { ok: false, msg: `Minimum ${MIN_PLAYERS} joueurs.` };
  }
  if (room.players.length > MAX_PLAYERS) {
    return { ok: false, msg: `Maximum ${MAX_PLAYERS} joueurs.` };
  }
  if (!room.settings.categories?.length) {
    return { ok: false, msg: 'Sélectionne au moins une catégorie.' };
  }
  room.usedPairIds = [];
  room.usedVideoIds = [];
  room.impostorHistory = [];
  room.currentRound = 0;
  room.players.forEach((p) => {
    p.score = 0;
  });
  return beginRound(room);
}

function sanitizeRoom(room, socketId) {
  ensureScores(room);
  const me = getPlayer(room, socketId);
  const secret = room.roundSecret;
  const isImpostor = Boolean(secret && secret.impostorPlayerId === socketId);
  const revealPhases = new Set(['reveal', 'scoreboard', 'game_over']);

  let myRole = null;
  let myVideoId = null;
  let myVideoDuration = null;
  const showRoleAtStart = room.settings.showRoleAtStart !== false;
  if (secret && (room.phase === 'role_reveal' || room.phase === 'watching')) {
    // Ne jamais envoyer le rôle si l’hôte a choisi de le cacher
    if (showRoleAtStart) {
      myRole = isImpostor ? 'impostor' : 'crew';
    }
    if (room.phase === 'watching') {
      myVideoId = isImpostor ? secret.impostorVideoId : secret.mainVideoId;
      myVideoDuration = isImpostor ? secret.impostorDuration : secret.mainDuration;
    }
  }

  const ranking = [...room.players]
    .map((p) => ({ id: p.id, name: p.name, score: p.score || 0 }))
    .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));

  const publicResults = revealPhases.has(room.phase) ? room.roundResults : null;

  return {
    gameId: room.gameId,
    code: room.code,
    phase: room.phase,
    isHost: isHost(room, socketId),
    myId: socketId,
    myName: me?.name || '',
    myScore: me?.score || 0,
    myRole,
    myVideoId,
    myVideoDuration,
    pairCategory: secret?.category || publicResults?.category || null,
    pairLabel: secret?.label || publicResults?.pairLabel || null,
    pairSource: secret?.source || publicResults?.source || room.lastPairSource || null,
    youtubeConfigured: isYoutubeConfigured(),
    hostId: room.hostId,
    settings: { ...room.settings },
    players: room.players.map((p) => ({
      id: p.id,
      name: p.name,
      score: p.score || 0,
      isHost: p.id === room.hostId,
      hasVoted: Boolean(room.votes?.[p.id])
    })),
    ranking,
    currentRound: room.currentRound,
    roundCount: room.settings.roundCount,
    phaseEndsAt: room.phaseEndsAt,
    phaseRemainingMs: room.phaseEndsAt ? Math.max(0, room.phaseEndsAt - Date.now()) : null,
    serverNow: Date.now(),
    watchSec: secret?.watchSec || null,
    videoEndedCount: room.phase === 'watching'
      ? Object.keys(room.videoEnded || {}).filter((id) => getPlayer(room, id)).length
      : 0,
    chat: room.phase === 'discussion' || room.phase === 'voting' || room.phase === 'tie_break'
      ? room.chat.slice(-80)
      : [],
    myVote: room.votes?.[socketId] || null,
    tieCandidates: room.tieCandidates,
    roundResults: publicResults,
    lastRoundResults: room.lastRoundResults,
    minPlayers: MIN_PLAYERS,
    maxPlayers: MAX_PLAYERS,
    categoriesAvailable: CATEGORIES,
    difficultiesAvailable: VALID_DIFFICULTY
  };
}

function ensureValidMaster(room) {
  if (!getPlayer(room, room.hostId) && room.players.length) {
    room.hostId = room.players[0].id;
  }
}

function onTick(room) {
  // Watching : timer OU tous les joueurs ont fini leur vidéo
  if (room.phase === 'watching') {
    if (tryAdvanceWatching(room)) return true;
    return false;
  }

  if (!room.phaseEndsAt || Date.now() < room.phaseEndsAt) {
    return false;
  }

  if (room.phase === 'role_reveal') {
    enterWatching(room);
    return true;
  }
  if (room.phase === 'discussion') {
    enterVoting(room);
    return true;
  }
  if (room.phase === 'voting') {
    return finalizeVotes(room);
  }
  if (room.phase === 'tie_break') {
    // Fin du temps de défense → second vote
    room.phase = 'voting';
    room.votes = {};
    room.phaseEndsAt = Date.now() + (room.settings.voteSec || 30) * 1000;
    return true;
  }
  if (room.phase === 'reveal') {
    enterScoreboard(room);
    return true;
  }
  if (room.phase === 'scoreboard') {
    // async advance — handled specially (ne pas annuler le timer tant que pas lancé)
    if (!room._pendingAdvance) {
      room._pendingAdvance = true;
    }
    return false;
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

  // Boucle dédiée aux advances async (scoreboard → next round)
  setInterval(() => {
    for (const room of ctx.rooms.values()) {
      if (room.gameId !== GAME_ID || !room._pendingAdvance) continue;
      if (room._advancing) continue;
      room._advancing = true;
      room._pendingAdvance = false;
      advanceAfterScoreboard(room)
        .then((res) => {
          room._advancing = false;
          if (res && res.ok === false) {
            // Échec sélection vidéos : rester au scoreboard avec bouton hôte
            room.phase = 'scoreboard';
            room.phaseEndsAt = Date.now() + 15000;
            room._pendingAdvance = false;
            broadcastRoom(room);
            return;
          }
          broadcastRoom(room);
        })
        .catch(() => {
          room._advancing = false;
          room.phase = 'scoreboard';
          room.phaseEndsAt = Date.now() + 15000;
          broadcastRoom(room);
        });
    }
  }, 400);

  io.on('connection', (socket) => {
    socket.on('wo-update-settings', (settings = {}) => {
      const room = getRoom(ctx, socket);
      if (!room || !isHost(room, socket.id) || room.phase !== 'lobby') return;
      applySettings(room, settings);
      broadcastRoom(room);
    });

    socket.on('wo-start-game', async (payload = {}) => {
      const room = getRoom(ctx, socket);
      if (!room || !isHost(room, socket.id) || room.phase !== 'lobby') return;
      // Appliquer les réglages du lobby juste avant le lancement (évite course avec update)
      if (payload && typeof payload === 'object') applySettings(room, payload);
      const check = await startGame(room);
      if (!check.ok) {
        socket.emit('error-msg', check.msg);
        return;
      }
      broadcastRoom(room);
    });

    socket.on('wo-chat', ({ text } = {}) => {
      const room = getRoom(ctx, socket);
      if (!room) return;
      if (!['discussion', 'voting', 'tie_break'].includes(room.phase)) return;
      const me = getPlayer(room, socket.id);
      if (!me) return;
      const msg = String(text || '')
        .replace(/[\u0000-\u001F\u007F]/g, '')
        .replace(/[<>]/g, '')
        .trim()
        .slice(0, 240);
      if (!msg) return;
      room.chat.push({
        id: `${Date.now()}_${socket.id}`,
        playerId: socket.id,
        name: me.name,
        text: msg,
        at: Date.now()
      });
      if (room.chat.length > 100) room.chat = room.chat.slice(-100);
      broadcastRoom(room);
    });

    socket.on('wo-vote', ({ targetId } = {}) => {
      const room = getRoom(ctx, socket);
      if (!room || (room.phase !== 'voting' && room.phase !== 'tie_break')) return;
      if (!getPlayer(room, socket.id)) return;
      if (targetId === socket.id) {
        socket.emit('error-msg', 'Impossible de voter pour soi-même.');
        return;
      }
      if (!getPlayer(room, targetId)) return;
      if (room.tieCandidates && !room.tieCandidates.includes(targetId)) {
        socket.emit('error-msg', 'Vote limité aux candidats à égalité.');
        return;
      }
      // En tie_break (défense) on n'enregistre pas encore — vote au passage voting suivant
      if (room.phase === 'tie_break') {
        socket.emit('error-msg', 'Temps de défense — le vote reprend juste après.');
        return;
      }
      room.votes[socket.id] = targetId;

      const voters = room.players.filter((p) => room.votes[p.id]);
      if (voters.length >= room.players.length) {
        finalizeVotes(room);
      }
      broadcastRoom(room);
    });

    socket.on('wo-video-ended', () => {
      const room = getRoom(ctx, socket);
      if (!room || room.phase !== 'watching') return;
      room.videoEnded = room.videoEnded || {};
      room.videoEnded[socket.id] = true;
      if (tryAdvanceWatching(room)) {
        broadcastRoom(room);
      } else {
        broadcastRoom(room);
      }
    });

    socket.on('wo-skip-phase', async () => {
      const room = getRoom(ctx, socket);
      if (!room || !isHost(room, socket.id)) return;
      if (room.phase === 'role_reveal') {
        enterWatching(room);
        broadcastRoom(room);
      } else if (room.phase === 'watching') {
        enterDiscussion(room);
        broadcastRoom(room);
      } else if (room.phase === 'discussion') {
        enterVoting(room);
        broadcastRoom(room);
      } else if (room.phase === 'reveal') {
        enterScoreboard(room);
        broadcastRoom(room);
      } else if (room.phase === 'scoreboard') {
        room._pendingAdvance = true;
        room._advancing = false;
        const res = await advanceAfterScoreboard(room);
        room._pendingAdvance = false;
        if (res && res.ok === false) {
          socket.emit('error-msg', res.msg || 'Impossible de lancer la manche.');
        }
        broadcastRoom(room);
      }
    });

    socket.on('wo-next-round', async () => {
      const room = getRoom(ctx, socket);
      if (!room || !isHost(room, socket.id)) return;
      if (room.phase !== 'reveal' && room.phase !== 'scoreboard') return;
      if (room.phase === 'reveal') enterScoreboard(room);
      await advanceAfterScoreboard(room);
      broadcastRoom(room);
    });

    socket.on('wo-back-to-lobby', () => {
      const room = getRoom(ctx, socket);
      if (!room || !isHost(room, socket.id)) return;
      resetToLobby(room);
      broadcastRoom(room);
    });

    socket.on('wo-rematch', async () => {
      const room = getRoom(ctx, socket);
      if (!room || !isHost(room, socket.id) || room.phase !== 'game_over') return;
      const check = await startGame(room);
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
