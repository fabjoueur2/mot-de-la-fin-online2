'use strict';
const fs = require('fs');
const path = require('path');
const { CATALOG } = require('./size-it-catalog');
const bank = require('../games/size-it/bank/bank.json');

const byId = Object.fromEntries(CATALOG.map((e) => [e.id, e]));
const bad = [];

for (const it of bank.items) {
  const metaPath = path.join('games/size-it/bank/fetched/_meta', `${it.id}.json`);
  if (!fs.existsSync(metaPath)) continue;
  const meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
  if (meta.provider !== 'generated') continue;
  const svg = fs.readFileSync(path.join('games/size-it/bank', it.svg), 'utf8').replace(/\s+/g, ' ');
  const entry = byId[it.id];
  const inner = (svg.match(/<g fill="#000">(.*?)<\/g>/) || [])[1] || '';
  const tags = (inner.match(/<\w+/g) || []).map((t) => t.slice(1));
  if (tags.length === 1 && tags[0] === 'rect') {
    bad.push({ id: it.id, name: entry?.name, shape: entry?.shape, kind: 'rect-only' });
  }
}

console.log('generated rect-only in bank:', bad.length);
for (const b of bad) console.log(`${b.id}\t${b.name}\t${b.shape}`);
