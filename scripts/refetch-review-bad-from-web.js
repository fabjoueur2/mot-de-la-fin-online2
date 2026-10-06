/**
 * Re-télécharge les assets « bad » de review.json depuis le web :
 * 0) titres File: Wikimedia exacts
 * 1) titre exact SVG Repo CC0
 * 2) Game-icons.net CC0 (chemins mappés)
 * 3) PhyloPic (animaux)
 * 4) requêtes SVG Repo (mots entiers)
 * 5) Wikimedia Commons (SVG Public Domain / CC0)
 * 6) Game-icons fallback
 *
 * Pas de silhouette procédurale.
 *
 * Usage: node scripts/refetch-review-bad-from-web.js [path/to/review.json] [--only-failed]
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { CATALOG } = require('./size-it-catalog');
const { PHYLOPIC_QUERY } = require('./size-it-source-queries');
const {
  SVGREPO_EXACT_TITLE,
  WEB_QUERIES,
  GAME_ICONS_PATH,
  WIKIMEDIA_FILE_TITLES
} = require('./size-it-web-overrides');
const { normalizeSvg } = require('./size-it-shapes');
const { validateSvgRepoMatch, slug, wordInText } = require('./size-it-svgrepo-validate');

const ROOT = path.join(__dirname, '..');
const BANK_DIR = path.join(ROOT, 'games', 'size-it', 'bank');
const FETCHED = path.join(BANK_DIR, 'fetched');
const CACHE = path.join(BANK_DIR, 'cache');
const REVIEW_DEFAULT = path.join(BANK_DIR, 'review.json');
const SVG_JSONL = path.join(CACHE, 'svgrepo-CC0.jsonl');
const GAME_ICONS_RAW = 'https://raw.githubusercontent.com/game-icons/icons/master/';

const PHYLO_HEADERS = {
  Accept: 'application/vnd.phylopic.v2+json',
  'User-Agent': 'size-it-bank-builder/1.0 (review-refetch)'
};

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function fetchText(url, opts = {}) {
  const res = await fetch(url, opts);
  if (!res.ok) throw new Error(`HTTP ${res.status} ${url}`);
  return res.text();
}

async function fetchJson(url, opts = {}) {
  const text = await fetchText(url, opts);
  return JSON.parse(text);
}

function ensureDir(d) {
  fs.mkdirSync(d, { recursive: true });
}

function saveAsset(entry, svg, meta) {
  const dir = path.join(FETCHED, entry.category);
  ensureDir(dir);
  ensureDir(path.join(FETCHED, '_meta'));
  const file = path.join(dir, `${entry.id}.svg`);
  fs.writeFileSync(file, normalizeSvg(svg), 'utf8');
  fs.writeFileSync(
    path.join(FETCHED, '_meta', `${entry.id}.json`),
    JSON.stringify(
      {
        id: entry.id,
        name: entry.name,
        category: entry.category,
        ...meta,
        file: path.relative(ROOT, file).replace(/\\/g, '/')
      },
      null,
      2
    ) + '\n'
  );
}

function loadSvgRepoIndex() {
  if (!fs.existsSync(SVG_JSONL)) {
    throw new Error('Missing SVG Repo cache. Run: npm run fetch-size-it-assets once');
  }
  const lines = fs.readFileSync(SVG_JSONL, 'utf8').split('\n');
  /** @type {{title:string, rawTitle:string, tags:string[], svg:string, url:string}[]} */
  const index = [];
  const byExact = new Map();
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
    const entry = {
      title,
      rawTitle: obj.title || '',
      tags: (obj.tags || []).map(slug).filter(Boolean),
      svg: obj.svg_content,
      url: obj.download_url || ''
    };
    index.push(entry);
    byExact.set(title, entry);
    byExact.set(slug(obj.title || ''), entry);
  }
  return { index, byExact };
}

