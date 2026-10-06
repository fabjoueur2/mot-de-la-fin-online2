/**
 * Télécharge / convertit les assets Size It :
 * - animals  → PhyloPic (CC0)
 * - geography → Natural Earth 110m
 * - reste    → SVG Repo (index CC0 HuggingFace + fallback généré)
 *
 * Usage: node scripts/fetch-size-it-assets.js
 * Puis:  node scripts/build-size-it-bank.js
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { decompress } = require('fzstd');
const { CATALOG } = require('./size-it-catalog');
const { PHYLOPIC_QUERY, NATURAL_EARTH_NAME, SVGREPO_QUERY } = require('./size-it-source-queries');
const { renderShape, normalizeSvg } = require('./size-it-shapes');

const ROOT = path.join(__dirname, '..');
const CACHE = path.join(ROOT, 'games', 'size-it', 'bank', 'cache');
const OUT_ASSETS = path.join(ROOT, 'games', 'size-it', 'bank', 'fetched');
const NE_URL = 'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_110m_admin_0_countries.geojson';
const SVGREPO_CC0 = 'https://huggingface.co/datasets/nyuuzyou/svgrepo/resolve/main/svgrepo-CC0.jsonl.zst';

const PHYLO_HEADERS = { Accept: 'application/vnd.phylopic.v2+json', 'User-Agent': 'size-it-bank-builder/1.0' };

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function ensureDir(d) {
  fs.mkdirSync(d, { recursive: true });
}

function slug(s) {
  return String(s)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function writeMeta(id, meta) {
  ensureDir(path.join(OUT_ASSETS, '_meta'));
  fs.writeFileSync(path.join(OUT_ASSETS, '_meta', `${id}.json`), JSON.stringify(meta, null, 2));
}

function saveSvg(category, id, svg, meta) {
  const dir = path.join(OUT_ASSETS, category);
  ensureDir(dir);
  const file = path.join(dir, `${id}.svg`);
  fs.writeFileSync(file, normalizeFetchedSvg(svg), 'utf8');
  writeMeta(id, { ...meta, file: path.relative(ROOT, file).replace(/\\/g, '/') });
  return file;
}

/** Force silhouette noire utilisable dans le canvas. */
function normalizeFetchedSvg(raw) {
  let s = String(raw || '');
  // strip scripts / foreignObject
  s = s.replace(/<script[\s\S]*?<\/script>/gi, '');
  s = s.replace(/<foreignObject[\s\S]*?<\/foreignObject>/gi, '');
  // unify fills to black (keep none for holes)
  s = s.replace(/fill\s*=\s*["'](?!none)[^"']*["']/gi, 'fill="#000"');
  s = s.replace(/stroke\s*=\s*["'][^"']*["']/gi, 'stroke="none"');
  s = s.replace(/style\s*=\s*["'][^"']*["']/gi, (m) => {
    let st = m;
    st = st.replace(/fill\s*:\s*(?!none)[^;"]+/gi, 'fill:#000');
    st = st.replace(/stroke\s*:\s*[^;"]+/gi, 'stroke:none');
    return st;
  });
  if (!/viewBox=/.test(s) && /<svg/i.test(s)) {
    s = s.replace(/<svg/i, '<svg viewBox="0 0 100 100"');
  }
  return normalizeSvg(s);
}

async function fetchText(url, opts = {}) {
  const r = await fetch(url, opts);
  if (!r.ok) {
    const err = new Error(`HTTP ${r.status} ${url}`);
    err.status = r.status;
    throw err;
  }
  return r.text();
}

async function fetchJson(url, opts = {}) {
  const r = await fetch(url, opts);
  if (!r.ok) {
    const err = new Error(`HTTP ${r.status} ${url}`);
    err.status = r.status;
    throw err;
  }
  return r.json();
}

async function fetchBuffer(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`HTTP ${r.status} ${url}`);
  return Buffer.from(await r.arrayBuffer());
}

// —— PhyloPic ——
async function getPhyloBuild() {
  const root = await fetchJson('https://api.phylopic.org/', { headers: PHYLO_HEADERS });
  return root.build;
}

async function fetchPhyloPicSvg(query, build) {
  const q = String(query).toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();
  let nodes;
  try {
    nodes = await fetchJson(
      `https://api.phylopic.org/nodes?build=${build}&filter_name=${encodeURIComponent(q)}&embed_items=true&page=0`,
      { headers: PHYLO_HEADERS }
    );
  } catch {
    return null;
  }
  const node = nodes._embedded?.items?.[0];
  if (!node?.uuid) return null;

  let imgs;
  try {
    imgs = await fetchJson(
      `https://api.phylopic.org/images?build=${build}&filter_node=${node.uuid}&filter_license_by=false&filter_license_nc=false&filter_license_sa=false&embed_items=true&page=0`,
      { headers: PHYLO_HEADERS }
    );
  } catch {
    // Pas de CC0 pour ce nœud — essayer primaryImage si licence CC0
    try {
      const href = node._links?.primaryImage?.href;
      if (!href) return null;
      const img = await fetchJson(`https://api.phylopic.org${href.split('?')[0]}`, { headers: PHYLO_HEADERS });
      const lic = img._links?.license?.href || '';
      if (!/publicdomain\/zero|cc0/i.test(lic)) return null;
      const vector = img._links?.vectorFile?.href;
      if (!vector) return null;
      const svg = await fetchText(vector);
      return {
        svg,
        source: 'PhyloPic',
        sourceUrl: vector,
        license: 'CC0',
        query: q,
        nodeUuid: node.uuid,
        imageUuid: img.uuid
      };
    } catch {
      return null;
    }
  }
  const image = imgs._embedded?.items?.[0];
  const vector = image?._links?.vectorFile?.href;
  if (!vector) return null;
  const svg = await fetchText(vector);
  return {
    svg,
    source: 'PhyloPic',
    sourceUrl: vector,
    license: 'CC0',
    query: q,
    nodeUuid: node.uuid,
    imageUuid: image.uuid
  };
}

// —— Natural Earth ——
function projectRing(ring, bbox, size = 1000, pad = 40) {
  const [minX, minY, maxX, maxY] = bbox;
  const w = maxX - minX || 1;
  const h = maxY - minY || 1;
  const scale = Math.min((size - 2 * pad) / w, (size - 2 * pad) / h);
  const ox = (size - w * scale) / 2;
  const oy = (size - h * scale) / 2;
  return ring.map(([lon, lat]) => {
    const x = ox + (lon - minX) * scale;
    // invert Y for SVG
    const y = size - (oy + (lat - minY) * scale);
    return [x, y];
  });
}

function geometryBBox(geom) {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  const walk = (coords) => {
    if (typeof coords[0] === 'number') {
      minX = Math.min(minX, coords[0]);
      minY = Math.min(minY, coords[1]);
      maxX = Math.max(maxX, coords[0]);
      maxY = Math.max(maxY, coords[1]);
      return;
    }
    for (const c of coords) walk(c);
  };
  walk(geom.coordinates);
  return [minX, minY, maxX, maxY];
}

function ringArea(ring) {
  let a = 0;
  for (let i = 0; i < ring.length - 1; i++) {
    a += ring[i][0] * ring[i + 1][1] - ring[i + 1][0] * ring[i][1];
  }
  return Math.abs(a / 2);
}

/** Garde le plus grand polygone (souvent le continent / métropole). */
function largestPolygonCoords(geom) {
  if (geom.type === 'Polygon') return geom.coordinates;
  if (geom.type === 'MultiPolygon') {
    let best = geom.coordinates[0];
    let bestA = ringArea(best[0]);
    for (const poly of geom.coordinates) {
      const a = ringArea(poly[0]);
      if (a > bestA) {
        best = poly;
        bestA = a;
      }
    }
    return best;
  }
  return null;
}

function geojsonFeatureToSvg(feature) {
  const geom = feature.geometry;
  const poly = largestPolygonCoords(geom);
  if (!poly) return null;
  const tempGeom = { type: 'Polygon', coordinates: poly };
  const bbox = geometryBBox(tempGeom);
  const parts = [];
  for (const ring of poly) {
    const pts = projectRing(ring, bbox);
    if (pts.length < 3) continue;
    const d = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p[0].toFixed(2)},${p[1].toFixed(2)}`).join(' ') + ' Z';
    parts.push(d);
  }
  if (!parts.length) return null;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 1000"><path fill="#000" fill-rule="evenodd" d="${parts.join(' ')}"/></svg>\n`;
}

async function loadNaturalEarth() {
  const cacheFile = path.join(CACHE, 'ne_110m_admin_0_countries.geojson');
  ensureDir(CACHE);
  if (!fs.existsSync(cacheFile)) {
    console.log('Downloading Natural Earth…');
    const text = await fetchText(NE_URL);
    fs.writeFileSync(cacheFile, text);
  }
  return JSON.parse(fs.readFileSync(cacheFile, 'utf8'));
}

function findNeFeature(geojson, adminName) {
  const target = adminName.toLowerCase();
  return geojson.features.find((f) => {
    const p = f.properties || {};
    return [p.ADMIN, p.NAME, p.NAME_LONG, p.GEOUNIT, p.FORMAL_EN]
      .filter(Boolean)
      .some((n) => String(n).toLowerCase() === target);
  });
}

// —— SVG Repo (CC0 index) ——
async function loadSvgRepoIndex() {
  const cacheJsonl = path.join(CACHE, 'svgrepo-CC0.jsonl');
  const cacheZst = path.join(CACHE, 'svgrepo-CC0.jsonl.zst');
  ensureDir(CACHE);

  if (!fs.existsSync(cacheJsonl)) {
    console.log('Downloading SVG Repo CC0 index (HuggingFace mirror)…');
    const buf = await fetchBuffer(SVGREPO_CC0);
    fs.writeFileSync(cacheZst, buf);
    const out = Buffer.from(decompress(buf));
    fs.writeFileSync(cacheJsonl, out);
    console.log('Decompressed', (out.length / 1e6).toFixed(1), 'MB');
  }

  console.log('Indexing SVG Repo CC0…');
  const lines = fs.readFileSync(cacheJsonl, 'utf8').split('\n');
  /** @type {{title:string, tags:string[], svg:string, url:string, scoreKeys:string}[]} */
  const index = [];
  for (const line of lines) {
    if (!line.trim()) continue;
    let obj;
    try {
      obj = JSON.parse(line);
    } catch {
      continue;
    }
    if (!obj.svg_content) continue;
    const title = slug(obj.title || '');
    const tags = (obj.tags || []).map(slug).filter(Boolean);
    index.push({
      title,
      tags,
      svg: obj.svg_content,
      url: obj.download_url || '',
      scoreKeys: `${title} ${tags.join(' ')}`
    });
  }
  console.log('SVG Repo CC0 entries:', index.length);
  return index;
}

function bestSvgRepoMatch(index, query) {
  const q = slug(query);
  if (!q) return null;
  const terms = q.split(' ').filter((t) => t.length > 1);
  let best = null;
  let bestScore = 0;
  for (const entry of index) {
    let score = 0;
    if (entry.title === q) score += 100;
    if (entry.title.includes(q) || q.includes(entry.title)) score += 40;
    for (const t of terms) {
      if (entry.title.includes(t)) score += 12;
      if (entry.tags.some((tag) => tag === t || tag.includes(t))) score += 8;
    }
    if (score > bestScore) {
      bestScore = score;
      best = entry;
    }
  }
  if (bestScore < 12) return null;
  return { ...best, score: bestScore };
}

async function main() {
  ensureDir(OUT_ASSETS);
  ensureDir(CACHE);

  const build = await getPhyloBuild();
  console.log('PhyloPic build', build);

  const geojson = await loadNaturalEarth();
  const svgRepoIndex = await loadSvgRepoIndex();

  const stats = { phylopic: 0, naturalearth: 0, svgrepo: 0, generated: 0, fail: 0 };

  for (let i = 0; i < CATALOG.length; i++) {
    const entry = CATALOG[i];
    const { id, category, name, shape } = entry;
    process.stdout.write(`[${i + 1}/${CATALOG.length}] ${id}… `);

    try {
      const existing = path.join(OUT_ASSETS, category, `${id}.svg`);
      const existingMeta = path.join(OUT_ASSETS, '_meta', `${id}.json`);
      if (fs.existsSync(existing) && fs.existsSync(existingMeta)) {
        const meta = JSON.parse(fs.readFileSync(existingMeta, 'utf8'));
        if (meta.provider && meta.provider !== 'generated') {
          stats[meta.provider] = (stats[meta.provider] || 0) + 1;
          console.log('skip', meta.provider);
          continue;
        }
      }

      if (category === 'animals') {
        const q = PHYLOPIC_QUERY[id] || name;
        const hit = await fetchPhyloPicSvg(q, build);
        await sleep(120);
        if (hit) {
          saveSvg(category, id, hit.svg, {
            id, name, category, provider: 'phylopic', ...hit
          });
          stats.phylopic++;
          console.log('PhyloPic');
          continue;
        }
      }

      if (category === 'geography') {
        const admin = NATURAL_EARTH_NAME[id];
        if (admin) {
          const feat = findNeFeature(geojson, admin);
          if (feat) {
            const svg = geojsonFeatureToSvg(feat);
            if (svg) {
              saveSvg(category, id, svg, {
                id, name, category,
                provider: 'naturalearth',
                source: 'Natural Earth Admin 0 Countries 110m',
                sourceUrl: NE_URL,
                license: 'Public Domain',
                admin
              });
              stats.naturalearth++;
              console.log('NaturalEarth');
              continue;
            }
          }
        }
      }

      // SVG Repo for everything else (and geo/animal fallbacks)
      const q = SVGREPO_QUERY[id] || shape || name;
      const match = bestSvgRepoMatch(svgRepoIndex, q);
      if (match) {
        saveSvg(category, id, match.svg, {
          id, name, category,
          provider: 'svgrepo',
          source: 'SVG Repo (CC0 via HuggingFace mirror)',
          sourceUrl: match.url,
          license: 'CC0',
          query: q,
          matchTitle: match.title,
          score: match.score
        });
        stats.svgrepo++;
        console.log('SVGRepo', match.score);
        continue;
      }

      // Fallback généré
      const gen = renderShape(shape);
      saveSvg(category, id, gen, {
        id, name, category,
        provider: 'generated',
        source: 'Size It procedural silhouette',
        license: 'CC0'
      });
      stats.generated++;
      console.log('generated');
    } catch (e) {
      stats.fail++;
      console.log('FAIL', e.message);
      const gen = renderShape(shape);
      saveSvg(category, id, gen, {
        id, name, category,
        provider: 'generated',
        source: 'Size It procedural silhouette (fallback after error)',
        license: 'CC0',
        error: String(e.message || e)
      });
      stats.generated++;
    }
  }

  fs.writeFileSync(path.join(OUT_ASSETS, 'fetch-stats.json'), JSON.stringify(stats, null, 2));
  console.log('\nDone', stats);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
