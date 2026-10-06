/**
 * Applique le review : re-fetch Game-icons sûrs, exclut le reste, télécharge les remplacements.
 * Usage: node scripts/apply-review-confident-swap.js
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { CATALOG } = require('./size-it-catalog');
const { CONFIDENT_REFIX, REPLACEMENTS } = require('./size-it-confident-replacements');

const ROOT = path.join(__dirname, '..');
const BANK_DIR = path.join(ROOT, 'games', 'size-it', 'bank');
const FETCHED = path.join(BANK_DIR, 'fetched');
const REVIEW = path.join(BANK_DIR, 'review.json');
const EXCLUDE = path.join(__dirname, 'size-it-exclude-ids.json');
const RAW = 'https://raw.githubusercontent.com/game-icons/icons/master/';

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function ensureDir(d) {
  fs.mkdirSync(d, { recursive: true });
}

function normalize(svg) {
  return fixGameIconsSilhouette(svg);
}

/** Game-icons = fond carré + forme blanche → silhouette noire sans carré. */
function fixGameIconsSilhouette(svg) {
  let s = String(svg || '');
  const hasGiBg = /d="M0\s*0h512v512H0z"|d="M0,0h512v512H0z"/i.test(s);
  if (hasGiBg) {
    s = s.replace(/<path[^>]*\sd="M0\s*0h512v512H0z"\s*\/?>/gi, '');
    s = s.replace(/<path[^>]*\sd="M0,0h512v512H0z"\s*\/?>/gi, '');
    s = s.replace(/fill="#fff"/gi, 'fill="#000"');
    s = s.replace(/fill="#ffffff"/gi, 'fill="#000"');
    s = s.replace(/fill="white"/gi, 'fill="#000"');
    s = s.replace(/fill="#FFF"/g, 'fill="#000"');
    s = s.replace(/currentColor/gi, '#000');
    s = s.replace(/<path(?![^>]*\sfill=)/gi, '<path fill="#000"');
  } else {
    s = s.replace(/currentColor/g, '#000');
    // Ne pas forcer tous les fills en #000 sur des SVG déjà monochromes corrects
    if (/fill="#fff"|fill="white"|fill="#ffffff"/i.test(s) && !/fill="#000"/i.test(s)) {
      s = s.replace(/fill="#fff"/gi, 'fill="#000"');
      s = s.replace(/fill="#ffffff"/gi, 'fill="#000"');
      s = s.replace(/fill="white"/gi, 'fill="#000"');
    }
  }
  if (!s.includes('viewBox=')) s = s.replace('<svg', '<svg viewBox="0 0 512 512"');
  return s.endsWith('\n') ? s : `${s}\n`;
}

function save(entry, svg, meta) {
  const dir = path.join(FETCHED, entry.category);
  ensureDir(dir);
  ensureDir(path.join(FETCHED, '_meta'));
  fs.writeFileSync(path.join(dir, `${entry.id}.svg`), normalize(svg), 'utf8');
  fs.writeFileSync(
    path.join(FETCHED, '_meta', `${entry.id}.json`),
    JSON.stringify(
      {
        id: entry.id,
        name: entry.name,
        category: entry.category,
        ...meta,
        file: `games/size-it/bank/fetched/${entry.category}/${entry.id}.svg`
      },
      null,
      2
    ) + '\n'
  );
}

async function fetchGi(rel) {
  const res = await fetch(RAW + rel.replace(/^\/+/, ''), {
    headers: { 'User-Agent': 'size-it-bank-builder/1.0 (confident-swap)' }
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} ${rel}`);
  const svg = await res.text();
  if (!svg.includes('<svg')) throw new Error(`Not SVG ${rel}`);
  return svg;
}

async function main() {
  if (!fs.existsSync(REVIEW)) {
    console.error('Missing review.json');
    process.exit(1);
  }
  const review = JSON.parse(fs.readFileSync(REVIEW, 'utf8'));
  const badIds = Object.entries(review.verdicts || {})
    .filter(([, v]) => v.status === 'bad')
    .map(([id]) => id);

  const byId = Object.fromEntries(CATALOG.map((e) => [e.id, e]));
  const exclude = [];
  const refix = [];
  for (const id of badIds) {
    if (CONFIDENT_REFIX[id]) refix.push(id);
    else exclude.push(id);
  }

  console.log(`Bad: ${badIds.length} → refix ${refix.length}, exclude/swap ${exclude.length}`);
  console.log(`Replacements to fetch: ${REPLACEMENTS.length}`);

  let ok = 0;
  let fail = 0;

  for (const id of refix) {
    const entry = byId[id];
    const rel = CONFIDENT_REFIX[id];
    if (!entry) {
      console.log('SKIP unknown', id);
      continue;
    }
    try {
      const svg = await fetchGi(rel);
      save(entry, svg, {
        provider: 'gameicons',
        source: 'Game-icons.net (CC0)',
        license: 'CC0',
        matchTitle: rel,
        via: 'confident-refix',
        sourceUrl: `https://game-icons.net/`
      });
      ok++;
      console.log('REFIX', id, '←', rel);
      await sleep(40);
    } catch (e) {
      fail++;
      exclude.push(id);
      console.log('FAIL refix', id, e.message);
    }
  }

  for (const entry of REPLACEMENTS) {
    try {
      const svg = await fetchGi(entry.gameIconsPath);
      save(entry, svg, {
        provider: 'gameicons',
        source: 'Game-icons.net (CC0)',
        license: 'CC0',
        matchTitle: entry.gameIconsPath,
        via: 'replacement',
        sourceUrl: `https://game-icons.net/`
      });
      ok++;
      console.log('NEW', entry.id, '←', entry.gameIconsPath);
      await sleep(40);
    } catch (e) {
      fail++;
      console.log('FAIL new', entry.id, e.message);
    }
  }

  const excludeUnique = [...new Set(exclude)];
  fs.writeFileSync(EXCLUDE, JSON.stringify(excludeUnique, null, 2) + '\n');
  console.log('\nWrote exclude', excludeUnique.length, EXCLUDE);
  console.log('Done downloads ok=', ok, 'fail=', fail);

  // Clear bad lock: excluded IDs should leave the bank; refixed stay
  require('./build-size-it-bank');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
