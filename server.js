const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const fs = require('fs');

const PORT = process.env.PORT || 3000;
const MOTS = JSON.parse(fs.readFileSync(path.join(__dirname, 'mots.json'), 'utf8'));

const TEAM_COLORS = ['#ff6b6b', '#4d96ff', '#6bcb77', '#ffd93d', '#c77dff', '#ff9f43', '#00cec9', '#fd79a8'];
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*' },
  pingTimeout: 60000,
  pingInterval: 25000
});

app.use(express.static(path.join(__dirname, 'public')));
app.get('/api/health', (_, res) => res.json({ ok: true }));

/** @type {Map<string, object>} */
const rooms = new Map();
/** @type {Map<string, string>} socketId -> roomCode */
const socketToRoom = new Map();

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function generateCode() {
  let code;
  do {
    code = Array.from({ length: 6 }, () => CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)]).join('');
  } while (rooms.has(code));
  return code;
}

function getWordPool(difficulty) {
  if (difficulty === 'mixte') {
    return ['facile', 'moyen', 'difficile'].flatMap(d =>
      MOTS[d].map(c => ({ ...c, difficulty: d }))
    );
  }
  return MOTS[difficulty].map(c => ({ ...c, difficulty }));
}

function buildDeck(room) {
  let pool = getWordPool(room.settings.difficulty).filter(
    c => !room.usedWords.has(c.mot.toLowerCase())
  );
  if (pool.length < 5) {
    room.usedWords.clear();
    pool = getWordPool(room.settings.difficulty);
  }
  room.deck = shuffle(pool);
  room.deckIndex = 0;
}

function pickCard(room) {
  if (!room.deck.length || room.deckIndex >= room.deck.length) {
    buildDeck(room);
  }
  const card = room.deck[room.deckIndex++];
  room.usedWords.add(card.mot.toLowerCase());
  return card;
}

function createTeams(count) {
  return Array.from({ length: count }, (_, i) => ({
    name: `Équipe ${i + 1}`,
    score: 0,
    color: TEAM_COLORS[i % TEAM_COLORS.length]
  }));
}

function createRoom(hostSocketId, playerName) {
  const code = generateCode();
  const playerId = hostSocketId;
  const room = {
    code,
    hostId: hostSocketId,
    players: [{
      id: playerId,
      name: playerName.slice(0, 20),
      teamIndex: 0,
      role: 'devineur'
    }],
    teams: createTeams(2),
    settings: {
      timerDuration: 60,
      difficulty: 'mixte',
      teamCount: 2
    },
    phase: 'lobby',
    currentTeamIndex: 0,
    currentCard: null,
    currentClue: 0,
    cardsThisRound: 0,
    usedWords: new Set(),
    deck: [],
    deckIndex: 0,
    timerEndAt: null,
    timerPaused: false,
    timerRemaining: 60,
    teamTimeRemaining: {},
    masterPlayerId: null,
    teamMasters: {}
  };
  rooms.set(code, room);
  return room;
}

function getPlayer(room, socketId) {
  return room.players.find(p => p.id === socketId);
}

function getTeamPlayers(room, teamIndex) {
  return room.players.filter(p => p.teamIndex === teamIndex);
}

function isHost(room, socketId) {
  return room.hostId === socketId;
}

function isMaster(room, socketId) {
  return room.masterPlayerId === socketId;
}

/** Construit les maîtres d'équipe à partir des rôles choisis manuellement. */
function buildTeamMastersFromRoles(room) {
  room.teamMasters = {};
  for (let i = 0; i < room.teams.length; i++) {
    const master = getTeamPlayers(room, i).find(p => p.role === 'maitre');
    if (master) room.teamMasters[i] = master.id;
  }
}

function validateTeamsForStart(room) {
  const activeTeams = new Set(room.players.map(p => p.teamIndex));
  for (const i of activeTeams) {
    const teamPlayers = getTeamPlayers(room, i);
    if (!teamPlayers.length) continue;
    const teamName = room.teams[i]?.name || `Équipe ${i + 1}`;
    const masters = teamPlayers.filter(p => p.role === 'maitre');
    if (masters.length === 0) {
      return { ok: false, msg: `${teamName} : choisissez un Maître avant de lancer.` };
    }
    if (masters.length > 1) {
      return { ok: false, msg: `${teamName} : un seul Maître autorisé.` };
    }
  }
  return { ok: true };
}

