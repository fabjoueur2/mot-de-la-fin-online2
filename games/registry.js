/**
 * Catalogue des jeux disponibles sur la plateforme.
 * Pour ajouter un jeu :
 * 1. Créer games/<id>/index.js (moteur serveur)
 * 2. Créer public/games/<id>/ (interface client)
 * 3. L'enregistrer ici et dans server.js (gameEngines)
 */
const GAMES = [
  {
    id: 'mot-de-la-fin',
    name: 'Mot de la fin',
    tagline: 'Faites deviner des mots en équipe, avec chrono et règles tordues',
    icon: '🎯',
    color: '#ff6b6b',
    players: '2–16 joueurs',
    duration: '15–30 min',
    path: '/games/mot-de-la-fin/',
    status: 'available'
  },
  {
    id: 'animal-stacker',
    name: 'Animal Stacker',
    tagline: 'Empilez 100 animaux pixel art sans rien faire tomber — 2 équipes',
    icon: '🦊',
    color: '#5bc0eb',
    players: 'Illimité · 2 équipes',
    duration: '5–15 min',
    path: '/games/animal-stacker/',
    status: 'available'
  },
  {
    id: 'qui-dit-mieux',
    name: 'Qui dit mieux',
    tagline: 'Enchères vocales sur Discord : qui ose le plus gros défi ?',
    icon: '📣',
    color: '#ffd93d',
    players: '3–16 joueurs',
    duration: '15–40 min',
    path: '/games/qui-dit-mieux/',
    status: 'available'
  },
  {
    id: 'size-it',
    name: 'Size It !',
    tagline: 'Estime la taille réelle — silhouettes, référence, révélation collective',
    icon: '📏',
    color: '#6bcb77',
    players: '2–8 joueurs',
    duration: '5–15 min',
    path: '/games/size-it/',
    status: 'available'
  },
  {
    id: 'watchout',
    name: 'WatchOut',
    tagline: 'Same lobby. Same video. Almost. — trouve qui n’a pas vu la même chose',
    icon: '👁️',
    color: '#f59e0b',
    players: '3–12 joueurs',
    duration: '15–25 min',
    path: '/games/watchout/',
    status: 'available'
  }
];

function getGame(id) {
  return GAMES.find(g => g.id === id) || null;
}

function listGames() {
  return GAMES.map(({ id, name, tagline, icon, color, players, duration, path, status }) => ({
    id,
    name,
    tagline,
    icon,
    color,
    players,
    duration,
    path,
    status
  }));
}

module.exports = { GAMES, getGame, listGames };
