'use strict';
const fs = require('fs');
const path = require('path');
const bank = require('../games/size-it/bank/bank.json');
const review = require('../games/size-it/bank/review.json');

const bad = Object.entries(review.verdicts)
  .filter(([, v]) => v.status === 'bad')
  .map(([id]) => id);

let inBank = 0;
let missing = 0;
let stillRect = 0;
for (const id of bad) {
  const it = bank.items.find((x) => x.id === id);
  if (!it) continue;
  inBank++;
  const p = path.join(__dirname, '..', 'games/size-it/bank', it.svg);
  if (!fs.existsSync(p)) {
    missing++;
    continue;
  }
  const svg = fs.readFileSync(p, 'utf8').replace(/\s+/g, ' ');
  const inner = (svg.match(/<g fill="#000">(.*?)<\/g>/) || [])[1] || '';
  const tags = (inner.match(/<\w+/g) || []).map((t) => t.slice(1));
  if (tags.length === 1 && tags[0] === 'rect') stillRect++;
}

console.log({ bad: bad.length, inBank500: inBank, missingFiles: missing, stillRectOnly: stillRect });
for (const id of ['ever-smartphone', 'vehi-velo-cargo', 'land-colisee', 'food-pomme']) {
  const it = bank.items.find((x) => x.id === id);
  if (!it) {
    console.log(id, 'not in trimmed 500');
    continue;
  }
  console.log(id, fs.readFileSync(path.join(__dirname, '..', 'games/size-it/bank', it.svg), 'utf8').slice(0, 90));
}