function demoteOtherMasters(room, teamIndex, exceptPlayerId) {
  getTeamPlayers(room, teamIndex).forEach(p => {
    if (p.id !== exceptPlayerId && p.role === 'maitre') p.role = 'devineur';
  });
}

function resolveTeamMasterConflict(room, player) {
  if (player.role !== 'maitre') return;
  demoteOtherMasters(room, player.teamIndex, player.id);
}

function applyCurrentTeamMaster(room) {
  room.masterPlayerId = room.teamMasters?.[room.currentTeamIndex] ?? null;
}

function ensureValidMaster(room) {
  if (!room.teamMasters) room.teamMasters = {};
  for (let i = 0; i < room.teams.length; i++) {
    const teamPlayers = getTeamPlayers(room, i);
    if (!teamPlayers.length) {
      delete room.teamMasters[i];
      continue;
    }
    const currentId = room.teamMasters[i];
    const stillValid = currentId && teamPlayers.some(p => p.id === currentId);
    if (!stillValid) {
      const maitre = teamPlayers.find(p => p.role === 'maitre');
      if (maitre) {
        room.teamMasters[i] = maitre.id;
      } else if (isPlayingPhase(room.phase) && teamPlayers.length > 0) {
        teamPlayers.forEach(p => { p.role = 'devineur'; });
        teamPlayers[0].role = 'maitre';
        room.teamMasters[i] = teamPlayers[0].id;
      } else {
        delete room.teamMasters[i];
      }
    }
  }
  if (isPlayingPhase(room.phase)) {
    applyCurrentTeamMaster(room);
  }
}

function isPlayingPhase(phase) {
  return phase === 'round1' || phase === 'round2';
}

function initTeamTimers(room) {
  room.teamTimeRemaining = {};
  for (let i = 0; i < room.teams.length; i++) {
    room.teamTimeRemaining[i] = room.settings.timerDuration;
  }
}

function getTeamTimeLeft(room, teamIndex) {
  if (!isPlayingPhase(room.phase)) {
    return room.teamTimeRemaining?.[teamIndex] ?? 0;
  }
  if (
    teamIndex === room.currentTeamIndex &&
    room.timerEndAt &&
    !room.timerPaused
  ) {
    return Math.max(0, Math.ceil((room.timerEndAt - Date.now()) / 1000));
  }
  return room.teamTimeRemaining?.[teamIndex] ?? 0;
}

function saveCurrentTeamTime(room) {
  if (!isPlayingPhase(room.phase)) return;
  const idx = room.currentTeamIndex;
  if (room.timerPaused) {
    room.teamTimeRemaining[idx] = room.timerRemaining;
    return;
  }
  if (room.timerEndAt) {
    room.teamTimeRemaining[idx] = Math.max(
      0,
      Math.ceil((room.timerEndAt - Date.now()) / 1000)
    );
  }
}

function startTeamTimer(room, teamIndex) {
  const remaining = room.teamTimeRemaining[teamIndex] ?? room.settings.timerDuration;
  if (remaining <= 0) return false;
  room.timerPaused = false;
  room.timerEndAt = Date.now() + remaining * 1000;
  room.timerRemaining = remaining;
  return true;
}

function timeLeft(room) {
  return getTeamTimeLeft(room, room.currentTeamIndex);
}

function getAllTeamTimers(room) {
  return room.teams.map((_, i) => getTeamTimeLeft(room, i));
}

function teamHasActivePlayers(room, teamIndex) {
  return getTeamPlayers(room, teamIndex).length > 0;
}

function advanceToNextTeam(room) {
  saveCurrentTeamTime(room);
  room.timerEndAt = null;
  const start = room.currentTeamIndex;
  let next = nextTeamIndex(room);
  for (let i = 0; i < room.teams.length; i++) {
    const rem = room.teamTimeRemaining[next] ?? 0;
    if (rem > 0 && teamHasActivePlayers(room, next)) {
      room.currentTeamIndex = next;
      startTeamTimer(room, next);
      applyCurrentTeamMaster(room);
      return true;
    }
    next = (next + 1) % room.teams.length;
    if (next === start) break;
  }
  return false;
}

function findFirstTeamWithTime(room, fromIndex = 0) {
  for (let i = 0; i < room.teams.length; i++) {
    const idx = (fromIndex + i) % room.teams.length;
    if ((room.teamTimeRemaining[idx] ?? 0) > 0 && teamHasActivePlayers(room, idx)) {
      return idx;
    }
  }
  return fromIndex;
}

