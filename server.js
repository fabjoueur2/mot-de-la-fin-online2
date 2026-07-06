const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const { listGames, getGame } = require('./games/registry');
const motDeLaFin = require('./games/mot-de-la-fin');
const animalStacker = require('./games/animal-stacker');

const PORT = process.env.PORT || 3000;
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

/** Moteurs de jeu enregistrés — ajouter ici chaque nouveau jeu */
const gameEngines = {
  [motDeLaFin.id]: motDeLaFin,
  [animalStacker.id]: animalStacker
};

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*' },
  pingTimeout: 60000,
  pingInterval: 25000
});

app.use(express.static(path.join(__dirname, 'public')));

app.get('/api/health', (_, res) => res.json({ ok: true }));
app.get('/api/games', (_, res) => res.json(listGames()));

/** @type {Map<string, object>} */
const rooms = new Map();
/** @type {Map<string, string>} */
const socketToRoom = new Map();

function getEngine(gameId) {
  return gameEngines[gameId] || null;
}

function generateCode() {
  let code;
  do {
    code = Array.from({ length: 6 }, () => CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)]).join('');
  } while (rooms.has(code));
  return code;
}

function broadcastRoom(room) {
  const engine = getEngine(room.gameId);
  if (!engine) return;
  const sockets = io.sockets.adapter.rooms.get(room.code);
  if (!sockets) return;
  for (const socketId of sockets) {
    io.to(socketId).emit('room-state', engine.sanitizeRoom(room, socketId));
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

  const engine = getEngine(room.gameId);
  if (engine?.ensureValidMaster) engine.ensureValidMaster(room);
  broadcastRoom(room);
}

const socketCtx = { rooms, socketToRoom, joinSocketToRoom, leaveRoom, broadcastRoom };
Object.values(gameEngines).forEach(engine => engine.registerHandlers(io, socketCtx));

setInterval(() => {
  for (const room of rooms.values()) {
    const engine = getEngine(room.gameId);
    if (!engine?.onTick) continue;
    const changed = engine.onTick(room);
    if (changed) broadcastRoom(room);
    else if (
      (room.phase === 'round1' || room.phase === 'round2') &&
      !room.awaitingMasterStart &&
      !room.timerPaused &&
      room.timerEndAt
    ) {
      broadcastRoom(room);
    }
  }
}, 500);

io.on('connection', (socket) => {
  socket.on('create-room', ({ playerName, gameId }) => {
    const id = gameId || 'mot-de-la-fin';
    const meta = getGame(id);
    const engine = getEngine(id);
    if (!meta || meta.status !== 'available' || !engine) {
      socket.emit('error-msg', 'Jeu introuvable ou indisponible.');
      return;
    }
    const name = (playerName || 'Joueur').trim().slice(0, 20) || 'Joueur';
    const code = generateCode();
    const room = engine.createInitialRoomState({
      hostSocketId: socket.id,
      playerName: name,
      code
    });
    rooms.set(code, room);
    joinSocketToRoom(socket, room);
    socket.emit('room-state', engine.sanitizeRoom(room, socket.id));
  });

  socket.on('join-room', ({ code, playerName, gameId }) => {
    const roomCode = (code || '').toUpperCase().trim();
    const room = rooms.get(roomCode);
    if (!room) {
      socket.emit('error-msg', 'Salle introuvable. Vérifiez le code.');
      return;
    }
    if (gameId && room.gameId !== gameId) {
      const gameMeta = getGame(room.gameId);
      socket.emit('error-msg', `Cette salle est pour « ${gameMeta?.name || 'un autre jeu'} ».`);
      return;
    }
    if (room.phase !== 'lobby') {
      socket.emit('error-msg', 'La partie a déjà commencé.');
      return;
    }
    const engine = getEngine(room.gameId);
    if (!engine) return;

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

  socket.on('leave-room', () => {
    leaveRoom(socket);
    socket.emit('left-room');
  });

  socket.on('disconnect', () => leaveRoom(socket));
});

server.listen(PORT, () => {
  console.log(`Plateforme jeux — port ${PORT} (${Object.keys(gameEngines).length} jeu(x))`);
});
