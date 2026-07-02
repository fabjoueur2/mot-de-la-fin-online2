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
      teamIndex: 0
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
    masterPlayerId: null,
    masterRotation: {},
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

/** Attribue un maître fixe par équipe pour toute la partie (manches 1 + 2). */
function assignTeamMasters(room) {
  if (!room.masterRotation) room.masterRotation = {};
  room.teamMasters = {};
  for (let i = 0; i < room.teams.length; i++) {
    const teamPlayers = getTeamPlayers(room, i);
    if (!teamPlayers.length) continue;
    const idx = room.masterRotation[i] || 0;
    room.teamMasters[i] = teamPlayers[idx % teamPlayers.length].id;
  }
}

/** Fait tourner le maître de chaque équipe — appelé après les 2 manches. */
function rotateTeamMasters(room) {
  if (!room.masterRotation) room.masterRotation = {};
  for (let i = 0; i < room.teams.length; i++) {
    const teamPlayers = getTeamPlayers(room, i);
    if (teamPlayers.length > 1) {
      room.masterRotation[i] = ((room.masterRotation[i] || 0) + 1) % teamPlayers.length;
    }
  }
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
      room.teamMasters[i] = teamPlayers[0].id;
    }
  }
  if (isPlayingPhase(room.phase)) {
    applyCurrentTeamMaster(room);
  }
}

function isPlayingPhase(phase) {
  return phase === 'round1' || phase === 'round2';
}

function timeLeft(room) {
  if (!isPlayingPhase(room.phase)) return 0;
  if (room.timerPaused) return room.timerRemaining;
  if (!room.timerEndAt) return room.settings.timerDuration;
  return Math.max(0, Math.ceil((room.timerEndAt - Date.now()) / 1000));
}

function startRoundTimer(room) {
  room.timerPaused = false;
  room.timerEndAt = Date.now() + room.settings.timerDuration * 1000;
  room.timerRemaining = room.settings.timerDuration;
}

function pauseRoundTimer(room) {
  if (!isPlayingPhase(room.phase) || room.timerPaused) return;
  room.timerRemaining = timeLeft(room);
  room.timerPaused = true;
  room.timerEndAt = null;
}

function resumeRoundTimer(room) {
  if (!isPlayingPhase(room.phase) || !room.timerPaused) return;
  room.timerEndAt = Date.now() + room.timerRemaining * 1000;
  room.timerPaused = false;
}

function resetRoundTimer(room) {
  startRoundTimer(room);
}

function loadNextCard(room) {
  if (timeLeft(room) <= 0) {
    finishRound(room);
    return;
  }
  room.currentCard = pickCard(room);
  room.currentClue = 0;
  room.cardsThisRound++;
  applyCurrentTeamMaster(room);
}

function startRound1(room) {
  room.phase = 'round1';
  room.currentTeamIndex = 0;
  room.cardsThisRound = 0;
  room.usedWords.clear();
  assignTeamMasters(room);
  buildDeck(room);
  startRoundTimer(room);
  loadNextCard(room);
}

function startRound2(room) {
  room.phase = 'round2';
  room.currentTeamIndex = 0;
  room.cardsThisRound = 0;
  buildDeck(room);
  startRoundTimer(room);
  loadNextCard(room);
}

function finishRound(room) {
  room.currentCard = null;
  room.masterPlayerId = null;
  room.timerEndAt = null;
  room.timerPaused = false;
  if (room.phase === 'round1') {
    room.phase = 'transition';
  } else if (room.phase === 'round2') {
    room.phase = 'end';
    rotateTeamMasters(room);
  }
}

function nextTeamIndex(room) {
  if (room.teams.length <= 1) return room.currentTeamIndex;
  return (room.currentTeamIndex + 1) % room.teams.length;
}

function resolveCard(room, points) {
  if (!isPlayingPhase(room.phase) || timeLeft(room) <= 0) return false;
  room.teams[room.currentTeamIndex].score += points;
  room.currentTeamIndex = nextTeamIndex(room);
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
      isYou: p.id === viewerSocketId,
      isMaster: playing && p.id === (room.teamMasters?.[p.teamIndex] ?? null)
    })),
    teams: room.teams,
    settings: room.settings,
    currentTeamIndex: room.currentTeamIndex,
    currentClue: room.currentClue,
    cardsThisRound: room.cardsThisRound,
    timeLeft: timeLeft(room),
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
        finishRound(room);
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
        teamIndex: 0
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
    broadcastRoom(room);
  });

  socket.on('assign-player-team', ({ playerId, teamIndex }) => {
    const room = rooms.get(socketToRoom.get(socket.id));
    if (!room || !isHost(room, socket.id) || room.phase !== 'lobby') return;
    const target = room.players.find(p => p.id === playerId);
    if (!target) return;
    target.teamIndex = Math.min(room.teams.length - 1, Math.max(0, parseInt(teamIndex) || 0));
    broadcastRoom(room);
  });

  socket.on('start-game', () => {
    const room = rooms.get(socketToRoom.get(socket.id));
    if (!room || !isHost(room, socket.id) || room.phase !== 'lobby') return;
    if (room.players.length < 1) return;
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
    room.phase = 'lobby';
    room.currentCard = null;
    room.masterPlayerId = null;
    room.teamMasters = {};
    room.teams.forEach(t => { t.score = 0; });
    room.timerEndAt = null;
    broadcastRoom(room);
  });

  socket.on('disconnect', () => leaveRoom(socket));
});

server.listen(PORT, () => {
  console.log(`Mot de la fin — serveur sur le port ${PORT}`);
});