function scoreEntry(entry, query) {
  const q = slug(query);
  if (!q) return 0;
  const terms = q.split(' ').filter((t) => t.length > 1);
  let score = 0;
  if (entry.title === q) score += 100;
  const words = entry.title.split(' ').filter(Boolean);
  for (const t of terms) {
    if (words.includes(t)) score += 22;
    else if (t.length >= 4 && wordInText(t, entry.title)) score += 10;
    if (entry.tags.includes(t)) score += 10;
  }
  const hay = `${entry.title} ${entry.url}`;
  if (/horoscope|zodiac|defendant|bittrex|covid|paint tray|artist palette|bitcoin/.test(hay)) {
    score -= 120;
  }
  // penalize very short generic titles when query is longer
  if (terms.length >= 2 && words.length === 1 && words[0].length <= 4) score -= 25;
  return score;
}

function bestSvgRepo(index, query, catalogEntry) {
  let best = null;
  let bestScore = 0;
  for (const entry of index) {
    const score = scoreEntry(entry, query);
    if (score <= 0) continue;
    if (score > bestScore) {
      bestScore = score;
      best = entry;
    }
  }
  if (!best || bestScore < 36) return null;
  const check = validateSvgRepoMatch(catalogEntry, query, {
    title: best.title,
    score: bestScore,
    url: best.url
  });
  // For review refetch we allow if score high even if some soft rules fail,
  // but never toxic zodiac/defendant etc. (already penalized)
  if (!check.ok && bestScore < 80) return null;
  if (!check.ok && /toxic|zodiac|paint_palette|car_not_cargo/.test(check.reasons.join(','))) {
    return null;
  }
  return { ...best, score: bestScore };
}

async function getPhyloBuild() {
  const data = await fetchJson('https://api.phylopic.org/nodes?filter_name=Homo%20sapiens', {
    headers: PHYLO_HEADERS
  });
  return data.build;
}

async function fetchPhyloPicSvg(query, build) {
  const q = encodeURIComponent(query);
  const search = await fetchJson(
    `https://api.phylopic.org/nodes?build=${build}&filter_name=${q}&page=0&embed_items=true`,
    { headers: PHYLO_HEADERS }
  );
  const items = search?._embedded?.items || [];
  if (!items.length) return null;
  for (const node of items.slice(0, 3)) {
    try {
      const detail = await fetchJson(
        `https://api.phylopic.org/nodes/${node.uuid}?build=${build}&embed_primaryImage=true`,
        { headers: PHYLO_HEADERS }
      );
      const img = detail?._embedded?.primaryImage;
      const vector =
        img?._links?.vectorFile?.href ||
        img?._links?.sourceFile?.href ||
        null;
      if (!vector) continue;
      const svgUrl = vector.startsWith('http') ? vector : `https://images.phylopic.org${vector}`;
      if (!/\.svg(\?|$)/i.test(svgUrl) && !svgUrl.includes('vector')) {
        // still try
      }
      const svg = await fetchText(svgUrl, { headers: PHYLO_HEADERS });
      if (svg.includes('<svg')) return { svg, sourceUrl: svgUrl, query };
    } catch {
      /* next node */
    }
    await sleep(200);
  }
  return null;
}

function licenseOk(meta) {
  const short = String(meta?.LicenseShortName?.value || meta?.License?.value || '').toLowerCase();
  const url = String(meta?.LicenseUrl?.value || '').toLowerCase();
  const blob = `${short} ${url}`;
  // PD / CC0 preferred; CC-BY* accepted with sourceUrl attribution in meta
  if (/cc0|public domain|pd-|pd \/|pd$|creativecommons\.org\/publicdomain|zero\/1\.0/.test(blob)) {
    return true;
  }
  if (/cc-by|cc by|attribution/.test(blob) && !/nd/.test(blob)) return true;
  return false;
}

async function fetchGameIconsSvg(relPath) {
  if (!relPath) return null;
  const url = GAME_ICONS_RAW + relPath.replace(/^\/+/, '');
  const svg = await fetchText(url, {
    headers: { 'User-Agent': 'size-it-bank-builder/1.0 (review-refetch)' }
  });
  if (!svg.includes('<svg')) return null;
  return {
    svg,
    sourceUrl: `https://game-icons.net/`,
    path: relPath,
    license: 'CC0'
  };
}

