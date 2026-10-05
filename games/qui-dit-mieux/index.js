const path = require('path');
const fs = require('fs');

const GAME_ID = 'qui-dit-mieux';
const DEFIS = JSON.parse(fs.readFileSync(path.join(__dirname, 'defis.json'), 'utf8'));

const DEFAULT_SETTINGS = {
  bidDurationSec: 30,
  roundCount: 8
};

const MIN_PLAYERS = 3;
const MAX_BID_DURATION = 120;
const MIN_BID_DURATION = 10;
const MAX_ROUNDS = 20;
const MIN_ROUNDS = 3;

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
    players: [{
      id: hostSocketId,
      name: String(playerName || 'Joueur').slice(0, 20),
      teamIndex: 0,
      role: 'devineur',
      score: 0
    }],
    settings: { ...DEFAULT_SETTINGS },
    phase: 'lobby',
    currentRound: 0,
    openerId: hostSocketId,
    lastSuccessId: null,
    challenge: null,
    currentBid: 0,
    currentBidderId: null,
    bids: [],
    votes: {},
    auctionEndsAt: null,
    usedChallengeIds: [],
    deck: [],
    lastResult: null
  };
}

function getPlayer(room, socketId) {
  return room.players.find((p) => p.id === socketId);
}

function isHost(room, socketId) {
  return room.hostId === socketId;
}

function ensurePlayerScores(room) {
  room.players.forEach((p) => {
    if (typeof p.score !== 'number') p.score = 0;
  });
}

function playerName(room, id) {
  return getPlayer(room, id)?.name || 'Joueur';
}

function buildDeck(room) {
  const used = new Set(room.usedChallengeIds || []);
  let pool = DEFIS.filter((d) => !used.has(d.id));
  if (pool.length < 3) {
    room.usedChallengeIds = [];
    pool = [...DEFIS];
  }
  room.deck = shuffle(pool);
}

function pickChallenge(room) {
  if (!room.deck?.length) buildDeck(room);
  const next = room.deck.shift();
  if (!next) return null;
  room.usedChallengeIds = [...(room.usedChallengeIds || []), next.id];
  return { id: next.id, texte: next.texte, unite: next.unite };
}

function clearRoundTransient(room) {
  room.challenge = null;
  room.currentBid = 0;
  room.currentBidderId = null;
  room.bids = [];
  room.votes = {};
  room.auctionEndsAt = null;
}

function startBiddingRound(room) {
  ensurePlayerScores(room);
  room.currentRound += 1;
  clearRoundTransient(room);

  if (!room.openerId || !getPlayer(room, room.openerId)) {
    room.openerId = room.hostId;
  }

  const challenge = pickChallenge(room);
  if (!challenge) {
    room.phase = 'end';
    return;
  }

  room.challenge = challenge;
  room.phase = 'bidding';
  const duration = Math.min(
    MAX_BID_DURATION,
    Math.max(MIN_BID_DURATION, parseInt(room.settings.bidDurationSec, 10) || DEFAULT_SETTINGS.bidDurationSec)
  );
  room.settings.bidDurationSec = duration;
  room.auctionEndsAt = Date.now() + duration * 1000;
}

function beginAction(room) {
  if (room.phase !== 'bidding') return false;
  if (!room.currentBidderId || room.currentBid < 1) {
    // Aucune enchère → défausse et même ouvreur, nouvelle manche (compte quand même)
    if (room.currentRound >= room.settings.roundCount) {
      room.phase = 'end';
      room.auctionEndsAt = null;
      return true;
    }
    startBiddingRound(room);
    return true;
  }
  room.phase = 'action';
  room.auctionEndsAt = null;
  room.votes = {};
  return true;
}

function eligibleVoters(room) {
  return room.players.filter((p) => p.id !== room.currentBidderId);
}

function voteTally(room) {
  const voters = eligibleVoters(room);
  let yes = 0;
  let no = 0;
  let pending = 0;
  for (const v of voters) {
    if (room.votes[v.id] === true) yes += 1;
    else if (room.votes[v.id] === false) no += 1;
    else pending += 1;
  }
  return { yes, no, pending, total: voters.length };
}

/** Majorité stricte de oui parmi les votants éligibles. Égalité = échec. */
function isSuccessFromVotes(tally) {
  return tally.yes > tally.total / 2;
}

