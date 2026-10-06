/**
 * Construit games/size-it/bank/ à partir du catalogue.
 * Préfère les SVG téléchargés (PhyloPic / Natural Earth / SVG Repo / Game-icons) dans bank/fetched/.
 *
 * Usage:
 *   node scripts/fetch-size-it-assets.js
 *   node scripts/build-size-it-bank.js
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { CATALOG: BASE_CATALOG, VALID_CATEGORIES } = require('./size-it-catalog');
const { REPLACEMENTS } = require('./size-it-confident-replacements');
const { renderShape, normalizeSvg } = require('./size-it-shapes');

const ROOT = path.join(__dirname, '..');
const BANK_DIR = path.join(ROOT, 'games', 'size-it', 'bank');
const ASSETS_DIR = path.join(BANK_DIR, 'assets');
const FETCHED_DIR = path.join(BANK_DIR, 'fetched');
const OUT_JSON = path.join(BANK_DIR, 'bank.json');
const CATALOG_OUT = path.join(__dirname, 'size-it-catalog.json');
const EXCLUDE_PATH = path.join(__dirname, 'size-it-exclude-ids.json');
const EXTRAS_PATH = path.join(__dirname, 'size-it-final-extras.json');

function rimraf(dir) {
  if (!fs.existsSync(dir)) return;
  fs.rmSync(dir, { recursive: true, force: true });
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function readFetched(category, id) {
  const p = path.join(FETCHED_DIR, category, `${id}.svg`);
  if (!fs.existsSync(p)) return null;
  const metaPath = path.join(FETCHED_DIR, '_meta', `${id}.json`);
  const meta = fs.existsSync(metaPath) ? JSON.parse(fs.readFileSync(metaPath, 'utf8')) : null;
  return { svg: fs.readFileSync(p, 'utf8'), meta };
}

function loadExcludeIds() {
  if (!fs.existsSync(EXCLUDE_PATH)) return new Set();
  try {
    const arr = JSON.parse(fs.readFileSync(EXCLUDE_PATH, 'utf8'));
    return new Set(Array.isArray(arr) ? arr : []);
  } catch {
    return new Set();
  }
}

function mergeCatalog() {
  const byId = new Map();
  for (const e of BASE_CATALOG) byId.set(e.id, e);
  for (const e of REPLACEMENTS) {
    if (!byId.has(e.id)) byId.set(e.id, e);
  }
  if (fs.existsSync(EXTRAS_PATH)) {
    try {
      const extras = JSON.parse(fs.readFileSync(EXTRAS_PATH, 'utf8'));
      for (const e of extras || []) {
        if (e && e.id && !byId.has(e.id)) byId.set(e.id, e);
      }
    } catch {
      /* optional */
    }
  }
  return [...byId.values()];
}

