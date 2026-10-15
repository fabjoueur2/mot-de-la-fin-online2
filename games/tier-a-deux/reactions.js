'use strict';

const MATCH_REACTIONS = [
  'Vous partagez visiblement le même cerveau.',
  'Une synchronisation presque inquiétante.',
  'Couleurs assorties, goûts assortis.',
  'Vous avez collé collé sur celui-là.',
  'Télépathie de salon confirmée.'
];

const MISS_REACTIONS = [
  'Vous êtes sûrs de vous connaître ?',
  'Il va falloir discuter de ce classement.',
  'Deux univers parallèles dans le même salon.',
  'On sent le débat arriver.',
  'Ah. Intéressant. Très intéressant.'
];

const MIXED_REACTIONS = [
  'Presque… mais pas tout à fait.',
  'Vous avez des goûts… particuliers.',
  'La complicité a des limites, apparemment.',
  'Bon, on ne peut pas tout partager.',
  'Un peu de nuance, beaucoup de personnalité.'
];

const ROUND_HIGH = [
  'Vous êtes en mise à jour synchronisée.',
  'Compatibilité suspectement élevée.',
  'Le duo de la soirée se confirme.'
];

const ROUND_LOW = [
  'Ce n’était pas gagné d’avance.',
  'Opinions divergentes : excellent.',
  'Le débat d’après-manche s’annonce juteux.'
];

function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function reactionForItem({ matchedPersonal, correctPredA, correctPredB }) {
  if (matchedPersonal) return pick(MATCH_REACTIONS);
  if (!correctPredA && !correctPredB) return pick(MISS_REACTIONS);
  return pick(MIXED_REACTIONS);
}

function reactionForRound(compatPercent) {
  if (compatPercent >= 60) return pick(ROUND_HIGH);
  if (compatPercent <= 20) return pick(ROUND_LOW);
  return pick(MIXED_REACTIONS);
}

function endTitles({
  playerA,
  playerB,
  scoreA,
  scoreB,
  correctPredA,
  correctPredB,
  globalCompat
}) {
  const titles = [];
  if (correctPredA > correctPredB) {
    titles.push({ playerId: playerA, title: 'Télépathe officiel' });
  } else if (correctPredB > correctPredA) {
    titles.push({ playerId: playerB, title: 'Télépathe officiel' });
  } else {
    titles.push({ playerId: playerA, title: 'Double télépathie' });
    titles.push({ playerId: playerB, title: 'Double télépathie' });
  }

  if (globalCompat >= 60) {
    titles.push({ playerId: null, title: 'Même cerveau' });
  } else if (globalCompat <= 20) {
    titles.push({ playerId: null, title: 'Deux univers parallèles' });
  }

  const gap = Math.abs(scoreA - scoreB);
  if (gap >= 10) {
    const winner = scoreA > scoreB ? playerA : playerB;
    titles.push({ playerId: winner, title: 'Je te connais mieux que toi-même' });
  }

  return titles;
}

module.exports = {
  reactionForItem,
  reactionForRound,
  endTitles,
  MATCH_REACTIONS,
  MISS_REACTIONS
};