function pauseRoundTimer(room) {
  if (!isPlayingPhase(room.phase) || room.timerPaused) return;
  room.timerRemaining = timeLeft(room);
  room.teamTimeRemaining[room.currentTeamIndex] = room.timerRemaining;
  room.timerPaused = true;
  room.timerEndAt = null;
}

function resumeRoundTimer(room) {
  if (!isPlayingPhase(room.phase) || !room.timerPaused) return;
  startTeamTimer(room, room.currentTeamIndex);
}

function resetRoundTimer(room) {
  room.teamTimeRemaining[room.currentTeamIndex] = room.settings.timerDuration;
  startTeamTimer(room, room.currentTeamIndex);
}

function onCurrentTeamTimeExpired(room) {
  saveCurrentTeamTime(room);
  room.teamTimeRemaining[room.currentTeamIndex] = 0;
  room.timerEndAt = null;
  if (!advanceToNextTeam(room)) {
    finishRound(room);
    return true;
  }
  loadNextCard(room);
  return true;
}

function loadNextCard(room) {
  if (getTeamTimeLeft(room, room.currentTeamIndex) <= 0) {
    if (onCurrentTeamTimeExpired(room)) return;
  }
  room.currentCard = pickCard(room);
  room.currentClue = 0;
  room.cardsThisRound++;
  applyCurrentTeamMaster(room);
}

function beginRound(room) {
  initTeamTimers(room);
  room.cardsThisRound = 0;
  room.currentTeamIndex = findFirstTeamWithTime(room, 0);
  startTeamTimer(room, room.currentTeamIndex);
  loadNextCard(room);
}

function startRound1(room) {
  room.phase = 'round1';
  room.usedWords.clear();
  buildTeamMastersFromRoles(room);
  buildDeck(room);
  beginRound(room);
}

function startRound2(room) {
  room.phase = 'round2';
  buildDeck(room);
  beginRound(room);
}

function resetToLobby(room) {
  room.phase = 'lobby';
  room.currentCard = null;
  room.masterPlayerId = null;
  room.teamMasters = {};
  room.currentTeamIndex = 0;
  room.currentClue = 0;
  room.cardsThisRound = 0;
  room.timerEndAt = null;
  room.timerPaused = false;
  room.teamTimeRemaining = {};
  room.usedWords.clear();
  room.deck = [];
  room.deckIndex = 0;
  room.teams.forEach(t => { t.score = 0; });
}

function finishRound(room) {
  saveCurrentTeamTime(room);
  room.currentCard = null;
  room.masterPlayerId = null;
  room.timerEndAt = null;
  room.timerPaused = false;
  if (room.phase === 'round1') {
    room.phase = 'transition';
  } else if (room.phase === 'round2') {
    room.phase = 'end';
  }
}

function nextTeamIndex(room) {
  if (room.teams.length <= 1) return room.currentTeamIndex;
  return (room.currentTeamIndex + 1) % room.teams.length;
}

function resolveCard(room, points) {
  if (!isPlayingPhase(room.phase)) return false;
  if (getTeamTimeLeft(room, room.currentTeamIndex) <= 0) return false;
  room.teams[room.currentTeamIndex].score += points;
  saveCurrentTeamTime(room);
  room.timerEndAt = null;
  if (!advanceToNextTeam(room)) {
    finishRound(room);
    return true;
  }
  loadNextCard(room);
  return true;
}

function sanitizeRoom(room, viewerSocketId) {
  const player = getPlayer(room, viewerSocketId);
  const onActiveTeam = player && player.teamIndex === room.currentTeamIndex;
  const playing = isPlayingPhase(room.phase);
  const viewerIsMaster = playing && player && player.id === room.masterPlayerId;
  const showCard = viewerIsMaster && room.currentCard;

  const teamPlayers = playing ? getTeamPlayers(room, room.currentTeamIndex) : [];
  const masterPlayer = room.players.find(p => p.id === room.masterPlayerId);
  const guessers = teamPlayers.filter(p => p.id !== room.masterPlayerId);

  let role = 'spectator';
  if (playing && onActiveTeam) {
    role = viewerIsMaster ? 'maitre' : 'devineur';
  }

  return {
    code: room.code,
    hostId: room.hostId,
    isHost: room.hostId === viewerSocketId,
    phase: room.phase,
    players: room.players.map(p => ({
      id: p.id,
      name: p.name,
      teamIndex: p.teamIndex,
      role: p.role || 'devineur',
      isYou: p.id === viewerSocketId,
      isTeamMaster: p.role === 'maitre'
    })),
    teams: room.teams,
    settings: room.settings,
    currentTeamIndex: room.currentTeamIndex,
    currentClue: room.currentClue,
    cardsThisRound: room.cardsThisRound,
    timeLeft: timeLeft(room),
    teamTimers: getAllTeamTimers(room),
    timerPaused: room.timerPaused,
    card: showCard ? {
      mot: room.currentCard.mot,
      interdits: room.currentCard.interdits,
      difficulty: room.currentCard.difficulty
    } : null,
    role,
    isMaster: viewerIsMaster,
    isGuesser: playing && onActiveTeam && !viewerIsMaster,
    isYourTeamTurn: onActiveTeam,
    masterName: masterPlayer?.name || null,
    guesserNames: guessers.map(p => p.name),
    soloTeam: playing && teamPlayers.length === 1,
    round: room.phase === 'round2' || room.phase === 'end' ? 2 : room.phase === 'round1' ? 1 : 0
  };
}