function canResolveEarly(tally) {
  if (tally.pending === 0) return true;
  // Majorité déjà mathématiquement acquise (ou impossible)
  const remaining = tally.pending;
  if (tally.yes > tally.total / 2) return true;
  if (tally.yes + remaining <= tally.total / 2) return true;
  return false;
}

function applyRoundResult(room, success) {
  ensurePlayerScores(room);
  const n = room.players.length;
  const challengerId = room.currentBidderId;
  const bid = room.currentBid;
  const challenge = room.challenge;

  if (success) {
    const challenger = getPlayer(room, challengerId);
    if (challenger) challenger.score += n;
    room.lastSuccessId = challengerId;
    room.openerId = challengerId;
  } else {
    room.players.forEach((p) => {
      if (p.id !== challengerId) p.score += 1;
    });
    // Ouvreur suivant inchangé si échec (reste le précédent succès, ou hôte)
    if (!room.lastSuccessId || !getPlayer(room, room.lastSuccessId)) {
      room.openerId = room.hostId;
    } else {
      room.openerId = room.lastSuccessId;
    }
  }

  room.lastResult = {
    success,
    challengerId,
    challengerName: playerName(room, challengerId),
    bid,
    pointsAwarded: success ? n : 1,
    challenge
  };

  if (room.currentRound >= room.settings.roundCount) {
    room.phase = 'end';
    room.auctionEndsAt = null;
    return;
  }

  startBiddingRound(room);
}

function resolveVotes(room) {
  const tally = voteTally(room);
  const success = isSuccessFromVotes(tally);
  applyRoundResult(room, success);
}

function resetToLobby(room) {
  room.phase = 'lobby';
  room.currentRound = 0;
  room.openerId = room.hostId;
  room.lastSuccessId = null;
  room.deck = [];
  room.usedChallengeIds = [];
  clearRoundTransient(room);
  room.players.forEach((p) => { p.score = 0; });
}

function startGame(room) {
  ensurePlayerScores(room);
  if (room.players.length < MIN_PLAYERS) {
    return { ok: false, msg: `Il faut au moins ${MIN_PLAYERS} joueurs pour lancer.` };
  }
  room.players.forEach((p) => { p.score = 0; });
  room.currentRound = 0;
  room.lastSuccessId = null;
  room.openerId = room.hostId;
  room.usedChallengeIds = [];
  room.deck = [];
  room.lastResult = null;
  buildDeck(room);
  startBiddingRound(room);
  return { ok: true };
}

function sanitizeRoom(room, socketId) {
  ensurePlayerScores(room);
  const me = getPlayer(room, socketId);
  const tally = room.phase === 'voting' ? voteTally(room) : null;
  const ranked = [...room.players]
    .map((p) => ({ id: p.id, name: p.name, score: p.score || 0 }))
    .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));

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
      isHost: p.id === room.hostId,
      isOpener: p.id === room.openerId,
      isChallenger: p.id === room.currentBidderId
    })),
    ranking: ranked,
    currentRound: room.currentRound,
    roundCount: room.settings.roundCount,
    openerId: room.openerId,
    openerName: playerName(room, room.openerId),
    challenge: room.challenge,
    currentBid: room.currentBid,
    currentBidderId: room.currentBidderId,
    currentBidderName: room.currentBidderId ? playerName(room, room.currentBidderId) : null,
    bids: room.bids.map((b) => ({
      playerId: b.playerId,
      name: playerName(room, b.playerId),
      value: b.value
    })),
    auctionEndsAt: room.auctionEndsAt,
    auctionRemainingMs: room.auctionEndsAt
      ? Math.max(0, room.auctionEndsAt - Date.now())
      : null,
    votes: room.phase === 'voting' ? { ...room.votes } : {},
    voteTally: tally,
    canVote: room.phase === 'voting'
      && me
      && me.id !== room.currentBidderId
      && room.votes[me.id] === undefined,
    myVote: me ? room.votes[me.id] : undefined,
    lastResult: room.lastResult,
    minPlayers: MIN_PLAYERS
  };
}

