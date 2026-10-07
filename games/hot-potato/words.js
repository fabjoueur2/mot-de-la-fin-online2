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
  'Fruits',
  'Légumes',
  'Boissons',
  'Desserts',
  'Fromages',
  'Plats du monde',
  'Fast-food',
  'Apéro',
  'Animaux',
  'Animaux de compagnie',
  'Oiseaux',
  'Poissons',
  'Insectes',
  'Dinosaures',
  'Ferme',
  'Zoo',
  'Nature',
  'Forêt',
  'Mer',
  'Montagne',
  'Désert',
  'Jardin',
  'Fleurs',
  'Arbres',
  'Météo',
  'Saisons',
  'Espace',
  'Maison',
  'Meubles',
  'Objets du quotidien',
  'Outils',
  'Bricolage',
  'Vêtements',
  'Chaussures',
  'Couleurs',
  'Corps humain',
  'Émotions',
  'Famille',
  'Métiers',
  'École',
  'Matières scolaires',
  'Travail',
  'Shopping',
  'Voyage',
  'Vacances',
  'Plage',
  'Transports',
  'Voitures',
  'Avions',
  'Bateaux',
  'Ville',
  'Pays',
  'Monuments',
  'Histoire',
  'Mythologie',
  'Sport',
  'Football',
  'Tennis',
  'Basket',
  'Ski',
  'Musique',
  'Chansons',
  'Cinéma',
  'Séries',
  'Jeux vidéo',
  'BD & manga',
  'Livres',
  'Super-héros',
  'Fantasy',
  'Science-fiction',
  'Horreur',
  'Disney',
  'Anime',
  'Technologie',
  'Internet',
  'Réseaux sociaux',
  'Fêtes',
  'Noël',
  'Halloween',
  'Mariage',
  'Anniversaire',
  'Cirque',
  'Magie',
  'Pirates',
  'Chevaliers',
  'Robots',
  'Monstres',
  'Fantômes',
  'Zombies',
  'Dragons',
  'Expressions',
  'Blagues',
  'Marques',
  'Années 80',
  'Années 90',
  'Années 2000',
  'Nostalgie',
  'Enfance'
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
