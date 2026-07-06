const { pickRandomAnimal } = require('./animals');
const {
  getWorldForDifficulty,
  rebuildWorldFromStack,
  dropAnimalOnWorld,
  stepWorld,
  freezeWorld,
  syncStackFromWorld,
  isBodyFallen
} = require('./physics');

const GAME_ID = 'animal-stacker';
const TEAM_COLORS = ['#4d96ff', '#ff6b6b'];
const VALID_DIFFICULTIES = ['facile', 'normal', 'corse'];
const VALID_ROUNDS_TO_WIN = [1, 3, 5, 7];

const DEFAULT_SETTINGS = {
  difficulty: 'normal',
  roundsToWin: 3
};

function createTeams() {
  return [
    { name: 'Équipe 1', score: 0, color: TEAM_COLORS[0] },
    { name: 'Équipe 2', score: 0, color: TEAM_COLORS[1] }
  ];
}

function createInitialRoomState({ hostSocketId, playerName, code }) {
  return {
    gameId: GAME_ID,
    code,
    hostId: hostSocketId,
    players: [{
      id: hostSocketId,
      name: playerName.slice(0, 20),
      teamIndex: 0
    }],
    teams: createTeams(),
    phase: 'lobby',
    stack: [],
    currentTeamIndex: 0,
    currentAnimal: null,
    aimX: 260,
    aimAngle: 0,
    turnCount: 0,
    usedAnimalIds: [],
    winnerTeamIndex: null,
    loserTeamIndex: null,
    lastDrop: null,
    dropCounter: 0,
    settings: { ...DEFAULT_SETTINGS },
    roundNumber: 0,
    matchOver: false,
    matchWinnerTeamIndex: null
  };
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

function onActiveTeam(room, socketId) {
  const p = getPlayer(room, socketId);
  return p && p.teamIndex === room.currentTeamIndex && room.phase === 'playing';
}

function clearLivePhysics(room) {
  room._liveWorld = null;
  room._physicsFreezeAt = null;
}

function ensureLiveWorld(room) {
  if (room._liveWorld) return room._liveWorld;
  const difficulty = room.settings?.difficulty || 'normal';
  room._liveWorld = rebuildWorldFromStack(room.stack, difficulty, { settle: false });
  return room._liveWorld;
}

function stackFromLiveWorld(room) {
  if (!room._liveWorld) return room.stack.map(p => ({ ...p }));
  return syncStackFromWorld(room._liveWorld).stack;
}

function resolveRoundLoss(room, loserTeamIndex) {
  room.loserTeamIndex = loserTeamIndex;
  room.winnerTeamIndex = loserTeamIndex === 0 ? 1 : 0;
  room.teams[room.winnerTeamIndex].score += 1;
  const roundsToWin = room.settings?.roundsToWin || 1;
  if (room.teams[room.winnerTeamIndex].score >= roundsToWin) {
    room.matchOver = true;
    room.matchWinnerTeamIndex = room.winnerTeamIndex;
  }
  room.phase = 'end';
  room.currentAnimal = null;
  if (room._liveWorld) {
    room.stack = syncStackFromWorld(room._liveWorld).stack;
  }
  clearLivePhysics(room);
}

function pickNextAnimal(room) {
  const animal = pickRandomAnimal(room.usedAnimalIds);
  room.usedAnimalIds.push(animal.id);
  if (room.usedAnimalIds.length >= 80) {
    room.usedAnimalIds = [animal.id];
  }
  room.currentAnimal = { type: animal.id, name: animal.name };
  const world = getWorldForDifficulty(room.settings.difficulty);
  room.aimX = world.platform.x;
  room.aimAngle = 0;
}

function beginRound(room) {
  clearLivePhysics(room);
  room.stack = [];
  room.turnCount = 0;
  room.usedAnimalIds = [];
  room.winnerTeamIndex = null;
  room.loserTeamIndex = null;
  room.lastDrop = null;
  room.currentTeamIndex = room.roundNumber % 2 === 1 ? 0 : 1;
  pickNextAnimal(room);
}

function startGame(room) {
  const t0 = getTeamPlayers(room, 0).length;
  const t1 = getTeamPlayers(room, 1).length;
  if (t0 < 1 || t1 < 1) {
    return { ok: false, msg: 'Il faut au moins un joueur dans chaque équipe.' };
  }
  room.phase = 'playing';
  room.roundNumber = 1;
  room.matchOver = false;
  room.matchWinnerTeamIndex = null;
  room.dropCounter = 0;
  room.teams.forEach(t => { t.score = 0; });
  beginRound(room);
  return { ok: true };
}

function resetToLobby(room) {
  clearLivePhysics(room);
  room.phase = 'lobby';
  room.stack = [];
  room.currentAnimal = null;
  room.currentTeamIndex = 0;
  room.turnCount = 0;
  room.usedAnimalIds = [];
  room.winnerTeamIndex = null;
  room.loserTeamIndex = null;
  room.lastDrop = null;
  room.roundNumber = 0;
  room.matchOver = false;
  room.matchWinnerTeamIndex = null;
  room.dropCounter = 0;
  room.teams.forEach(t => { t.score = 0; });
}

function sanitizeRoom(room, viewerSocketId) {
  const player = getPlayer(room, viewerSocketId);
  const active = onActiveTeam(room, viewerSocketId);
  const world = getWorldForDifficulty(room.settings?.difficulty || 'normal');

  return {
    gameId: room.gameId,
    code: room.code,
    hostId: room.hostId,
    isHost: room.hostId === viewerSocketId,
    phase: room.phase,
    players: room.players.map(p => ({
      id: p.id,
      name: p.name,
      teamIndex: p.teamIndex,
      isYou: p.id === viewerSocketId
    })),
    teams: room.teams,
    stack: room.stack,
    currentTeamIndex: room.currentTeamIndex,
    currentAnimal: room.currentAnimal,
    aimX: room.aimX,
    aimAngle: room.aimAngle,
    turnCount: room.turnCount,
    winnerTeamIndex: room.winnerTeamIndex,
    loserTeamIndex: room.loserTeamIndex,
    lastDrop: room.lastDrop,
    settings: room.settings,
    roundNumber: room.roundNumber,
    matchOver: room.matchOver,
    matchWinnerTeamIndex: room.matchWinnerTeamIndex,
    canControl: active,
    isYourTeamTurn: player && player.teamIndex === room.currentTeamIndex && room.phase === 'playing',
    world,
    stackHeight: room.stack.length
  };
}

function ensureValidTeams(room) {
  room.players.forEach(p => {
    if (p.teamIndex > 1) p.teamIndex = 0;
  });
}

function registerHandlers(io, ctx) {
  const { broadcastRoom } = ctx;

  io.on('connection', (socket) => {
    socket.on('as-update-aim', ({ x, angle }) => {
      const room = getRoom(ctx, socket);
      if (!room || !onActiveTeam(room, socket.id)) return;
      const world = getWorldForDifficulty(room.settings.difficulty);
      if (typeof x === 'number') room.aimX = Math.max(world.minX, Math.min(world.maxX, x));
      if (typeof angle === 'number') room.aimAngle = angle;
      broadcastRoom(room);
    });

    socket.on('as-rotate', ({ direction } = {}) => {
      const room = getRoom(ctx, socket);
      if (!room || !onActiveTeam(room, socket.id)) return;
      const step = Math.PI / 8;
      room.aimAngle += direction === 'left' ? -step : step;
      broadcastRoom(room);
    });

    socket.on('as-drop', () => {
      const room = getRoom(ctx, socket);
      if (!room || room.phase !== 'playing' || !onActiveTeam(room, socket.id)) return;
      if (!room.currentAnimal) return;

      const typeId = room.currentAnimal.type;
      const difficulty = room.settings?.difficulty || 'normal';
      const world = ensureLiveWorld(room);
      const stackBefore = stackFromLiveWorld(room);
      const result = dropAnimalOnWorld(world, typeId, room.aimX, room.aimAngle, difficulty);
      room._liveWorld = result.world;

      room.dropCounter += 1;
      room.lastDrop = {
        id: room.dropCounter,
        type: typeId,
        x: room.aimX,
        angle: room.aimAngle,
        fallen: result.fallen,
        stackBefore
      };

      if (result.fallen) {
        resolveRoundLoss(room, room.currentTeamIndex);
        broadcastRoom(room);
        return;
      }

      room.stack = result.stack;
      room._liveWorld.frozen = false;
      room._physicsFreezeAt = Date.now() + 2000;
      room.turnCount += 1;
      room.currentTeamIndex = room.currentTeamIndex === 0 ? 1 : 0;
      pickNextAnimal(room);
      broadcastRoom(room);
    });

    socket.on('as-start-game', () => {
      const room = getRoom(ctx, socket);
      if (!room || !isHost(room, socket.id) || room.phase !== 'lobby') return;
      const check = startGame(room);
      if (!check.ok) {
        socket.emit('error-msg', check.msg);
        return;
      }
      broadcastRoom(room);
    });

    socket.on('as-next-round', () => {
      const room = getRoom(ctx, socket);
      if (!room || !isHost(room, socket.id) || room.phase !== 'end') return;
      if (room.matchOver) return;
      room.phase = 'playing';
      room.roundNumber += 1;
      beginRound(room);
      broadcastRoom(room);
    });

    socket.on('as-rematch', () => {
      const room = getRoom(ctx, socket);
      if (!room || !isHost(room, socket.id) || room.phase !== 'end' || !room.matchOver) return;
      const check = startGame(room);
      if (!check.ok) {
        socket.emit('error-msg', check.msg);
        return;
      }
      broadcastRoom(room);
    });

    socket.on('as-update-settings', ({ difficulty, roundsToWin }) => {
      const room = getRoom(ctx, socket);
      if (!room || !isHost(room, socket.id) || room.phase !== 'lobby') return;
      if (difficulty && VALID_DIFFICULTIES.includes(difficulty)) {
        room.settings.difficulty = difficulty;
      }
      if (typeof roundsToWin === 'number' && VALID_ROUNDS_TO_WIN.includes(roundsToWin)) {
        room.settings.roundsToWin = roundsToWin;
      }
      broadcastRoom(room);
    });

    socket.on('as-back-to-lobby', () => {
      const room = getRoom(ctx, socket);
      if (!room || !isHost(room, socket.id)) return;
      resetToLobby(room);
      broadcastRoom(room);
    });

    socket.on('as-update-teams', ({ teamNames }) => {
      const room = getRoom(ctx, socket);
      if (!room || !isHost(room, socket.id) || room.phase !== 'lobby') return;
      if (teamNames && Array.isArray(teamNames)) {
        teamNames.forEach((n, i) => {
          if (room.teams[i] && n) room.teams[i].name = String(n).slice(0, 20);
        });
      }
      broadcastRoom(room);
    });

    socket.on('as-set-team', ({ teamIndex }) => {
      const room = getRoom(ctx, socket);
      if (!room || room.phase !== 'lobby') return;
      const player = getPlayer(room, socket.id);
      if (!player) return;
      player.teamIndex = teamIndex === 1 ? 1 : 0;
      broadcastRoom(room);
    });

    socket.on('as-assign-team', ({ playerId, teamIndex }) => {
      const room = getRoom(ctx, socket);
      if (!room || !isHost(room, socket.id) || room.phase !== 'lobby') return;
      const target = room.players.find(p => p.id === playerId);
      if (!target) return;
      target.teamIndex = teamIndex === 1 ? 1 : 0;
      broadcastRoom(room);
    });
  });
}

function getRoom(ctx, socket) {
  const room = ctx.rooms.get(ctx.socketToRoom.get(socket.id));
  if (!room || room.gameId !== GAME_ID) return null;
  return room;
}

function onTick(room) {
  if (room.phase !== 'playing' || !room._liveWorld) return false;

  const world = room._liveWorld;
  const worldCfg = world.worldCfg;
  const prevStack = JSON.stringify(room.stack);

  if (!world.frozen) {
    stepWorld(world, 30);

    if (world.animalBodies.some(b => isBodyFallen(b, worldCfg))) {
      const loserTeamIndex = room.currentTeamIndex === 0 ? 1 : 0;
      room.dropCounter += 1;
      room.lastDrop = {
        id: room.dropCounter,
        type: null,
        x: 0,
        angle: 0,
        fallen: true,
        stackBefore: room.stack.map(p => ({ ...p })),
        collapse: true
      };
      resolveRoundLoss(room, loserTeamIndex);
      return true;
    }
  }

  if (room._physicsFreezeAt && Date.now() >= room._physicsFreezeAt) {
    const frozenStack = freezeWorld(world);
    if (frozenStack) room.stack = frozenStack;
    room._physicsFreezeAt = null;
    return true;
  }

  if (world.frozen) return false;

  const sync = syncStackFromWorld(world);
  room.stack = sync.stack;
  return JSON.stringify(room.stack) !== prevStack;
}

module.exports = {
  id: GAME_ID,
  createInitialRoomState,
  sanitizeRoom,
  ensureValidMaster: ensureValidTeams,
  onTick,
  registerHandlers
};
