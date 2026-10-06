/**
 * Silhouettes SVG monochromes CC0 pour Size It (générateur procédural).
 * Chaque clé "shape" produit une forme distincte et lisible.
 */
'use strict';

function svg(inner, vb = '0 0 100 100') {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vb}"><g fill="#000">${inner}</g></svg>\n`;
}

function hash(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function poly(points) {
  return `<polygon points="${points.map(([x, y]) => `${x},${y}`).join(' ')}"/>`;
}

function ellipse(cx, cy, rx, ry) {
  return `<ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}"/>`;
}

function rect(x, y, w, h, rx = 0) {
  return `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${rx}"/>`;
}

function circle(cx, cy, r) {
  return `<circle cx="${cx}" cy="${cy}" r="${r}"/>`;
}

function path(d) {
  return `<path d="${d}"/>`;
}

/** Formes nommées prioritaires (lisibilité soirée). */
const SPECIAL = {
  france: () => svg(path('M38 8 L72 14 L82 42 L76 72 L58 92 L32 86 L18 52 L24 28 Z') + path('M74 78 Q86 86 82 96 Q70 92 74 78 Z')),
  italy: () => svg(path('M44 4 L62 10 L56 48 L72 72 L54 78 L48 96 L38 76 L22 70 L40 48 Z')),
  uk: () => svg(path('M34 18 L62 12 L72 42 L54 56 L66 72 L44 88 L28 58 L24 32 Z')),
  germany: () => svg(path('M28 18 L72 12 L82 48 L70 84 L32 88 L18 48 Z')),
  spain: () => svg(path('M18 38 L52 22 L84 36 L88 62 L58 84 L22 76 L12 52 Z')),
  eiffel: () => svg(path('M28 96 L44 28 H56 L72 96 Z') + rect(32, 58, 36, 5) + rect(36, 38, 28, 5) + rect(46, 8, 8, 22)),
  liberty: () => svg(rect(40, 48, 20, 48) + path('M34 48 L50 12 L66 48 Z') + rect(48, 2, 4, 14) + path('M66 38 H88 V54 H66')),
  pyramid: () => svg(path('M50 8 L92 92 H8 Z')),
  burj: () => svg(path('M40 96 L46 8 H54 L60 96 Z') + rect(42, 36, 16, 4)),
  skyscraper: () => svg(rect(30, 4, 40, 92) + Array.from({ length: 7 }, (_, i) => rect(36, 12 + i * 12, 10, 6) + rect(54, 12 + i * 12, 10, 6)).join('')),
  pitch: () => svg(rect(8, 18, 84, 64) + rect(8, 42, 14, 16) + rect(78, 42, 14, 16) + circle(50, 50, 8)),
  bus: () => svg(rect(6, 32, 88, 42, 6) + circle(26, 82, 10) + circle(74, 82, 10) + Array.from({ length: 4 }, (_, i) => rect(16 + i * 18, 40, 12, 14)).join('')),
  car: () => svg(path('M8 58 H92 L86 76 H14 Z') + path('M24 58 L34 38 H66 L76 58') + circle(28, 80, 10) + circle(72, 80, 10)),
  bike: () => svg(circle(24, 70, 16) + circle(76, 70, 16) + path('M24 70 L46 38 H66 L76 70 M46 38 L56 70 M56 38 V24 H68')),
  rocket: () => svg(path('M40 92 H60 V28 L50 4 L40 28 Z') + path('M40 70 L24 92 M60 70 L76 92')),
  earth: () => svg(circle(50, 50, 36) + path('M18 40 Q40 34 50 50 Q62 38 82 44 M28 62 Q50 74 72 62')),
  moon: () => svg(circle(50, 50, 34) + circle(36, 40, 7) + circle(62, 56, 9)),
  sun: () => svg(circle(50, 50, 26) + Array.from({ length: 8 }, (_, i) => {
    const a = (i / 8) * Math.PI * 2;
    return path(`M${(50 + Math.cos(a) * 30).toFixed(1)} ${(50 + Math.sin(a) * 30).toFixed(1)} L${(50 + Math.cos(a) * 46).toFixed(1)} ${(50 + Math.sin(a) * 46).toFixed(1)}`);
  }).join('')),
  saturn: () => svg(circle(50, 50, 26) + ellipse(50, 50, 44, 10)),
  elephant: () => svg(ellipse(55, 55, 30, 24) + circle(28, 40, 14) + path('M20 48 Q4 78 24 84') + path('M42 78 L40 96 M64 78 L70 96')),
  giraffe: () => svg(ellipse(55, 78, 20, 12) + path('M50 66 L52 14') + circle(52, 10, 7) + path('M42 88 L40 98 M62 88 L66 98')),
  whale: () => svg(path('M4 55 Q44 26 84 50 Q96 56 90 66 Q48 84 14 70 Q0 60 4 55 Z') + path('M68 34 L76 8 L88 36')),
  fish: () => svg(path('M10 50 L70 30 L70 70 Z') + path('M70 50 L95 35 L95 65 Z') + circle(30, 48, 3)),
  bird: () => svg(ellipse(50, 55, 26, 16) + path('M20 50 Q4 30 22 44') + path('M74 44 L94 34 L80 56') + circle(30, 48, 5)),
  cat: () => svg(ellipse(55, 60, 26, 16) + path('M30 40 L24 18 L40 34 M48 34 L54 16 L62 36') + circle(34, 42, 11) + path('M78 55 Q94 48 84 72')),
  dog: () => svg(ellipse(55, 58, 28, 16) + circle(28, 48, 11) + path('M42 74 L40 96 M60 74 L66 96') + path('M80 52 Q96 42 86 72')),
  tree: () => svg(rect(44, 55, 12, 40) + path('M50 10 L78 55 H22 Z') + path('M50 25 L82 70 H18 Z')),
  mountain: () => svg(path('M8 90 L34 28 L50 55 L66 18 L92 90 Z')),
  human: () => svg(circle(50, 16, 10) + rect(42, 28, 16, 28, 3) + path('M42 32 L22 55 M58 32 L78 55 M42 56 L32 92 M58 56 L68 92')),
  a4: () => svg(rect(28, 6, 44, 88)),
  phone: () => svg(rect(32, 6, 36, 88, 6) + rect(38, 16, 24, 52, 2) + circle(50, 82, 4)),
  coin: () => svg(circle(50, 50, 34)),
  bottle: () => svg(rect(36, 34, 28, 56, 4) + rect(42, 14, 16, 22) + rect(40, 6, 20, 10, 2)),
  football: () => svg(circle(50, 50, 36) + path('M50 18 L62 40 L50 46 L38 40 Z')),
  basketball: () => svg(circle(50, 50, 36) + path('M50 14 V86 M14 50 H86 M22 30 Q50 50 78 30 M22 70 Q50 50 78 70'))
};

function animalSide(seed) {
  const bodyRx = 26 + (seed % 10);
  const bodyRy = 12 + (seed % 8);
  const head = 8 + (seed % 6);
  const legs = seed % 3 !== 0;
  let s = ellipse(55, 58, bodyRx, bodyRy) + circle(28, 52, head);
  if (legs) s += path('M42 72 L40 94 M60 72 L66 94');
  if (seed % 2 === 0) s += path('M80 55 Q96 45 88 72');
  if (seed % 5 === 0) s += path('M24 40 L16 18 L32 38');
  return svg(s);
}

function tallTower(seed) {
  const top = 6 + (seed % 12);
  return svg(rect(36, top, 28, 94 - top) + rect(40, top - 4, 20, 8));
}

function vehicleSide(seed) {
  const h = 28 + (seed % 16);
  const top = 70 - h;
  const cabin = seed % 2
    ? path(`M24 ${top} L34 ${50 - (seed % 10)} H66 L76 ${top}`)
    : '';
  return svg(
    rect(8, top, 84, h, 4) +
    circle(28, 82, 9 + (seed % 4)) +
    circle(72, 82, 9 + (seed % 4)) +
    cabin
  );
}

function blobFromSeed(seed) {
  const n = 5 + (seed % 4);
  const pts = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const r = 28 + ((seed >> i) % 17);
    pts.push([50 + Math.cos(a) * r, 50 + Math.sin(a) * r]);
  }
  return svg(poly(pts.map(([x, y]) => [x.toFixed(1), y.toFixed(1)])));
}