async function fetchWikimediaFileTitles(titles) {
  for (const title of titles || []) {
    const infoUrl =
      'https://commons.wikimedia.org/w/api.php?' +
      new URLSearchParams({
        action: 'query',
        format: 'json',
        origin: '*',
        titles: title.startsWith('File:') ? title : `File:${title}`,
        prop: 'imageinfo',
        iiprop: 'url|mime|extmetadata'
      });
    let info;
    try {
      info = await fetchJson(infoUrl, {
        headers: { 'User-Agent': 'size-it-bank-builder/1.0 (asset-review; local)' }
      });
    } catch {
      continue;
    }
    const page = Object.values(info?.query?.pages || {})[0];
    if (!page || page.missing != null) continue;
    const ii = page?.imageinfo?.[0];
    if (!ii || !/svg/i.test(ii.mime || '')) continue;
    if (!licenseOk(ii.extmetadata || {})) continue;
    try {
      const svg = await fetchText(ii.url, {
        headers: { 'User-Agent': 'size-it-bank-builder/1.0 (asset-review; local)' }
      });
      if (!svg.includes('<svg')) continue;
      await sleep(120);
      return {
        svg,
        sourceUrl: ii.descriptionurl || ii.url,
        title,
        license: ii.extmetadata?.LicenseShortName?.value || 'Public Domain / CC0'
      };
    } catch {
      /* next */
    }
    await sleep(200);
  }
  return null;
}

async function fetchWikimediaSvg(queries) {
  for (const query of queries) {
    const searchUrl =
      'https://commons.wikimedia.org/w/api.php?' +
      new URLSearchParams({
        action: 'query',
        format: 'json',
        origin: '*',
        list: 'search',
        srsearch: `${query} filetype:svg`,
        srnamespace: '6',
        srlimit: '12'
      });
    let data;
    try {
      data = await fetchJson(searchUrl, {
        headers: { 'User-Agent': 'size-it-bank-builder/1.0 (asset-review; local)' }
      });
    } catch {
      continue;
    }
    const hits = data?.query?.search || [];
    for (const hit of hits) {
      const title = hit.title;
      if (!/\.svg$/i.test(title)) continue;
      const infoUrl =
        'https://commons.wikimedia.org/w/api.php?' +
        new URLSearchParams({
          action: 'query',
          format: 'json',
          origin: '*',
          titles: title,
          prop: 'imageinfo',
          iiprop: 'url|mime|extmetadata',
          iiurlwidth: '512'
        });
      let info;
      try {
        info = await fetchJson(infoUrl, {
          headers: { 'User-Agent': 'size-it-bank-builder/1.0 (asset-review; local)' }
        });
      } catch {
        continue;
      }
      const page = Object.values(info?.query?.pages || {})[0];
      const ii = page?.imageinfo?.[0];
      if (!ii || !/svg/i.test(ii.mime || '')) continue;
      if (!licenseOk(ii.extmetadata || {})) continue;
      try {
        const svg = await fetchText(ii.url, {
          headers: { 'User-Agent': 'size-it-bank-builder/1.0 (asset-review; local)' }
        });
        if (!svg.includes('<svg')) continue;
        await sleep(120);
        return {
          svg,
          sourceUrl: ii.descriptionurl || ii.url,
          title,
          license: ii.extmetadata?.LicenseShortName?.value || 'Public Domain / CC0'
        };
      } catch {
        /* next */
      }
      await sleep(250);
    }
    await sleep(350);
  }
  return null;
}