function broadcastRoom(room) {
  const sockets = io.sockets.adapter.rooms.get(room.code);
  if (!sockets) return;
  for (const socketId of sockets) {
    io.to(socketId).emit('room-state', sanitizeRoom(room, socketId));
  }
}

function joinSocketToRoom(socket, room) {
  socket.join(room.code);
  socketToRoom.set(socket.id, room.code);
}

function leaveRoom(socket) {
  const code = socketToRoom.get(socket.id);
  if (!code) return;
  const room = rooms.get(code);
  if (!room) {
    socketToRoom.delete(socket.id);
    return;
  }

  room.players = room.players.filter(p => p.id !== socket.id);
  socket.leave(code);
  socketToRoom.delete(socket.id);

  if (room.players.length === 0) {
    rooms.delete(code);
    return;
  }

  if (room.hostId === socket.id) {
    room.hostId = room.players[0].id;
  }

  ensureValidMaster(room);
  broadcastRoom(room);
}

setInterval(() => {
  for (const room of rooms.values()) {
    if (isPlayingPhase(room.phase) && !room.timerPaused && room.timerEndAt) {
      if (timeLeft(room) <= 0) {
        onCurrentTeamTimeExpired(room);
      }
      broadcastRoom(room);
    }
  }
}, 500);

io.on('connection', (socket) => {
  socket.on('create-room', ({ playerName }) => {
    const name = (playerName || 'Joueur').trim().slice(0, 20) || 'Joueur';
    const room = createRoom(socket.id, name);
    joinSocketToRoom(socket, room);
    socket.emit('room-state', sanitizeRoom(room, socket.id));
  });

  socket.on('join-room', ({ code, playerName }) => {
    const roomCode = (code || '').toUpperCase().trim();
    const room = rooms.get(roomCode);
    if (!room) {
      socket.emit('error-msg', 'Salle introuvable. Vérifiez le code.');
      return;
    }
    if (room.phase !== 'lobby') {
      socket.emit('error-msg', 'La partie a déjà commencé.');
      return;
    }
    const name = (playerName || 'Joueur').trim().slice(0, 20) || 'Joueur';
    const existing = room.players.find(p => p.id === socket.id);
    if (!existing) {
      room.players.push({
        id: socket.id,
        name,
        teamIndex: 0,
        role: 'devineur'
      });
    } else {
      existing.name = name;
    }
    joinSocketToRoom(socket, room);
    broadcastRoom(room);
  });

  socket.on('update-settings', (settings) => {
    const room = rooms.get(socketToRoom.get(socket.id));
    if (!room || !isHost(room, socket.id) || room.phase !== 'lobby') return;

    const teamCount = Math.min(8, Math.max(1, parseInt(settings.teamCount) || 2));
    const timerDuration = Math.min(180, Math.max(15, parseInt(settings.timerDuration) || 60));
    const difficulty = ['mixte', 'facile', 'moyen', 'difficile'].includes(settings.difficulty)
      ? settings.difficulty : 'mixte';

    room.settings.teamCount = teamCount;
    room.settings.timerDuration = timerDuration;
    room.settings.difficulty = difficulty;

    if (room.teams.length !== teamCount) {
      const oldScores = room.teams.map(t => t.score);
      room.teams = createTeams(teamCount);
      room.teams.forEach((t, i) => { if (oldScores[i]) t.score = oldScores[i]; });
      room.players.forEach(p => {
        if (p.teamIndex >= teamCount) p.teamIndex = 0;
      });
    }

    if (settings.teamNames && Array.isArray(settings.teamNames)) {
      settings.teamNames.forEach((n, i) => {
        if (room.teams[i] && n) room.teams[i].name = String(n).slice(0, 20);
      });
    }

    broadcastRoom(room);
  });

  socket.on('set-team', ({ teamIndex }) => {
    const room = rooms.get(socketToRoom.get(socket.id));
    if (!room || room.phase !== 'lobby') return;
    const player = getPlayer(room, socket.id);
    if (!player) return;
    const idx = Math.min(room.teams.length - 1, Math.max(0, parseInt(teamIndex) || 0));
    player.teamIndex = idx;
    resolveTeamMasterConflict(room, player);
    broadcastRoom(room);
  });

  socket.on('set-role', ({ role }) => {
    const room = rooms.get(socketToRoom.get(socket.id));
    if (!room || room.phase !== 'lobby') return;
    if (role !== 'maitre' && role !== 'devineur') return;
    const player = getPlayer(room, socket.id);
    if (!player) return;
    player.role = role;
    if (role === 'maitre') demoteOtherMasters(room, player.teamIndex, player.id);
    broadcastRoom(room);
  });

  socket.on('assign-player-team', ({ playerId, teamIndex }) => {
    const room = rooms.get(socketToRoom.get(socket.id));
    if (!room || !isHost(room, socket.id) || room.phase !== 'lobby') return;
    const target = room.players.find(p => p.id === playerId);
    if (!target) return;
    target.teamIndex = Math.min(room.teams.length - 1, Math.max(0, parseInt(teamIndex) || 0));
    resolveTeamMasterConflict(room, target);
    broadcastRoom(room);
  });

  socket.on('start-game', () => {
    const room = rooms.get(socketToRoom.get(socket.id));
    if (!room || !isHost(room, socket.id) || room.phase !== 'lobby') return;
    if (room.players.length < 1) return;
    const check = validateTeamsForStart(room);
    if (!check.ok) {
      socket.emit('error-msg', check.msg);
      return;
    }
    buildTeamMastersFromRoles(room);
    startRound1(room);
    broadcastRoom(room);
  });

  socket.on('start-round2', () => {
    const room = rooms.get(socketToRoom.get(socket.id));
    if (!room || !isHost(room, socket.id) || room.phase !== 'transition') return;
    startRound2(room);
    broadcastRoom(room);
  });

  socket.on('clue-given', () => {
    const room = rooms.get(socketToRoom.get(socket.id));
    if (!room || room.phase !== 'round1') return;
    if (!isMaster(room, socket.id)) return;
    if (room.currentClue < 3) room.currentClue++;
    broadcastRoom(room);
  });

  socket.on('card-found', () => {
    const room = rooms.get(socketToRoom.get(socket.id));
    if (!room || !isPlayingPhase(room.phase)) return;
    if (!isMaster(room, socket.id)) return;

    let pts = 0;
    if (room.phase === 'round1') {
      pts = room.currentClue === 0 ? 3 : room.currentClue === 1 ? 2 : 1;
    } else {
      pts = 2;
    }
    resolveCard(room, pts);
    broadcastRoom(room);
  });

  socket.on('card-fail', () => {
    const room = rooms.get(socketToRoom.get(socket.id));
    if (!room || !isPlayingPhase(room.phase)) return;
    if (!isMaster(room, socket.id)) return;
    resolveCard(room, 0);
    broadcastRoom(room);
  });

  socket.on('pause-timer', () => {
    const room = rooms.get(socketToRoom.get(socket.id));
    if (!room || !isHost(room, socket.id)) return;
    if (room.timerPaused) resumeRoundTimer(room);
    else pauseRoundTimer(room);
    broadcastRoom(room);
  });

  socket.on('reset-timer', () => {
    const room = rooms.get(socketToRoom.get(socket.id));
    if (!room || !isHost(room, socket.id) || !isPlayingPhase(room.phase)) return;
    resetRoundTimer(room);
    broadcastRoom(room);
  });

  socket.on('back-to-lobby', () => {
    const room = rooms.get(socketToRoom.get(socket.id));
    if (!room || !isHost(room, socket.id)) return;
    resetToLobby(room);
    broadcastRoom(room);
  });

  socket.on('leave-room', () => {
    leaveRoom(socket);
    socket.emit('left-room');
  });

  socket.on('disconnect', () => leaveRoom(socket));
});

server.listen(PORT, () => {
  console.log(`Mot de la fin — serveur sur le port ${PORT}`);
});
