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
    id: 'bientot-1',
    name: 'Prochain jeu',
    tagline: 'Un nouveau jeu arrive bientôt sur la plateforme…',
    icon: '🎲',
    color: '#4d96ff',
    players: '—',
    duration: '—',
    path: null,
    status: 'coming-soon'
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