function renderShape(shapeKey) {
  const key = String(shapeKey || 'blob');
  if (SPECIAL[key]) return SPECIAL[key]();

  const seed = hash(key);
  const family = seed % 7;

  // Heuristics by name fragments
  if (/ball|coin|planet|disc|orange|apple|tomato|egg|watch|ring/.test(key)) {
    return svg(circle(50, 50, 28 + (seed % 10)));
  }
  if (/snake|worm|cable|hose|rope|eel/.test(key)) {
    return svg(path(`M8 50 Q30 ${30 + (seed % 20)} 50 50 Q70 ${70 - (seed % 20)} 92 50`));
  }
  if (/bird|eagle|owl|duck|swan|parrot|bat|flamingo|stork|penguin|chicken|turkey|peacock|falcon|vulture|humming|toucan|pelican|colibri/.test(key)) {
    return SPECIAL.bird();
  }
  if (/fish|shark|dolphin|whale|orca|seal|manta|seahorse/.test(key)) {
    return SPECIAL.fish();
  }
  if (/car|van|truck|bus|semi|ambulance|police|fire|tractor|kart|f1|rally|suv|sedan|wagon|pickup|camper|coach|metro|train|tram|loco/.test(key)) {
    return vehicleSide(seed);
  }
  if (/tower|skyscraper|building|bigben|eiffel|obelisk|lighthouse|pole|streetlamp|ladder/.test(key)) {
    return tallTower(seed);
  }
  if (/tree|fir|palm|sequoia|baobab|bamboo/.test(key)) {
    return SPECIAL.tree();
  }
  if (/mountain|everest|canyon|dune|pyramid/.test(key)) {
    return SPECIAL.mountain();
  }
  if (/country|city|geo|island|lake|sea|france|italy|usa|china|japan|brazil|india|africa|canada|mexico|russia|australia/.test(key)) {
    return blobFromSeed(seed ^ 0xabc);
  }

  if (family === 0) return animalSide(seed);
  if (family === 1) return svg(rect(18 + (seed % 10), 18, 60, 64, 4 + (seed % 8)));
  if (family === 2) return svg(ellipse(50, 50, 34, 18 + (seed % 14)));
  if (family === 3) return tallTower(seed);
  if (family === 4) return vehicleSide(seed);
  if (family === 5) return svg(path('M50 8 L90 90 H10 Z'));
  return blobFromSeed(seed);
}

function normalizeSvg(svgText) {
  let s = String(svgText || '');
  if (!s.includes('viewBox=')) {
    s = s.replace('<svg', '<svg viewBox="0 0 100 100"');
  }
  s = s.replace(/\sfill="(?!#000)[^"]*"/gi, ' fill="#000"');
  return s.endsWith('\n') ? s : `${s}\n`;
}

module.exports = { renderShape, normalizeSvg, SPECIAL };
