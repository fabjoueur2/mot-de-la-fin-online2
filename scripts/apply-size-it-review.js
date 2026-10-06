/**
 * Applique games/size-it/bank/review.json :
 * - force procédural pour tous les « bad »
 * - régénère leurs SVG curatés
 * - rebuild bank.json
 *
 * Usage: node scripts/apply-size-it-review.js [path/to/review.json]
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { CATALOG } = require('./size-it-catalog');
const { renderShape, normalizeSvg } = require('./size-it-shapes');

const ROOT = path.join(__dirname, '..');
const BANK_DIR = path.join(ROOT, 'games', 'size-it', 'bank');
const FETCHED = path.join(BANK_DIR, 'fetched');
const DEFAULT_REVIEW = path.join(BANK_DIR, 'review.json');

function main() {
  const reviewPath = process.argv[2] ? path.resolve(process.argv[2]) : DEFAULT_REVIEW;
  if (!fs.existsSync(reviewPath)) {
    console.error('Review file missing:', reviewPath);
    process.exit(1);
  }

  const review = JSON.parse(fs.readFileSync(reviewPath, 'utf8'));
  if (reviewPath !== DEFAULT_REVIEW) {
    fs.copyFileSync(reviewPath, DEFAULT_REVIEW);
    console.log('Copied review →', path.relative(ROOT, DEFAULT_REVIEW));
  }

  const byId = Object.fromEntries(CATALOG.map((e) => [e.id, e]));
  const badIds = Object.entries(review.verdicts || {})
    .filter(([, v]) => v.status === 'bad')
    .map(([id]) => id);

  console.log('Bad assets to replace:', badIds.length);

  const missingShapes = [];
  let written = 0;
  for (const id of badIds) {
    const entry = byId[id];
    if (!entry) {
      console.warn('Unknown id in review:', id);
      continue;
    }
    const svg = normalizeSvg(renderShape(entry.shape));
    // Quick sanity: curated should not be a lone rect for known everyday shapes
    const dir = path.join(FETCHED, entry.category);
    fs.mkdirSync(dir, { recursive: true });
    fs.mkdirSync(path.join(FETCHED, '_meta'), { recursive: true });
    const file = path.join(dir, `${id}.svg`);
    fs.writeFileSync(file, svg);
    fs.writeFileSync(
      path.join(FETCHED, '_meta', `${id}.json`),
      JSON.stringify(
        {
          id,
          name: entry.name,
          category: entry.category,
          provider: 'generated',
          source: 'Size It curated procedural silhouette (review bad)',
          license: 'CC0',
          shape: entry.shape,
          file: path.relative(ROOT, file).replace(/\\/g, '/')
        },
        null,
        2
      ) + '\n'
    );
    written++;
    if (!svg.includes('<') || svg.length < 40) missingShapes.push(id);
  }

  // Persist FORCE list helper file for fetch script
  const forcePath = path.join(__dirname, 'size-it-force-procedural.json');
  const existingForce = fs.existsSync(forcePath)
    ? JSON.parse(fs.readFileSync(forcePath, 'utf8'))
    : [];
  const merged = [...new Set([...existingForce, ...badIds, 'ever-palette-eur'])].sort();
  fs.writeFileSync(forcePath, JSON.stringify(merged, null, 2) + '\n');

  console.log('Wrote', written, 'SVGs');
  if (missingShapes.length) console.warn('Suspicious empty:', missingShapes);

  // Rebuild bank
  require('./build-size-it-bank');
}

main();