async function main() {
  const args = process.argv.slice(2);
  const onlyFailed = args.includes('--only-failed');
  const reviewPath = args.find((a) => !a.startsWith('--'))
    ? path.resolve(args.find((a) => !a.startsWith('--')))
    : REVIEW_DEFAULT;
  if (!fs.existsSync(reviewPath)) {
    console.error('Missing review file', reviewPath);
    process.exit(1);
  }
  if (reviewPath !== REVIEW_DEFAULT) {
    fs.copyFileSync(reviewPath, REVIEW_DEFAULT);
  }
  const review = JSON.parse(fs.readFileSync(REVIEW_DEFAULT, 'utf8'));
  let badIds = Object.entries(review.verdicts || {})
    .filter(([, v]) => v.status === 'bad')
    .map(([id]) => id);

  if (onlyFailed) {
    const statsPath = path.join(FETCHED, 'review-refetch-stats.json');
    if (fs.existsSync(statsPath)) {
      const prev = JSON.parse(fs.readFileSync(statsPath, 'utf8'));
      badIds = prev.failed || badIds;
      // Also retry known bad automatic matches
      for (const id of ['anim-hamster']) {
        if (!badIds.includes(id)) badIds.push(id);
      }
    }
  }
  const byId = Object.fromEntries(CATALOG.map((e) => [e.id, e]));

  console.log('Re-fetch bad from web:', badIds.length);
  const { index, byExact } = loadSvgRepoIndex();
  console.log('SVG Repo index:', index.length);

  let phyloBuild = null;
  try {
    phyloBuild = await getPhyloBuild();
    console.log('PhyloPic build', phyloBuild);
  } catch (e) {
    console.warn('PhyloPic unavailable', e.message);
  }

  const stats = { svgrepo: 0, phylopic: 0, wikimedia: 0, gameicons: 0, fail: 0 };
  const failed = [];

  for (let i = 0; i < badIds.length; i++) {
    const id = badIds[i];
    const entry = byId[id];
    process.stdout.write(`[${i + 1}/${badIds.length}] ${id}… `);
    if (!entry) {
      console.log('unknown id');
      stats.fail++;
      failed.push(id);
      continue;
    }

    try {
      // 0) Wikimedia exact File: titles (best semantic match when known)
      const wikiTitles = WIKIMEDIA_FILE_TITLES[id];
      if (wikiTitles?.length) {
        const wikiExact = await fetchWikimediaFileTitles(wikiTitles);
        if (wikiExact) {
          saveAsset(entry, wikiExact.svg, {
            provider: 'wikimedia',
            source: 'Wikimedia Commons',
            sourceUrl: wikiExact.sourceUrl,
            license: wikiExact.license,
            matchTitle: wikiExact.title,
            via: 'wikimedia-file'
          });
          stats.wikimedia++;
          console.log('Wikimedia file', wikiExact.title);
          continue;
        }
      }

      // 1) Exact SVG Repo title
      const exactTitle = SVGREPO_EXACT_TITLE[id];
      if (exactTitle) {
        const hit = byExact.get(slug(exactTitle));
        if (hit) {
          saveAsset(entry, hit.svg, {
            provider: 'svgrepo',
            source: 'SVG Repo (CC0 via HuggingFace mirror)',
            sourceUrl: hit.url,
            license: 'CC0',
            query: exactTitle,
            matchTitle: hit.title,
            score: 100,
            via: 'exact-title'
          });
          stats.svgrepo++;
          console.log('SVGRepo exact:', hit.rawTitle || hit.title);
          continue;
        }
      }

      // 2) Game-icons.net CC0 (mapped paths)
      // Skip weak animal substitutes (hamster≠mouse) unless nothing else works later
      const gamePath = GAME_ICONS_PATH[id];
      const skipGameEarly = id === 'anim-hamster';
      if (gamePath && !skipGameEarly) {
        try {
          const gi = await fetchGameIconsSvg(gamePath);
          if (gi) {
            saveAsset(entry, gi.svg, {
              provider: 'gameicons',
              source: 'Game-icons.net (CC0)',
              sourceUrl: gi.sourceUrl + ' icons/' + gamePath,
              license: 'CC0',
              matchTitle: gamePath,
              via: 'game-icons-map'
            });
            stats.gameicons++;
            console.log('Game-icons', gamePath);
            await sleep(40);
            continue;
          }
        } catch (e) {
          console.log('game-icons miss', e.message, '…');
        }
      }

      // 3) PhyloPic for animals
      if (entry.category === 'animals' && phyloBuild) {
        const q = PHYLOPIC_QUERY[id] || (WEB_QUERIES[id] || [])[0] || entry.name;
        const hit = await fetchPhyloPicSvg(q, phyloBuild);
        await sleep(150);
        if (hit) {
          saveAsset(entry, hit.svg, {
            provider: 'phylopic',
            source: 'PhyloPic',
            sourceUrl: hit.sourceUrl,
            license: 'CC0',
            query: q
          });
          stats.phylopic++;
          console.log('PhyloPic');
          continue;
        }
      }

      // 4) SVG Repo multi-query
      const queries = [
        ...(WEB_QUERIES[id] || []),
        exactTitle,
        entry.shape,
        entry.name
      ].filter(Boolean);
      let matched = null;
      for (const q of queries) {
        const m = bestSvgRepo(index, q, entry);
        if (!m) continue;
        // Évite hamster → mouse, etc.
        if (id === 'anim-hamster' && /mouse|rat/.test(m.title)) continue;
        if (id.includes('ladder') || entry.shape === 'ladder') {
          if (/phone|distract|gall bladder/.test(m.title)) continue;
        }
        if (entry.shape === 'stopsign' && m.title === 'stop') {
          // "Stop" alone is often a media stop icon — skip unless better
          continue;
        }
        if (!matched || m.score > matched.score) matched = { ...m, query: q };
      }
      if (matched) {
        saveAsset(entry, matched.svg, {
          provider: 'svgrepo',
          source: 'SVG Repo (CC0 via HuggingFace mirror)',
          sourceUrl: matched.url,
          license: 'CC0',
          query: matched.query,
          matchTitle: matched.title,
          score: matched.score,
          via: 'scored-query'
        });
        stats.svgrepo++;
        console.log('SVGRepo', matched.score, matched.title);
        continue;
      }

      // 5) Wikimedia Commons PD/CC0 SVG (search)
      const wiki = await fetchWikimediaSvg(queries.filter((q) => typeof q === 'string'));
      if (wiki) {
        saveAsset(entry, wiki.svg, {
          provider: 'wikimedia',
          source: 'Wikimedia Commons',
          sourceUrl: wiki.sourceUrl,
          license: wiki.license,
          query: queries[0],
          matchTitle: wiki.title,
          via: 'wikimedia'
        });
        stats.wikimedia++;
        console.log('Wikimedia', wiki.title);
        continue;
      }

      // 6) Last-resort Game-icons (incl. weak animal substitutes)
      if (gamePath) {
        try {
          const gi = await fetchGameIconsSvg(gamePath);
          if (gi) {
            saveAsset(entry, gi.svg, {
              provider: 'gameicons',
              source: 'Game-icons.net (CC0)',
              sourceUrl: gi.sourceUrl + ' icons/' + gamePath,
              license: 'CC0',
              matchTitle: gamePath,
              via: 'game-icons-fallback'
            });
            stats.gameicons++;
            console.log('Game-icons fallback', gamePath);
            continue;
          }
        } catch {
          /* fall through */
        }
      }

      stats.fail++;
      failed.push(id);
      console.log('FAIL (no safe web SVG)');
    } catch (e) {
      stats.fail++;
      failed.push(id);
      console.log('FAIL', e.message);
    }
  }

  fs.writeFileSync(
    path.join(FETCHED, 'review-refetch-stats.json'),
    JSON.stringify({ stats, failed, at: new Date().toISOString() }, null, 2) + '\n'
  );

  // Do not force procedural for these anymore
  const forcePath = path.join(__dirname, 'size-it-force-procedural.json');
  fs.writeFileSync(forcePath, JSON.stringify(['ever-palette-eur'], null, 2) + '\n');

  console.log('\nDone', stats);
  if (failed.length) {
    console.log('Still missing:', failed.length);
    console.log(failed.join(', '));
  }

  // Rebuild bank (keep bad IDs locked in trim)
  require('./build-size-it-bank');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
