'use strict';

const HIT_REACTIONS = [
  'Télépathie de salon confirmée.',
  'Tu le connais trop bien.',
  'Lecture d’esprit niveau expert.',
  'Dans le mille.',
  'Couleurs assorties, goûts assortis.'
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
  'Le groupe lit dans les pensées.',
  'Compatibilité suspectement élevée.',
  'Les devineurs sont en feu.'
];

const ROUND_LOW = [
  'Ce n’était pas gagné d’avance.',
  'Opinions divergentes : excellent.',
  'Le débat d’après-manche s’annonce juteux.'
];

function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

/** hits = number of guessers who got this item right */
function reactionForItem({ hits, guesserCount }) {
  if (guesserCount <= 0) return pick(MIXED_REACTIONS);
  if (hits >= guesserCount) return pick(HIT_REACTIONS);
  if (hits === 0) return pick(MISS_REACTIONS);
  return pick(MIXED_REACTIONS);
}

function reactionForRound(accuracyPercent) {
  if (accuracyPercent >= 60) return pick(ROUND_HIGH);
  if (accuracyPercent <= 20) return pick(ROUND_LOW);
  return pick(MIXED_REACTIONS);
}

function endTitles({ players, correctById, scoresById, globalAccuracy }) {
  const titles = [];
  const sorted = [...players].sort(
    (a, b) => (correctById[b.id] || 0) - (correctById[a.id] || 0)
  );
  if (sorted.length) {
    const top = sorted[0];
    const topScore = correctById[top.id] || 0;
    const tied = sorted.filter((p) => (correctById[p.id] || 0) === topScore);
    if (tied.length === 1) {
      titles.push({ playerId: top.id, title: 'Télépathe officiel' });
    } else {
      for (const p of tied) {
        titles.push({ playerId: p.id, title: 'Double télépathie' });
      }
    }
  }

  if (globalAccuracy >= 60) {
    titles.push({ playerId: null, title: 'Même cerveau' });
  } else if (globalAccuracy <= 20) {
    titles.push({ playerId: null, title: 'Deux univers parallèles' });
  }

  const byScore = [...players].sort(
    (a, b) => (scoresById[b.id] || 0) - (scoresById[a.id] || 0)
  );
  if (byScore.length >= 2) {
    const gap = (scoresById[byScore[0].id] || 0) - (scoresById[byScore[1].id] || 0);
    if (gap >= 10) {
      titles.push({
        playerId: byScore[0].id,
        title: 'Je te connais mieux que toi-même'
      });
    }
  }

  return titles;
}

module.exports = {
  reactionForItem,
  reactionForRound,
  endTitles,
  HIT_REACTIONS,
  MISS_REACTIONS
};