function main() {
  const CATALOG = mergeCatalog();
  const excludeIds = loadExcludeIds();
  console.log(`Catalogue: ${CATALOG.length} items (exclude ${excludeIds.size})`);
  const hasFetched = fs.existsSync(FETCHED_DIR);
  console.log('Fetched assets:', hasFetched ? 'yes' : 'no (will generate)');

  rimraf(ASSETS_DIR);
  ensureDir(ASSETS_DIR);

  const items = [];
  const providerCounts = {};

  for (const entry of CATALOG) {
    if (excludeIds.has(entry.id)) continue;
    if (!VALID_CATEGORIES.includes(entry.category)) {
      throw new Error(`Invalid category: ${entry.category} (${entry.id})`);
    }
    if (!Number.isFinite(Number(entry.trueSize)) || Number(entry.trueSize) <= 0) {
      throw new Error(`Bad trueSize: ${entry.id}`);
    }

    const catDir = path.join(ASSETS_DIR, entry.category);
    ensureDir(catDir);
    const fileName = `${entry.id}.svg`;
    const relSvg = `assets/${entry.category}/${fileName}`;
    const absSvg = path.join(BANK_DIR, relSvg);

    const fetched = readFetched(entry.category, entry.id);
    let svg;
    let source = entry.source;
    let license = entry.license;
    let provider = 'generated';
    let sourceUrl = null;

    if (fetched) {
      svg = fetched.svg;
      provider = fetched.meta?.provider || 'fetched';
      source = fetched.meta?.source || source;
      license = fetched.meta?.license || license;
      sourceUrl = fetched.meta?.sourceUrl || null;
    } else {
      svg = normalizeSvg(renderShape(entry.shape));
      license = 'Public Domain / CC0 silhouette (generated)';
      source = 'Size It procedural silhouette';
    }

    fs.writeFileSync(absSvg, svg.endsWith('\n') ? svg : `${svg}\n`, 'utf8');
    providerCounts[provider] = (providerCounts[provider] || 0) + 1;

    const row = {
      id: entry.id,
      name: entry.name,
      category: entry.category,
      dimension: entry.dimension,
      trueSize: entry.trueSize,
      unit: entry.unit,
      svg: relSvg,
      source,
      license,
      assetStatus: provider === 'generated' ? 'generated' : 'fetched',
      measurementMethod: entry.measurementMethod,
      shape: entry.shape,
      provider
    };
    if (sourceUrl) row.sourceUrl = sourceUrl;
    items.push(row);
  }

  const targets = {
    animals: 120,
    everyday: 100,
    vehicles: 60,
    sports: 50,
    landmarks: 40,
    food: 40,
    geography: 50,
    space: 20,
    nature: 20
  };
  const keepIds = new Set(['geo-france', 'sport-football-pitch']);
  const preferIds = new Set(REPLACEMENTS.map((r) => r.id));

  const byCat = {};
  for (const it of items) (byCat[it.category] ||= []).push(it);

  let finalItems = [];
  for (const [cat, list] of Object.entries(byCat)) {
    const target = targets[cat] || list.length;
    const locked = list.filter((i) => keepIds.has(i.id));
    const rest = list.filter((i) => !keepIds.has(i.id));
    rest.sort((a, b) => {
      const score = (x) => {
        let s = 0;
        if (preferIds.has(x.id)) s -= 10;
        if (x.provider === 'gameicons') s -= 5;
        if (x.provider === 'generated') s += 20;
        return s;
      };
      return score(a) - score(b);
    });
    if (locked.length > target) {
      console.warn(`Category ${cat}: ${locked.length} locked > target ${target}, keeping all locked`);
      finalItems.push(...locked);
    } else {
      finalItems.push(...locked, ...rest.slice(0, Math.max(0, target - locked.length)));
    }
  }

  const finalCounts = {};
  for (const it of finalItems) finalCounts[it.category] = (finalCounts[it.category] || 0) + 1;

  if (finalItems.length !== items.length) {
    const keep = new Set(finalItems.map((i) => i.svg));
    for (const it of items) {
      if (!keep.has(it.svg)) {
        const p = path.join(BANK_DIR, it.svg);
        if (fs.existsSync(p)) fs.unlinkSync(p);
      }
    }
  }

  const bank = {
    schemaVersion: 3,
    count: finalItems.length,
    categories: finalCounts,
    providers: providerCounts,
    licensePolicy:
      'Animals: PhyloPic CC0. Geography: Natural Earth Public Domain. Other: SVG Repo / Game-icons CC0 (web). Excluded review-bad without confident match.',
    items: finalItems
  };

  fs.writeFileSync(OUT_JSON, `${JSON.stringify(bank, null, 2)}\n`, 'utf8');
  fs.writeFileSync(CATALOG_OUT, `${JSON.stringify(CATALOG, null, 2)}\n`, 'utf8');

  const pitchSvg = path.join(FETCHED_DIR, 'sports', 'sport-football-pitch.svg');
  const pitchOut = path.join(ROOT, 'public', 'games', 'size-it', 'refs', 'pitch.svg');
  if (fs.existsSync(pitchSvg)) {
    fs.copyFileSync(pitchSvg, pitchOut);
  } else {
    fs.writeFileSync(pitchOut, normalizeSvg(renderShape('pitch')));
  }

  const frSvg = path.join(FETCHED_DIR, 'geography', 'geo-france.svg');
  if (fs.existsSync(frSvg)) {
    fs.copyFileSync(frSvg, path.join(ROOT, 'public', 'games', 'size-it', 'refs', 'france.svg'));
  }

  console.log('Built bank.json:', bank.count, finalCounts);
  console.log('Providers (pre-trim catalog):', providerCounts);
  const genFinal = finalItems.filter((i) => i.provider === 'generated').length;
  console.log('Generated in final bank:', genFinal);
  console.log('Done.');
}

main();
