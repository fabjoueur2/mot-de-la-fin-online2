/**
 * Silhouettes procédurales curatées pour les assets marqués « mauvais » en review.
 * Objectif : formes immédiatement reconnaissables (soirée), pas d’homonymes SVG Repo.
 */
'use strict';

function svg(inner, vb = '0 0 100 100') {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vb}"><g fill="#000">${inner}</g></svg>\n`;
}
function poly(pts) {
  return `<polygon points="${pts.map(([x, y]) => `${x},${y}`).join(' ')}"/>`;
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

/** @type {Record<string, () => string>} */
const CURATED = {
  // —— animals ——
  mouse: () =>
    svg(
      ellipse(52, 58, 26, 16) +
        circle(28, 48, 12) +
        path('M22 40 L12 22 L28 36') +
        path('M78 55 Q94 48 86 72') +
        path('M42 72 L40 90 M58 72 L60 90')
    ),
  cow: () =>
    svg(
      ellipse(55, 58, 30, 18) +
        circle(24, 48, 14) +
        path('M18 38 L12 24 L26 36 M30 36 L34 22 L40 36') +
        path('M40 74 L36 94 M70 74 L74 94') +
        ellipse(18, 54, 8, 5)
    ),
  kangaroo: () =>
    svg(
      path('M42 88 L48 50 L62 28 L74 22') +
        ellipse(58, 42, 14, 18) +
        path('M48 50 L28 72 L36 88') +
        path('M62 55 L78 78') +
        path('M70 28 L86 18')
    ),
  crocodile: () =>
    svg(
      path('M6 58 Q40 42 70 52 Q90 56 94 62 Q70 72 40 68 Q16 70 6 58 Z') +
        path('M70 52 L88 40 L92 48') +
        Array.from({ length: 5 }, (_, i) => rect(18 + i * 10, 46, 6, 5)).join('')
    ),

  // —— everyday ——
  coin: () => svg(circle(50, 50, 34) + circle(50, 50, 26) + path('M44 38 V62 H56 V54 H50')),
  usb: () =>
    svg(rect(30, 18, 40, 52, 4) + rect(38, 70, 24, 18) + rect(42, 24, 6, 14) + rect(52, 24, 6, 14)),
  phone: () => svg(rect(34, 8, 32, 84, 6) + rect(38, 18, 24, 52, 2) + circle(50, 82, 4)),
  tablet: () => svg(rect(18, 12, 64, 76, 6) + rect(24, 20, 52, 56, 2) + circle(50, 82, 3)),
  disc: () => svg(circle(50, 50, 36) + circle(50, 50, 10) + circle(50, 50, 4)),
  mug: () => svg(rect(22, 28, 42, 52, 6) + path('M64 36 H78 Q86 50 78 64 H64') + rect(26, 22, 34, 8, 2)),
  glass: () => svg(path('M30 20 H70 L64 88 H36 Z') + rect(34, 8, 32, 12, 2)),
  can: () => svg(ellipse(50, 18, 22, 8) + rect(28, 18, 44, 64) + ellipse(50, 82, 22, 8)),
  tin: () => svg(ellipse(50, 22, 28, 10) + rect(22, 22, 56, 56) + ellipse(50, 78, 28, 10)),
  plate: () => svg(ellipse(50, 52, 42, 28) + ellipse(50, 52, 28, 16)),
  fork: () =>
    svg(
      path('M28 8 V40 M40 8 V40 M52 8 V40') +
        path('M28 40 H52 V48 H44 V92 H36 V48 H28 Z')
    ),
  knife: () => svg(path('M42 8 L58 12 L52 70 H40 Z') + rect(42, 70, 10, 22, 2)),
  ruler: () =>
    svg(
      rect(18, 40, 64, 20, 2) +
        Array.from({ length: 8 }, (_, i) => rect(24 + i * 7, 40, 2, i % 2 ? 8 : 12)).join('')
    ),
  tapemeasure: () =>
    svg(circle(42, 52, 28) + rect(62, 44, 28, 16, 3) + circle(42, 52, 8)),
  umbrella: () =>
    svg(path('M18 48 Q50 18 82 48 Z') + path('M50 48 V88') + path('M50 88 Q60 92 58 84')),
  chair: () =>
    svg(rect(28, 18, 44, 8) + rect(30, 26, 8, 50) + rect(62, 26, 8, 50) + rect(28, 48, 44, 8)),
  table: () => svg(rect(14, 42, 72, 10) + rect(22, 52, 8, 30) + rect(70, 52, 8, 30)),
  door: () => svg(rect(28, 8, 44, 84, 2) + circle(60, 52, 4) + rect(34, 14, 32, 70)),
  tv: () => svg(rect(10, 22, 80, 52, 4) + rect(18, 30, 64, 36) + path('M40 74 L30 90 H70 L60 74')),
  keyboard: () =>
    svg(
      rect(8, 38, 84, 28, 4) +
        Array.from({ length: 12 }, (_, i) => rect(14 + i * 6, 44, 4, 4)).join('') +
        Array.from({ length: 10 }, (_, i) => rect(18 + i * 6, 52, 4, 4)).join('')
    ),
  speaker: () =>
    svg(rect(28, 16, 44, 68, 6) + circle(50, 40, 12) + circle(50, 66, 8) + circle(50, 40, 4)),
  outlet: () => svg(rect(28, 18, 44, 64, 6) + circle(42, 42, 5) + circle(58, 42, 5) + path('M42 62 H58 V70 H42 Z')),
  switch: () => svg(rect(30, 16, 40, 68, 6) + rect(40, 36, 20, 28, 3)),
  glasses: () =>
    svg(
      circle(32, 50, 16) +
        circle(68, 50, 16) +
        path('M48 50 H52') +
        path('M16 50 H8') +
        path('M84 50 H92')
    ),
  bucket: () => svg(path('M28 28 H72 L68 88 H32 Z') + path('M28 28 Q50 12 72 28')),
  wateringcan: () =>
    svg(
      path('M24 40 H62 L58 78 H28 Z') +
        path('M62 48 L88 36 L90 44 L66 58') +
        path('M34 40 Q40 22 54 40')
    ),
  rake: () =>
    svg(
      path('M50 8 V70') +
        path('M20 70 H80') +
        Array.from({ length: 7 }, (_, i) => path(`M${22 + i * 9} 70 V92`)).join('')
    ),
  ladder: () =>
    svg(
      path('M28 8 V92 M72 8 V92') +
        Array.from({ length: 7 }, (_, i) => path(`M28 ${16 + i * 11} H72`)).join('')
    ),
  stepladder: () =>
    svg(
      path('M30 90 L42 20 L58 20 L70 90') +
        path('M36 70 H64 M38 50 H62 M40 34 H60')
    ),
  scooter: () =>
    svg(
      circle(28, 78, 12) +
        circle(78, 78, 12) +
        path('M28 78 L50 40 H70') +
        path('M50 40 V78') +
        path('M70 40 V28 H80')
    ),
  skateboard: () =>
    svg(path('M12 48 Q50 36 88 48 Q50 60 12 48 Z') + circle(28, 58, 7) + circle(72, 58, 7)),
  bag: () =>
    svg(path('M28 40 H72 L68 88 H32 Z') + path('M36 40 Q50 18 64 40') + path('M42 52 H58')),
  box: () => svg(path('M20 38 L50 22 L80 38 L50 54 Z') + path('M20 38 V78 L50 94 V54') + path('M80 38 V78 L50 94')),
  container: () =>
    svg(
      rect(10, 30, 80, 48, 2) +
        Array.from({ length: 4 }, (_, i) => path(`M${26 + i * 16} 30 V78`)).join('') +
        rect(10, 26, 80, 6)
    ),
  bin: () => svg(path('M30 28 H70 L66 88 H34 Z') + rect(26, 20, 48, 10, 2) + path('M42 40 V70 M50 40 V70 M58 40 V70')),
  mailbox: () =>
    svg(rect(28, 28, 44, 36, 6) + rect(46, 64, 8, 28) + path('M28 36 H72') + circle(60, 48, 4)),
  stopsign: () =>
    svg(poly([[50, 10], [78, 22], [90, 50], [78, 78], [50, 90], [22, 78], [10, 50], [22, 22]]) + rect(46, 90, 8, 8)),
  trafficlight: () =>
    svg(rect(36, 8, 28, 72, 8) + circle(50, 24, 8) + circle(50, 44, 8) + circle(50, 64, 8) + rect(46, 80, 8, 16)),
  pole: () =>
    svg(rect(46, 8, 8, 84) + path('M20 28 H80') + path('M20 28 V40 M80 28 V40') + path('M30 40 V52 M70 40 V52')),
  extension: () =>
    svg(path('M10 50 Q30 30 50 50 Q70 70 90 50') + rect(4, 44, 12, 12, 2) + rect(84, 44, 12, 12, 2)),
  hose: () => svg(path('M8 40 Q30 20 50 40 Q70 60 92 40') + path('M8 52 Q30 32 50 52 Q70 72 92 52') + circle(92, 46, 6)),
  balloon: () => svg(ellipse(50, 38, 24, 30) + path('M50 68 L46 88 H54 Z') + path('M50 88 Q60 96 48 98')),
  lighter: () => svg(rect(38, 30, 24, 55, 4) + path('M42 30 L50 10 L58 30') + rect(42, 40, 16, 8)),
  soap: () => svg(ellipse(50, 55, 34, 22) + ellipse(50, 48, 28, 14)),

  // —— vehicles ——
  escooter: () =>
    svg(circle(26, 78, 11) + circle(78, 78, 11) + path('M26 78 L48 42 H68') + path('M48 42 V78') + path('M68 42 V26 H78') + rect(54, 48, 14, 10)),
  atv: () =>
    svg(
      circle(24, 78, 14) +
        circle(76, 78, 14) +
        path('M18 58 H82 L74 72 H26 Z') +
        path('M34 58 L42 40 H58 L66 58') +
        path('M48 40 V28')
    ),
  wagon: () =>
    svg(
      path('M8 58 H92 L86 76 H14 Z') +
        path('M24 58 L30 40 H78 L84 58') +
        circle(28, 80, 10) +
        circle(72, 80, 10) +
        path('M78 40 L92 48')
    ),
  van: () =>
    svg(rect(8, 34, 84, 40, 4) + path('M8 34 L28 20 H70 L92 34') + circle(28, 82, 10) + circle(74, 82, 10) + rect(34, 28, 22, 14)),
  bus: () =>
    svg(
      rect(6, 28, 88, 46, 6) +
        circle(26, 82, 10) +
        circle(74, 82, 10) +
        Array.from({ length: 4 }, (_, i) => rect(16 + i * 18, 36, 12, 16)).join('')
    ),
  articbus: () =>
    svg(
      rect(4, 34, 44, 40, 4) +
        rect(52, 34, 44, 40, 4) +
        path('M48 50 H52') +
        circle(20, 82, 9) +
        circle(40, 82, 9) +
        circle(68, 82, 9) +
        circle(88, 82, 9)
    ),
  coach: () =>
    svg(rect(6, 30, 88, 44, 6) + circle(24, 82, 10) + circle(76, 82, 10) + Array.from({ length: 5 }, (_, i) => rect(14 + i * 14, 38, 10, 14)).join('')),
  tram: () =>
    svg(
      rect(8, 28, 84, 44, 4) +
        path('M20 28 V16 H80 V28') +
        circle(28, 80, 9) +
        circle(72, 80, 9) +
        Array.from({ length: 4 }, (_, i) => rect(16 + i * 18, 36, 12, 16)).join('')
    ),
  harvester: () =>
    svg(
      rect(20, 40, 56, 30, 4) +
        circle(34, 80, 12) +
        circle(70, 80, 12) +
        path('M20 50 L6 70 H20') +
        path('M76 40 L92 28 L92 50 L76 55') +
        rect(40, 24, 20, 16)
    ),
  excavator: () =>
    svg(rect(18, 48, 44, 24, 3) + circle(30, 80, 10) + circle(54, 80, 10) + path('M62 52 L90 28 L86 40 L64 58') + path('M86 40 L96 52 L84 52')),
  ambulance: () =>
    svg(
      rect(8, 38, 84, 36, 4) +
        path('M8 38 L28 22 H60 L72 38') +
        circle(28, 82, 10) +
        circle(74, 82, 10) +
        path('M48 44 V66 M38 55 H58')
    ),
  firetruck: () =>
    svg(
      rect(6, 40, 88, 34, 4) +
        path('M6 40 L24 24 H50 L62 40') +
        circle(26, 82, 10) +
        circle(76, 82, 10) +
        path('M70 24 V40') +
        rect(72, 12, 8, 14)
    ),
  rowboat: () => svg(path('M10 60 Q50 40 90 60 Q50 78 10 60 Z') + path('M50 48 V28') + path('M30 36 H70')),
  sup: () => svg(path('M20 55 Q50 40 80 55 Q50 68 20 55 Z') + path('M50 42 V22') + path('M44 26 H56')),
  sailboat: () =>
    svg(path('M16 72 Q50 58 84 72 L50 82 Z') + path('M50 72 V18') + path('M50 22 L78 58 H50') + path('M50 30 L28 58 H50')),
  yacht: () =>
    svg(path('M8 68 H92 L84 80 H16 Z') + rect(30, 40, 40, 28) + path('M50 40 V18') + path('M50 22 L70 48 H50')),
  cargoship: () =>
    svg(path('M4 60 H96 V78 H4 Z') + rect(16, 40, 56, 20) + Array.from({ length: 4 }, (_, i) => rect(20 + i * 12, 28, 8, 12)).join('')),
  glider: () => svg(path('M8 55 L50 42 L92 55 L50 50 Z') + path('M50 50 L50 72') + path('M42 72 H58')),
  kidscooter: () =>
    svg(circle(28, 78, 10) + circle(74, 78, 10) + path('M28 78 L48 48 H66') + path('M48 48 V78') + path('M66 48 V34 H74')),
  hoverboard: () => svg(ellipse(50, 58, 40, 12) + circle(28, 70, 8) + circle(72, 70, 8) + rect(40, 48, 20, 10, 3)),
  cartwheel: () =>
    svg(circle(28, 72, 16) + circle(72, 72, 16) + rect(20, 40, 60, 24, 3) + path('M50 40 V24') + path('M40 24 H60')),
  cargobike: () =>
    svg(
      circle(22, 72, 14) +
        circle(78, 72, 14) +
        path('M22 72 L38 48 L52 48 L52 72 M38 48 L48 28 H58 L58 48') +
        rect(4, 38, 36, 28, 3)
    ),
  minivan: () =>
    svg(path('M8 58 H92 L86 76 H14 Z') + path('M20 58 L30 36 H78 L88 58') + circle(28, 80, 10) + circle(72, 80, 10)),
  camper: () =>
    svg(rect(8, 34, 84, 40, 4) + rect(20, 22, 40, 14) + circle(28, 82, 10) + circle(74, 82, 10) + rect(70, 42, 14, 18)),
  caravan: () =>
    svg(rect(14, 36, 72, 34, 4) + circle(32, 78, 10) + circle(70, 78, 10) + rect(20, 42, 24, 16) + path('M14 50 H6')),
  metro: () =>
    svg(rect(6, 30, 88, 42, 8) + circle(26, 80, 8) + circle(74, 80, 8) + Array.from({ length: 4 }, (_, i) => rect(14 + i * 18, 38, 12, 18)).join('')),
  locomotive: () =>
    svg(
      rect(12, 40, 56, 34, 3) +
        circle(28, 82, 10) +
        circle(52, 82, 10) +
        path('M68 50 H90 V74 H68') +
        rect(24, 22, 24, 18) +
        path('M36 22 V12')
    ),
  kart: () =>
    svg(circle(24, 76, 12) + circle(76, 76, 12) + path('M20 58 H80 L72 72 H28 Z') + path('M40 58 L46 40 H60') + path('M46 40 V30')),
  f1: () =>
    svg(
      path('M8 60 L30 48 H70 L92 60 L84 72 H16 Z') +
        circle(28, 78, 9) +
        circle(72, 78, 9) +
        path('M40 48 L50 32 L60 48') +
        path('M70 48 L88 40')
    ),
  rally: () =>
    svg(path('M8 58 H92 L86 76 H14 Z') + path('M24 58 L34 38 H66 L76 58') + circle(28, 80, 10) + circle(72, 80, 10) + path('M76 38 L90 46')),
  bulldozer: () =>
    svg(
      rect(28, 42, 48, 28, 3) +
        path('M20 70 H84 V84 H20 Z') +
        path('M28 50 L8 62 L8 78 H20') +
        rect(48, 28, 20, 14)
    ),
  forklift: () =>
    svg(
      rect(36, 40, 40, 32, 3) +
        circle(48, 80, 10) +
        circle(72, 80, 10) +
        path('M36 48 H16 V80 H24 V56 H36') +
        path('M16 48 V28 H24 V48')
    ),
  policecar: () =>
    svg(
      path('M8 58 H92 L86 76 H14 Z') +
        path('M24 58 L34 38 H66 L76 58') +
        circle(28, 80, 10) +
        circle(72, 80, 10) +
        rect(44, 30, 12, 8)
    ),
  kayak: () => svg(path('M8 55 Q50 40 92 55 Q50 70 8 55 Z') + path('M50 48 V28') + path('M42 32 H58')),
  ferry: () =>
    svg(path('M6 62 H94 V80 H6 Z') + rect(18, 34, 64, 28) + Array.from({ length: 5 }, (_, i) => rect(24 + i * 10, 22, 6, 12)).join('')),
  carrier: () =>
    svg(path('M4 58 H96 V78 H4 Z') + rect(20, 40, 55, 18) + path('M75 40 L94 52 V58 H75') + path('M30 40 V28 H70 V40')),
  jetski: () =>
    svg(path('M14 62 Q40 48 70 52 L88 58 L80 72 Q50 78 20 72 Z') + path('M70 52 L78 36') + circle(78, 34, 5)),
  jumbo: () =>
    svg(
      path('M8 58 L28 52 L55 48 L88 52 L92 58 L88 64 L55 62 L28 66 Z') +
        path('M40 50 L50 28 L62 50') +
        path('M70 52 L92 40 L88 54') +
        ellipse(22, 58, 10, 6)
    ),
  a380: () =>
    svg(
      path('M6 58 L30 50 L60 46 L90 52 L94 58 L90 64 L60 62 L30 66 Z') +
        path('M38 50 L48 24 L60 50') +
        path('M72 50 L94 36 L90 52') +
        path('M34 62 L28 78 L40 66') +
        ellipse(18, 58, 10, 6)
    ),

  // —— sports ——
  pitch: () => svg(rect(8, 18, 84, 64) + rect(8, 42, 14, 16) + rect(78, 42, 14, 16) + circle(50, 50, 8) + path('M50 18 V82')),
  tennisball: () => svg(circle(50, 50, 34) + path('M20 35 Q50 50 80 35') + path('M20 65 Q50 50 80 65')),
  baseball: () => svg(circle(50, 50, 34) + path('M28 28 Q50 45 72 28') + path('M28 72 Q50 55 72 72')),
  cricketball: () => svg(circle(50, 50, 34) + path('M50 16 V84') + path('M28 28 Q50 50 72 28') + path('M28 72 Q50 50 72 72')),
  basketball: () => svg(circle(50, 50, 36) + path('M50 14 V86 M14 50 H86 M22 30 Q50 50 78 30 M22 70 Q50 50 78 70')),
  handball: () => svg(circle(50, 50, 34) + path('M30 30 Q50 45 70 30') + path('M30 70 Q50 55 70 70')),
  bowlingball: () => svg(circle(50, 52, 34) + circle(42, 38, 4) + circle(54, 34, 4) + circle(58, 46, 4)),
  hockeystick: () => svg(path('M62 8 L48 70 L18 82 L22 90 L58 76 L72 12 Z')),
  tennisracket: () =>
    svg(ellipse(50, 32, 22, 28) + path('M50 60 V92') + path('M42 78 H58') + path('M38 32 H62 M50 14 V50')),
  shuttlecock: () =>
    svg(circle(50, 72, 10) + path('M40 68 L28 18 H72 L60 68') + path('M36 40 H64 M40 28 H60')),
  baseballbat: () => svg(path('M46 8 H54 L58 70 H42 Z') + rect(44, 70, 12, 22, 3)),
  cue: () => svg(path('M12 55 L88 40') + path('M88 40 L92 48 L84 50') + rect(8, 50, 10, 10, 2)),
  hammerthrow: () => svg(circle(28, 32, 14) + path('M40 36 Q70 50 78 78') + path('M74 74 L88 88 M74 82 L90 78')),
  barbell: () => svg(rect(8, 40, 14, 24) + rect(78, 40, 14, 24) + rect(20, 48, 60, 8) + rect(4, 36, 8, 32) + rect(88, 36, 8, 32)),
  snowboard: () => svg(path('M22 20 Q50 10 78 20 L78 80 Q50 90 22 80 Z') + path('M36 40 H64 M36 60 H64')),
  surfboard: () => svg(path('M50 6 Q68 40 62 92 Q50 98 38 92 Q32 40 50 6 Z') + path('M50 30 V70')),
  rugbypitch: () => svg(rect(8, 16, 84, 68) + path('M50 16 V84') + rect(8, 30, 12, 40) + rect(80, 30, 12, 40)),
  basketcourt: () => svg(rect(10, 14, 80, 72) + path('M50 14 V86') + path('M10 50 H90') + path('M30 14 Q50 40 70 14')),
  pool: () => svg(rect(10, 24, 80, 52, 4) + path('M10 40 Q30 48 50 40 T90 40') + path('M10 56 Q30 64 50 56 T90 56')),
  goal: () => svg(path('M18 88 V28 H82 V88') + path('M18 28 H82') + Array.from({ length: 5 }, (_, i) => path(`M${26 + i * 12} 28 V88`)).join('')),
  pingpongtable: () => svg(rect(8, 40, 84, 36, 2) + path('M50 40 V76') + rect(12, 76, 8, 14) + rect(80, 76, 8, 14)),
  ring: () => svg(rect(16, 34, 68, 48, 2) + path('M16 34 L8 22 M84 34 L92 22') + path('M16 82 L8 92 M84 82 L92 92') + path('M34 34 V82 M66 34 V82')),
  mat: () => svg(rect(12, 24, 76, 52, 4) + path('M12 50 H88') + path('M50 24 V76')),
  bikehelmet: () => svg(path('M18 58 Q20 28 50 22 Q80 28 82 58 Q70 72 50 74 Q30 72 18 58 Z') + path('M30 40 H70')),
  motohelmet: () => svg(path('M20 60 Q22 28 50 20 Q78 28 80 60 Q70 78 50 82 Q30 78 20 60 Z') + path('M28 52 H72') + path('M50 52 V70')),
  boxglove: () => svg(ellipse(48, 48, 28, 24) + path('M70 48 Q90 40 88 60 Q80 72 68 62') + path('M30 68 L26 88 H40')),
  rugby: () => svg(ellipse(50, 50, 38, 22) + path('M30 42 Q50 50 70 42') + path('M30 58 Q50 50 70 58')),
  pin: () => svg(path('M42 8 H58 L62 70 H38 Z') + ellipse(50, 78, 16, 12) + circle(50, 18, 8)),
  badracket: () => svg(ellipse(50, 30, 18, 24) + path('M50 54 V92') + path('M42 78 H58') + path('M40 30 H60 M50 12 V48')),
  golfclub: () => svg(path('M58 8 L42 70') + path('M36 70 L52 78 L58 70 Z') + path('M52 12 H64')),
  javelin: () => svg(path('M8 55 L88 40') + path('M88 40 L96 36 L92 48 Z') + path('M20 52 L16 60')),
  polevault: () => svg(path('M48 6 V92') + path('M40 20 H60') + path('M42 92 H58')),
  discus: () => svg(ellipse(50, 50, 34, 14) + ellipse(50, 50, 22, 8)),
  kayakpolo: () => svg(path('M10 58 Q50 42 90 58 Q50 74 10 58 Z') + circle(50, 48, 10) + path('M50 38 V22')),
  tenniscourt: () => svg(rect(10, 14, 80, 72) + path('M50 14 V86') + path('M10 50 H90') + path('M22 14 V86 M78 14 V86')),
  track: () => svg(ellipse(50, 50, 42, 34) + ellipse(50, 50, 28, 20) + path('M50 16 V30 M50 70 V84')),
  hoop: () => svg(path('M40 20 H60 V40 H40 Z') + ellipse(50, 48, 18, 6) + path('M32 48 Q50 90 68 48') + path('M50 20 V8')),
  vollenet: () =>
    svg(
      path('M20 20 V80 M80 20 V80 M20 28 H80') +
        Array.from({ length: 5 }, (_, i) => path(`M20 ${36 + i * 8} H80`)).join('') +
        Array.from({ length: 5 }, (_, i) => path(`M${30 + i * 10} 28 V80`)).join('')
    ),

  // —— landmarks ——
  colosseum: () =>
    svg(
      path('M14 78 Q20 28 50 22 Q80 28 86 78 Z') +
        Array.from({ length: 6 }, (_, i) => path(`M${22 + i * 10} 40 V70`)).join('') +
        path('M20 55 H80')
    ),
  spaceneedle: () => svg(path('M44 96 L48 40 H52 L56 96 Z') + ellipse(50, 34, 16, 10) + path('M50 24 V12') + path('M34 88 H66')),
  bridge: () => svg(path('M6 70 Q50 28 94 70') + rect(6, 70, 10, 22) + rect(84, 70, 10, 22) + path('M6 70 H94') + path('M30 70 V50 M70 70 V50')),
  bridgespan: () => svg(path('M4 62 H96') + path('M4 62 Q50 28 96 62') + rect(8, 62, 8, 28) + rect(84, 62, 8, 28) + path('M30 62 V42 M70 62 V42')),
  arc: () => svg(path('M18 90 V30 H82 V90') + path('M30 90 V48 Q50 28 70 48 V90') + path('M18 30 H82')),
  montstmichel: () =>
    svg(path('M10 80 L30 50 L45 62 L58 30 L72 55 L90 80 Z') + path('M58 30 L58 12 L64 30') + rect(48, 48, 12, 20)),
  louvrepyramid: () => svg(path('M50 18 L88 82 H12 Z') + path('M50 18 L50 82') + path('M30 60 H70')),
  opera: () =>
    svg(rect(16, 48, 68, 40) + path('M16 48 Q50 18 84 48') + Array.from({ length: 5 }, (_, i) => rect(24 + i * 12, 56, 6, 24)).join('')),
  arche: () => svg(rect(12, 20, 76, 68) + path('M28 88 V40 H72 V88') + path('M12 20 H88')),
  sydneyopera: () =>
    svg(
      path('M10 78 Q28 30 48 78 Z') +
        path('M30 78 Q50 22 70 78 Z') +
        path('M50 78 Q72 34 90 78 Z') +
        path('M8 78 H92')
    ),
  lighthouse: () =>
    svg(rect(40, 28, 20, 60) + path('M36 28 H64 L58 12 H42 Z') + path('M50 12 V4') + path('M20 88 H80') + rect(44, 40, 12, 8) + rect(44, 56, 12, 8)),
  christ: () => svg(circle(50, 14, 8) + path('M42 24 L42 88 M58 24 L58 88 M42 38 L18 58 M58 38 L82 58')),
  skyscraper: () =>
    svg(
      rect(32, 8, 36, 84) +
        Array.from({ length: 8 }, (_, i) => rect(38, 14 + i * 10, 8, 5) + rect(54, 14 + i * 10, 8, 5)).join('')
    ),
  pisa: () => svg(path('M38 92 L46 10 H62 L54 92 Z') + Array.from({ length: 6 }, (_, i) => path(`M${40 + i} ${20 + i * 12} H${60 - i}`)).join('')),
  cntower: () => svg(path('M46 96 L49 16 H51 L54 96 Z') + ellipse(50, 28, 14, 8) + path('M50 16 V6') + path('M36 88 H64')),
  millau: () =>
    svg(
      path('M4 70 H96') +
        path('M20 70 V28 L28 70') +
        path('M50 70 V16 L58 70') +
        path('M80 70 V28 L88 70') +
        path('M4 70 Q50 50 96 70')
    ),
  basilica: () =>
    svg(rect(20, 48, 60, 40) + path('M20 48 Q50 18 80 48') + path('M46 18 V8 H54 V18') + Array.from({ length: 3 }, (_, i) => rect(28 + i * 16, 56, 8, 24)).join('')),
  palace: () =>
    svg(
      rect(8, 40, 84, 48) +
        Array.from({ length: 7 }, (_, i) => rect(14 + i * 11, 48, 6, 20)).join('') +
        path('M8 40 L20 24 H80 L92 40')
    ),
  sagrada: () =>
    svg(
      path('M20 90 V50 L28 20 L36 50 V90') +
        path('M40 90 V40 L50 8 L60 40 V90') +
        path('M64 90 V50 L72 20 L80 50 V90')
    ),
  parthenon: () =>
    svg(
      rect(12, 48, 76, 36) +
        path('M12 48 L50 24 L88 48') +
        Array.from({ length: 6 }, (_, i) => rect(18 + i * 12, 48, 6, 36)).join('')
    ),
  stonehenge: () => svg(rect(18, 48, 14, 40) + rect(68, 48, 14, 40) + rect(16, 36, 68, 14, 2)),
  greatwall: () =>
    svg(
      path('M4 70 L20 48 L36 62 L52 40 L68 58 L84 44 L96 70 V88 H4 Z') +
        Array.from({ length: 5 }, (_, i) => rect(10 + i * 16, 34, 10, 12)).join('')
    ),
  machu: () =>
    svg(path('M8 80 L28 50 L50 62 L72 42 L92 80 Z') + rect(20, 58, 18, 22) + rect(48, 52, 16, 28) + rect(68, 60, 14, 20)),
  moai: () =>
    svg(rect(34, 48, 32, 44) + path('M30 48 L50 12 L70 48 Z') + path('M38 28 H46 M54 28 H62') + path('M42 40 H58')),
  obelisk: () => svg(path('M42 96 L46 12 H54 L58 96 Z') + path('M46 12 L50 2 L54 12')),
  atomium: () =>
    svg(
      circle(50, 50, 10) +
        circle(24, 28, 8) +
        circle(76, 28, 8) +
        circle(24, 72, 8) +
        circle(76, 72, 8) +
        path('M50 50 L24 28 M50 50 L76 28 M50 50 L24 72 M50 50 L76 72')
    ),
  tower: () => svg(rect(36, 20, 28, 72) + path('M30 20 H70 L60 8 H40 Z') + Array.from({ length: 4 }, (_, i) => rect(42, 28 + i * 14, 16, 8)).join('')),
  petronas: () =>
    svg(
      rect(22, 20, 18, 72) +
        rect(60, 20, 18, 72) +
        path('M40 32 H60 V42 H40 Z') +
        path('M28 12 L31 20 H31 L34 12 Z') +
        path('M66 12 L69 20 H69 L72 12 Z')
    ),

  // —— food ——
  rice: () => svg(ellipse(50, 50, 10, 22)),
  coffeebean: () => svg(ellipse(50, 50, 22, 30) + path('M50 24 Q40 50 50 76 Q60 50 50 24')),
  lemon: () => svg(ellipse(50, 50, 28, 36) + path('M50 14 V8') + path('M42 20 Q50 28 58 20')),
  apple: () => svg(circle(50, 54, 28) + path('M50 28 Q58 12 66 20') + path('M44 30 Q36 22 40 16')),
  watermelon: () => svg(path('M18 40 Q50 18 82 40 Q70 88 50 90 Q30 88 18 40 Z') + path('M26 48 Q50 36 74 48')),
  melon: () => svg(ellipse(50, 52, 34, 30) + path('M50 22 V82') + path('M28 40 Q50 48 72 40')),
  coconut: () => svg(circle(50, 52, 30) + circle(40, 42, 4) + circle(52, 38, 4) + circle(60, 46, 4)),
  cucumber: () => svg(ellipse(50, 50, 16, 40) + path('M42 30 H58 M40 50 H60 M42 70 H58')),
  tomato: () => svg(circle(50, 54, 28) + path('M40 30 Q50 18 60 30') + path('M50 22 V14')),
  baguette: () => svg(path('M12 58 Q50 40 88 58 Q50 72 12 58 Z') + path('M28 50 L34 44 M46 46 L52 40 M64 48 L70 42')),
  bread: () => svg(rect(22, 34, 56, 40, 8) + path('M22 48 H78') + path('M34 34 V74 M50 34 V74 M66 34 V74')),
  egg: () => svg(ellipse(50, 52, 24, 32)),
  yogurt: () => svg(ellipse(50, 28, 24, 8) + rect(26, 28, 48, 48) + ellipse(50, 76, 24, 8) + rect(34, 18, 32, 12, 2)),
  chocolate: () =>
    svg(
      rect(20, 28, 60, 44, 2) +
        path('M20 42 H80 M20 56 H80 M40 28 V72 M60 28 V72')
    ),
  popcorn: () =>
    svg(circle(40, 48, 12) + circle(58, 42, 11) + circle(52, 58, 12) + circle(36, 60, 9) + circle(64, 56, 9)),
  zucchini: () => svg(ellipse(50, 50, 14, 40) + path('M50 12 V6') + path('M44 20 H56')),
  pepper: () => svg(path('M34 36 Q30 70 42 88 H58 Q70 70 66 36 Q50 28 34 36 Z') + path('M46 28 Q50 14 58 28')),
  croissant: () => svg(path('M18 62 Q30 30 50 40 Q70 30 82 62 Q50 78 18 62 Z') + path('M30 58 Q50 48 70 58')),
  icecream: () => svg(path('M36 48 L50 92 L64 48 Z') + circle(50, 38, 18) + circle(40, 34, 8) + circle(60, 34, 8)),
  walnut: () => svg(ellipse(50, 52, 26, 22) + path('M50 30 V74') + path('M34 42 Q50 50 66 42') + path('M34 62 Q50 54 66 62')),

  // —— space ——
  asteroid: () => svg(path('M30 45 L55 22 L78 38 L72 68 L48 82 L22 70 Z') + circle(52, 48, 5)),
  spacestation: () => svg(rect(12, 44, 76, 14, 3) + rect(4, 40, 10, 22) + rect(86, 40, 10, 22) + circle(50, 38, 8)),
  galaxy: () =>
    svg(circle(50, 50, 10) + path('M50 50 Q20 30 8 50 Q22 72 50 50 Q78 72 92 50 Q80 28 50 50') + ellipse(50, 50, 38, 14)),
  iss: () =>
    svg(
      rect(18, 46, 64, 8, 2) +
        rect(8, 42, 12, 16) +
        rect(80, 42, 12, 16) +
        Array.from({ length: 4 }, (_, i) => rect(22 + i * 14, 28, 10, 18)).join('')
    ),
  hubble: () => svg(rect(20, 42, 60, 16, 4) + rect(44, 28, 12, 14) + circle(28, 50, 6) + path('M80 42 L92 34')),
  rover: () => svg(rect(24, 48, 52, 22, 4) + circle(32, 76, 8) + circle(68, 76, 8) + rect(38, 36, 24, 12, 2) + path('M50 36 V24')),
  apollo: () => svg(path('M38 92 L50 20 L62 92 Z') + rect(42, 48, 16, 28, 2) + path('M50 20 V8')),
  rings: () => svg(ellipse(50, 52, 46, 12) + ellipse(50, 52, 32, 8) + circle(50, 52, 14)),

  // —— nature ——
  mountain: () => svg(path('M8 90 L34 28 L50 55 L66 18 L92 90 Z')),
  everest: () => svg(path('M10 90 L40 20 L55 48 L70 12 L92 90 Z') + path('M40 20 L48 34 L36 40 Z')),
  clover: () =>
    svg(
      circle(38, 40, 14) +
        circle(62, 40, 14) +
        circle(38, 62, 14) +
        circle(62, 62, 14) +
        path('M50 62 V90')
    ),
  rock: () => svg(path('M22 62 Q28 38 48 34 Q72 32 80 52 Q84 72 62 82 Q38 88 22 62 Z')),
  pinecone: () => svg(path('M50 12 L62 38 L58 68 L50 88 L42 68 L38 38 Z') + path('M44 32 H56 M42 48 H58 M44 62 H56')),
  sunflower: () =>
    svg(
      circle(50, 50, 14) +
        Array.from({ length: 10 }, (_, i) => {
          const a = (i / 10) * Math.PI * 2;
          return ellipse(50 + Math.cos(a) * 28, 50 + Math.sin(a) * 28, 8, 16);
        }).join('')
    ),
  tulip: () =>
    svg(path('M50 88 V48') + path('M36 48 Q50 12 64 48 Q58 58 50 54 Q42 58 36 48 Z') + path('M50 70 Q30 60 34 78')),
  bamboo: () =>
    svg(
      rect(42, 8, 16, 84, 2) +
        path('M42 28 H58 M42 48 H58 M42 68 H58') +
        path('M58 24 Q78 18 74 34') +
        path('M42 44 Q22 38 26 54')
    ),
  trunk: () => svg(rect(40, 18, 20, 72, 4) + path('M32 18 Q50 6 68 18') + path('M36 40 H64 M38 58 H62'))
};

function renderCuratedShape(shapeKey) {
  const key = String(shapeKey || '');
  if (CURATED[key]) return CURATED[key]();
  return null;
}

module.exports = { CURATED, renderCuratedShape };
