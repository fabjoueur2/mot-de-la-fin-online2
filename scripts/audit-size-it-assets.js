/**
 * Audit des illustrations Size It (meta fetched + validation SVG Repo).
 *
 * Usage:
 *   node scripts/audit-size-it-assets.js
 *   node scripts/audit-size-it-assets.js --json
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { CATALOG } = require('./size-it-catalog');
const { validateStoredAsset } = require('./size-it-svgrepo-validate');

const ROOT = path.join(__dirname, '..');
const META_DIR = path.join(ROOT, 'games', 'size-it', 'bank', 'fetched', '_meta');

function main() {
  const byId = Object.fromEntries(CATALOG.map((e) => [e.id, e]));
  const jsonOut = process.argv.includes('--json');
  const issues = [];

  for (const entry of CATALOG) {
    const metaPath = path.join(META_DIR, `${entry.id}.json`);
    if (!fs.existsSync(metaPath)) {
      issues.push({
        id: entry.id,
        name: entry.name,
        category: entry.category,
        provider: 'missing',
        reasons: ['missing_meta']
      });
      continue;
    }
    const meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
    const svgPath = path.join(ROOT, meta.file || '');
    if (!fs.existsSync(svgPath)) {
      issues.push({
        id: entry.id,
        name: entry.name,
        category: entry.category,
        provider: meta.provider,
        reasons: ['missing_svg']
      });
      continue;
    }

    const v = validateStoredAsset(entry, meta);
    if (!v.ok) {
      issues.push({
        id: entry.id,
        name: entry.name,
        category: entry.category,
        shape: entry.shape,
        provider: meta.provider,
        matchTitle: meta.matchTitle,
        query: meta.query,
        score: meta.score,
        reasons: v.reasons
      });
    }
  }

  issues.sort((a, b) => a.category.localeCompare(b.category) || a.id.localeCompare(b.id));

  if (jsonOut) {
    console.log(JSON.stringify({ count: issues.length, issues }, null, 2));
  } else {
    console.log(`Audit Size It : ${issues.length} asset(s) suspect(s) / ${CATALOG.length}`);
    for (const i of issues) {
      console.log(`- ${i.id} (${i.category}) « ${i.name} » → ${i.matchTitle || i.provider} [${i.reasons.join(', ')}]`);
    }
  }

  if (issues.length > 0) process.exitCode = 1;
}

main();
