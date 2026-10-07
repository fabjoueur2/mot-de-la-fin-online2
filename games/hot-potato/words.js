'use strict';

/** Mots de départ (évite K/W/Y en finale quand possible). */
const SEEDS = [
  'pain', 'chat', 'soleil', 'maison', 'livre', 'fleur', 'table', 'porte',
  'ville', 'route', 'neige', 'plage', 'café', 'pomme', 'lampe', 'chaise',
  'oiseau', 'train', 'musique', 'jardin', 'école', 'rivière', 'montagne',
  'fenêtre', 'voiture', 'fromage', 'chocolat', 'orange', 'banane', 'tomate',
  'souris', 'canapé', 'miroir', 'valise', 'bureau', 'cuisine', 'salon',
  'étoile', 'nuage', 'orage', 'forêt', 'désert', 'océan', 'bateau', 'avion',
  'guitare', 'piano', 'danse', 'sport', 'ballon', 'tennis', 'pizza', 'soupe'
];

const THEMES = [
  'Libre',
  'Cuisine',
  'Animaux',
  'Voyage',
  'Maison',
  'Nature',
  'Sport',
  'École',
  'Ville',
  'Fêtes'
];

function pickSeed(exclude = []) {
  const excl = new Set(exclude.map((w) => String(w).toLowerCase()));
  const pool = SEEDS.filter((w) => !excl.has(w));
  const list = pool.length ? pool : SEEDS;
  return list[Math.floor(Math.random() * list.length)];
}

function pickTheme(fromList) {
  const pool = Array.isArray(fromList) && fromList.length
    ? fromList.filter((t) => THEMES.includes(t))
    : THEMES;
  const list = pool.length ? pool : THEMES;
  return list[Math.floor(Math.random() * list.length)];
}

module.exports = { SEEDS, THEMES, pickSeed, pickTheme };
