const fs = require('fs');
const path = require('path');
const eng = require('../games/size-it');
const b = require('../games/size-it/bank/bank.json');

const cats = Object.keys(b.categories);
for (const cat of cats) {
  const room = eng.createInitialRoomState({ hostSocketId: 'h', playerName: 'H', code: 'T' + cat.slice(0, 3) });
  room.players.push({ id: 'g', name: 'G', score: 0 });
  room.settings.categories = [cat];
  room.settings.roundCount = 1;
  const r = eng.startGame(room);
  if (!r.ok) throw new Error(`start failed ${cat}: ${r.msg}`);
  if (room.puzzle.category !== cat) throw new Error(`wrong cat ${cat}`);
  const svgFile = path.join(__dirname, '..', 'games', 'size-it', 'bank', room.puzzle.svg);
  if (!fs.existsSync(svgFile)) throw new Error(`missing svg ${svgFile}`);
  console.log('ok', cat, room.puzzle.name, '→', room.reference.id);
}

// 2-player lock → reveal
const room = eng.createInitialRoomState({ hostSocketId: 'a', playerName: 'A', code: 'LOCK1' });
room.players.push({ id: 'b', name: 'B', score: 0 });
room.settings.roundCount = 2;
eng.startGame(room);
const est = room.reference.sizeM;
room.estimates.a = { valueM: est, locked: true, lockedAt: Date.now() };
room.estimates.b = { valueM: est * 1.1, locked: true, lockedAt: Date.now() };
if (!eng.finalizeRound(room) || room.phase !== 'reveal') throw new Error('finalize failed');
console.log('lock→reveal ok', room.roundResults.length, 'scores');

console.log('SMOKE PASS', b.count, 'items');