function ensureValidMaster(room) {
  if (!getPlayer(room, room.hostId) && room.players.length) {
    room.hostId = room.players[0].id;
  }
  if (room.openerId && !getPlayer(room, room.openerId)) {
    room.openerId = room.lastSuccessId && getPlayer(room, room.lastSuccessId)
      ? room.lastSuccessId
      : room.hostId;
  }
  if (room.currentBidderId && !getPlayer(room, room.currentBidderId)) {
    // Challenger parti en cours d'action/vote → traiter comme échec et continuer
    if (room.phase === 'action' || room.phase === 'voting') {
      room.currentBidderId = null;
      room.currentBid = 0;
      if (room.currentRound >= room.settings.roundCount) room.phase = 'end';
      else startBiddingRound(room);
    }
  }
}

function onTick(room) {
  if (room.phase !== 'bidding' || room.auctionEndsAt == null) return false;
  if (Date.now() >= room.auctionEndsAt) {
    beginAction(room);
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
    socket.on('qdm-update-settings', (settings = {}) => {
      const room = getRoom(ctx, socket);
      if (!room || !isHost(room, socket.id) || room.phase !== 'lobby') return;

      if (settings.bidDurationSec != null) {
        room.settings.bidDurationSec = Math.min(
          MAX_BID_DURATION,
          Math.max(MIN_BID_DURATION, parseInt(settings.bidDurationSec, 10) || DEFAULT_SETTINGS.bidDurationSec)
        );
      }
      if (settings.roundCount != null) {
        room.settings.roundCount = Math.min(
          MAX_ROUNDS,
          Math.max(MIN_ROUNDS, parseInt(settings.roundCount, 10) || DEFAULT_SETTINGS.roundCount)
        );
      }
      broadcastRoom(room);
    });

    socket.on('qdm-start-game', () => {
      const room = getRoom(ctx, socket);
      if (!room || !isHost(room, socket.id) || room.phase !== 'lobby') return;
      const check = startGame(room);
      if (!check.ok) {
        socket.emit('error-msg', check.msg);
        return;
      }
      broadcastRoom(room);
    });

    socket.on('qdm-place-bid', ({ value } = {}) => {
      const room = getRoom(ctx, socket);
      if (!room || room.phase !== 'bidding') return;
      const player = getPlayer(room, socket.id);
      if (!player) return;

      const bid = parseInt(value, 10);
      if (!Number.isFinite(bid) || bid < 1) {
        socket.emit('error-msg', 'Enchère invalide.');
        return;
      }
      if (bid <= room.currentBid) {
        socket.emit('error-msg', `Il faut surenchérir au-dessus de ${room.currentBid}.`);
        return;
      }
      if (bid > 9999) {
        socket.emit('error-msg', 'Enchère trop élevée.');
        return;
      }

      room.currentBid = bid;
      room.currentBidderId = socket.id;
      room.bids.push({ playerId: socket.id, value: bid, at: Date.now() });
      broadcastRoom(room);
    });

    socket.on('qdm-go-to-vote', () => {
      const room = getRoom(ctx, socket);
      if (!room || room.phase !== 'action') return;
      // Challenger ou hôte peut lancer le vote
      if (socket.id !== room.currentBidderId && !isHost(room, socket.id)) return;
      room.phase = 'voting';
      room.votes = {};
      broadcastRoom(room);
    });

    socket.on('qdm-cast-vote', ({ success } = {}) => {
      const room = getRoom(ctx, socket);
      if (!room || room.phase !== 'voting') return;
      const player = getPlayer(room, socket.id);
      if (!player) return;
      if (socket.id === room.currentBidderId) {
        socket.emit('error-msg', 'Le challenger ne vote pas.');
        return;
      }
      if (room.votes[socket.id] !== undefined) return;

      room.votes[socket.id] = Boolean(success);
      const tally = voteTally(room);
      if (canResolveEarly(tally)) {
        resolveVotes(room);
      }
      broadcastRoom(room);
    });

    socket.on('qdm-host-force-resolve', () => {
      const room = getRoom(ctx, socket);
      if (!room || !isHost(room, socket.id) || room.phase !== 'voting') return;
      // Remplir les non-votants comme « non »
      eligibleVoters(room).forEach((p) => {
        if (room.votes[p.id] === undefined) room.votes[p.id] = false;
      });
      resolveVotes(room);
      broadcastRoom(room);
    });

    socket.on('qdm-back-to-lobby', () => {
      const room = getRoom(ctx, socket);
      if (!room || !isHost(room, socket.id)) return;
      resetToLobby(room);
      broadcastRoom(room);
    });

    socket.on('qdm-rematch', () => {
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
  registerHandlers
};
