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
  /** Vélo cargo : deux roues + caisse avant (pas une voiture). */
  cargobike: () =>
    svg(
      circle(22, 72, 14) +
        circle(78, 72, 14) +
        path('M22 72 L38 48 L52 48 L52 72 M38 48 L48 28 H58 L58 48') +
        rect(4, 38, 36, 28, 3) +
        rect(8, 42, 28, 18, 2)
    ),
  /** Palette EUR (logistique), pas palette de peintre. */
  pallet: () =>
    svg(
      rect(6, 58, 88, 8, 1) +
        rect(10, 66, 12, 10) +
        rect(44, 66, 12, 10) +
        rect(78, 66, 12, 10) +
        rect(8, 52, 84, 6, 1)
    ),
  rocket: () => svg(path('M40 92 H60 V28 L50 4 L40 28 Z') + path('M40 70 L24 92 M60 70 L76 92')),
  earth: () => svg(circle(50, 50, 36) + path('M18 40 Q40 34 50 50 Q62 38 82 44 M28 62 Q50 74 72 62')),
  moon: () => svg(circle(50, 50, 34) + circle(36, 40, 7) + circle(62, 56, 9)),
  sun: () => svg(circle(50, 50, 26) + Array.from({ length: 8 }, (_, i) => {
    const a = (i / 8) * Math.PI * 2;
    return path(`M${(50 + Math.cos(a) * 30).toFixed(1)} ${(50 + Math.sin(a) * 30).toFixed(1)} L${(50 + Math.cos(a) * 46).toFixed(1)} ${(50 + Math.sin(a) * 46).toFixed(1)}`);
  }).join('')),
  saturn: () => svg(circle(50, 50, 26) + ellipse(50, 50, 44, 10)),
  jupiter: () =>
    svg(
      circle(50, 50, 30) +
        Array.from({ length: 5 }, (_, i) => rect(22, 28 + i * 9, 56, 4, 1)).join('')
    ),
  planet: () => svg(circle(50, 50, 32)),
  mars: () => svg(circle(50, 50, 30) + circle(38, 42, 4) + circle(58, 55, 3) + circle(45, 58, 2)),
  asteroid: () => svg(path('M30 45 L55 22 L78 38 L72 68 L48 82 L22 70 Z') + circle(52, 48, 5)),
  galaxy: () =>
    svg(
      circle(50, 50, 10) +
        path('M50 50 Q20 30 8 50 Q22 72 50 50 Q78 72 92 50 Q80 28 50 50') +
        ellipse(50, 50, 38, 14)
    ),
  rings: () => svg(ellipse(50, 52, 46, 12) + ellipse(50, 52, 32, 8)),
  iss: () =>
    svg(
      rect(18, 46, 64, 8, 2) +
        rect(8, 42, 12, 16) +
        rect(80, 42, 12, 16) +
        Array.from({ length: 4 }, (_, i) => rect(22 + i * 14, 28, 10, 18)).join('')
    ),
  spacestation: () => svg(rect(12, 44, 76, 14, 3) + rect(4, 40, 10, 22) + rect(86, 40, 10, 22) + circle(50, 38, 8)),
  comet: () => svg(circle(72, 38, 12) + path('M72 38 Q40 48 8 58 Q36 52 60 44 Z')),
  hubble: () => svg(rect(20, 42, 60, 16, 4) + rect(44, 28, 12, 14) + circle(28, 50, 6)),
  rover: () => svg(rect(24, 48, 52, 22, 4) + circle(32, 76, 8) + circle(68, 76, 8) + rect(38, 36, 24, 12, 2)),
  apollo: () => svg(path('M38 92 L50 20 L62 92 Z') + rect(42, 48, 16, 28, 2)),
  jellyfish: () =>
    svg(path('M28 52 Q50 28 72 52 Q68 72 50 76 Q32 72 28 52 Z') + path('M36 76 L32 94 M44 78 L42 96 M56 78 L58 96 M64 76 L68 94')),
  trex: () => svg(path('M18 70 Q40 38 70 42 Q88 48 82 68 L70 92 H34 Z') + path('M70 42 L88 28') + circle(76, 38, 4)),
  yak: () => svg(ellipse(55, 58, 28, 16) + circle(28, 48, 12) + path('M22 40 L14 22 L30 36 M38 36 L42 18 L48 34') + path('M42 74 L38 92 M58 74 L62 92')),
  ant: () => svg(ellipse(50, 55, 22, 14) + circle(72, 48, 8) + path('M28 55 L12 48 M28 58 L10 62 M28 61 L14 72') + path('M72 48 L88 42')),
  potato: () => svg(path('M30 50 Q28 28 50 24 Q78 26 74 52 Q72 78 48 80 Q26 76 30 50 Z')),
  sunflower: () => svg(circle(50, 50, 14) + Array.from({ length: 10 }, (_, i) => {
    const a = (i / 10) * Math.PI * 2;
    return ellipse(50 + Math.cos(a) * 26, 50 + Math.sin(a) * 26, 8, 16);
  }).join('')),
  pinecone: () => svg(path('M50 12 L62 38 L58 68 L50 88 L42 68 L38 38 Z') + path('M44 32 H56 M42 48 H58 M44 62 H56')),
  rock: () => svg(path('M22 62 Q28 38 48 34 Q72 32 80 52 Q84 72 62 82 Q38 88 22 62 Z')),
  treetrunk: () => svg(rect(40, 20, 20, 72, 4) + path('M32 20 Q50 8 68 20')),
  pingpong: () => svg(circle(50, 50, 10)),
  pingpongtable: () => svg(rect(8, 42, 84, 36, 2) + rect(12, 78, 6, 14) + rect(82, 78, 6, 14) + path('M8 60 H92')),
  glider: () => svg(path('M10 55 L50 35 L90 55 L50 48 Z') + path('M50 48 L50 75')),
  excavator: () => svg(rect(22, 50, 40, 22, 3) + circle(34, 78, 8) + circle(58, 78, 8) + path('M62 52 L88 38 L84 48 L62 58')),
  cargoship: () => svg(path('M8 58 H92 V72 H8 Z') + rect(20, 42, 50, 16) + rect(72, 46, 12, 12)),
  carrier: () => svg(path('M6 62 H94 V78 H6 Z') + rect(30, 38, 40, 24) + path('M70 38 L90 50 V62 H70')),
  caravan: () => svg(rect(14, 40, 72, 32, 4) + circle(28, 78, 9) + circle(68, 78, 9) + rect(18, 44, 20, 14)),
  railcar: () => svg(rect(10, 38, 80, 34, 4) + circle(28, 78, 10) + circle(72, 78, 10)),
  bridge: () => svg(path('M8 70 Q50 30 92 70') + rect(8, 70, 8, 22) + rect(84, 70, 8, 22)),
  city: () =>
    svg(
      Array.from({ length: 5 }, (_, i) => {
        const h = 28 + (i % 3) * 18;
        return rect(12 + i * 16, 92 - h, 12, h);
      }).join('')
    ),
  lake: () => svg(path('M8 55 Q30 40 50 55 Q70 70 92 55 Q70 85 50 88 Q30 85 8 55 Z')),
  sea: () => svg(path('M4 62 Q25 48 50 62 T96 62 V92 H4 Z')),
  christ: () => svg(circle(50, 14, 8) + path('M42 24 L42 88 M58 24 L58 88 M42 38 L22 58 M58 38 L78 58')),
  sequoia: () => svg(rect(44, 50, 12, 42) + path('M50 12 L78 50 H22 Z') + path('M50 28 L72 58 H28 Z')),
  manhattan: () => svg(Array.from({ length: 6 }, (_, i) => rect(10 + i * 14, 90 - (20 + (i % 4) * 15), 10, 20 + (i % 4) * 15)).join('')),
  ringbox: () => svg(rect(30, 40, 40, 36, 4) + circle(50, 52, 10)),
  boxingring: () => svg(rect(18, 38, 64, 44, 2) + path('M18 38 L8 28 M82 38 L92 28')),
  snowflake: () =>
    svg(
      Array.from({ length: 6 }, (_, i) => {
        const a = (i / 6) * Math.PI * 2;
        const x2 = (50 + Math.cos(a) * 38).toFixed(1);
        const y2 = (50 + Math.sin(a) * 38).toFixed(1);
        return path(`M50 50 L${x2} ${y2}`);
      }).join('')
    ),
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
  basketball: () => svg(circle(50, 50, 36) + path('M50 14 V86 M14 50 H86 M22 30 Q50 50 78 30 M22 70 Q50 50 78 70')),
  /** Frisbee / disque volant : ellipse plate (silhouette monochrome). */
  frisbee: () => svg(ellipse(50, 52, 42, 16) + ellipse(50, 52, 20, 7)),
  discus: () => svg(ellipse(50, 50, 34, 14) + ellipse(50, 50, 22, 8)),
  jumbo: () =>
    svg(
      path('M8 58 L28 52 L55 48 L88 52 L92 58 L88 64 L55 62 L28 66 Z') +
        path('M40 50 L50 28 L62 50') +
        path('M70 52 L92 40 L88 54') +
        ellipse(22, 58, 10, 6)
    ),
  stonehenge: () =>
    svg(rect(18, 48, 14, 40) + rect(68, 48, 14, 40) + rect(16, 36, 68, 14, 2)),
  greatwall: () =>
    svg(
      path('M4 70 L20 48 L36 62 L52 40 L68 58 L84 44 L96 70 V88 H4 Z') +
        Array.from({ length: 5 }, (_, i) => rect(10 + i * 16, 34, 10, 12)).join('')
    ),
  machu: () =>
    svg(
      path('M8 80 L28 50 L50 62 L72 42 L92 80 Z') +
        rect(20, 58, 18, 22) +
        rect(48, 52, 16, 28) +
        rect(68, 60, 14, 20)
    ),
  petronas: () =>
    svg(
      rect(22, 20, 18, 72) +
        rect(60, 20, 18, 72) +
        path('M40 32 H60 V42 H40 Z') +
        path('M28 12 L31 20 H31 L34 12 Z') +
        path('M66 12 L69 20 H69 L72 12 Z')
    ),
  icecream: () =>
    svg(path('M36 48 L50 92 L64 48 Z') + circle(50, 38, 18) + circle(40, 34, 8) + circle(60, 34, 8)),
  trunk: () => svg(rect(40, 18, 20, 72, 4) + path('M32 18 Q50 6 68 18') + path('M36 40 H64 M38 58 H62')),
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
  if (/frisbee/.test(key)) return SPECIAL.frisbee();
  if (/discus/.test(key)) return SPECIAL.discus();
  if (/puck/.test(key)) return svg(ellipse(50, 55, 34, 12) + ellipse(50, 50, 34, 12) + rect(16, 50, 68, 6));
  if (/ball|coin|planet|disc|orange|apple|tomato|egg|watch|ring/.test(key)) {
    return svg(circle(50, 50, 28 + (seed % 10)));
  }
  if (/jumbo|boeing|airplane|airliner|a320|a380/.test(key)) return SPECIAL.jumbo();
  if (/stonehenge/.test(key)) return SPECIAL.stonehenge();
  if (/greatwall|wall/.test(key) && /great|chine|china|machu/.test(key)) {
    return /machu/.test(key) ? SPECIAL.machu() : SPECIAL.greatwall();
  }
  if (/machu/.test(key)) return SPECIAL.machu();
  if (/petronas/.test(key)) return SPECIAL.petronas();
  if (/icecream|glace|cornet/.test(key)) return SPECIAL.icecream();
  if (/^trunk$|treetrunk|oaktrunk/.test(key)) return SPECIAL.trunk();
  if (/snake|worm|cable|hose|rope|eel/.test(key)) {
    return svg(path(`M8 50 Q30 ${30 + (seed % 20)} 50 50 Q70 ${70 - (seed % 20)} 92 50`));
  }
  if (/bird|eagle|owl|duck|swan|parrot|bat|flamingo|stork|penguin|chicken|turkey|peacock|falcon|vulture|humming|toucan|pelican|colibri/.test(key)) {
    return SPECIAL.bird();
  }
  if (/fish|shark|dolphin|whale|orca|seal|manta|seahorse/.test(key)) {
    return SPECIAL.fish();
  }
  if (key === 'cargobike') return SPECIAL.cargobike();
  if (key === 'pallet') return SPECIAL.pallet();
  if (/^bike$|bicycle|velo/.test(key)) return SPECIAL.bike();
  if (
    /(?:^|[-_])(car|van|truck|bus|semi|suv|sedan|wagon|pickup|camper|coach|metro|train|tram|loco)(?:[-_]|$)|^(car|van|truck|bus|tractor|kart|f1|rally|ambulance|police|fire)$/.test(
      key
    )
  ) {
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
