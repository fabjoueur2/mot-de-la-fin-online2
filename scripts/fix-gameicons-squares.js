/**
 * Corrige les SVG Game-icons devenus des carrés noirs :
 * fond plein (M0 0h512v512) + icône blanche → après normalize tout est #000.
 *
 * Usage: node scripts/fix-gameicons-squares.js
 */
'use strict';

const fs = require('fs');
const path = require('path');

const FETCHED = path.join(__dirname, '..', 'games', 'size-it', 'bank', 'fetched');
const META = path.join(FETCHED, '_meta');

/** Transforme un SVG Game-icons (fond noir + forme blanche) en silhouette noire. */
function fixGameIconsSvg(svg) {
  let s = String(svg || '');

  // Retire le carré de fond classique Game-icons
  s = s.replace(/<path[^>]*\sd="M0\s*0h512v512H0z"\s*\/?>/gi, '');
  s = s.replace(/<path[^>]*\sd="M0,0h512v512H0z"\s*\/?>/gi, '');
  s = s.replace(/<rect[^>]*\s(?:width="512"[^>]*height="512"|height="512"[^>]*width="512")[^>]*\/?>/gi, '');

  // Icône souvent en blanc / currentColor sur fond noir → silhouette noire
  s = s.replace(/currentColor/gi, '#000');
  s = s.replace(/fill="#fff"/gi, 'fill="#000"');
  s = s.replace(/fill="#ffffff"/gi, 'fill="#000"');
  s = s.replace(/fill="white"/gi, 'fill="#000"');
  s = s.replace(/fill="#FFF"/g, 'fill="#000"');
  s = s.replace(/stroke="#fff"/gi, 'stroke="#000"');
  s = s.replace(/stroke="#ffffff"/gi, 'stroke="#000"');
  s = s.replace(/stroke="white"/gi, 'stroke="#000"');

  // Paths sans fill explicite après retrait du fond → noir
  s = s.replace(/<path(?![^>]*\sfill=)/gi, '<path fill="#000"');

  if (!s.includes('viewBox=')) {
    s = s.replace('<svg', '<svg viewBox="0 0 512 512"');
  }

  return s.endsWith('\n') ? s : `${s}\n`;
}

function looksBrokenSquare(svg) {
  // Fond 512 + plus aucun fill blanc / tout noir → carré
  const hasBg = /d="M0\s*0h512v512H0z"/i.test(svg) || /d="M0,0h512v512H0z"/i.test(svg);
  const hasWhite = /fill="#fff"|fill="#ffffff"|fill="white"|fill="#FFF"/i.test(svg);
  if (hasBg && !hasWhite) return true;
  // Tout rempli #000 avec un path fond encore présent
  if (hasBg && (svg.match(/fill="#000"/gi) || []).length >= 1) return true;
  return false;
}

function main() {
  const metas = fs.readdirSync(META).filter((f) => f.endsWith('.json'));
  let fixed = 0;
  let skipped = 0;

  for (const file of metas) {
    const meta = JSON.parse(fs.readFileSync(path.join(META, file), 'utf8'));
    if (meta.provider !== 'gameicons' && meta.via !== 'confident-refix' && meta.via !== 'replacement' && meta.via !== 'game-icons-map') {
      // aussi corriger si le fichier a le pattern même sans meta
    }
    const cat = meta.category;
    const id = meta.id;
    const svgPath = path.join(FETCHED, cat, `${id}.svg`);
    if (!fs.existsSync(svgPath)) {
      skipped++;
      continue;
    }
    const raw = fs.readFileSync(svgPath, 'utf8');
    const isGi =
      meta.provider === 'gameicons' ||
      /d="M0\s*0h512v512H0z"/i.test(raw) ||
      /d="M0,0h512v512H0z"/i.test(raw);

    if (!isGi) {
      skipped++;
      continue;
    }

    const out = fixGameIconsSvg(raw);
    fs.writeFileSync(svgPath, out, 'utf8');
    fixed++;
  }

  console.log(`Fixed ${fixed} Game-icons SVGs (skipped ${skipped})`);
  require('./build-size-it-bank');
}

main();
