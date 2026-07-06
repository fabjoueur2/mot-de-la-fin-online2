/** Définitions des animaux — formes de collision + rendu */
const ANIMAL_TYPES = [
  {
    id: 'bird',
    name: 'Oiseau',
    color: '#ffffff',
    accent: '#f39c12',
    width: 52,
    height: 36,
    chamfer: 6
  },
  {
    id: 'hedgehog',
    name: 'Hérisson',
    color: '#8d6e63',
    accent: '#d7ccc8',
    width: 48,
    height: 32,
    chamfer: 10
  },
  {
    id: 'fox',
    name: 'Renard',
    color: '#e67e22',
    accent: '#fff3e0',
    width: 58,
    height: 34,
    chamfer: 8
  },
  {
    id: 'penguin',
    name: 'Pingouin',
    color: '#263238',
    accent: '#ffffff',
    width: 40,
    height: 50,
    chamfer: 8
  },
  {
    id: 'frog',
    name: 'Grenouille',
    color: '#66bb6a',
    accent: '#1b5e20',
    width: 54,
    height: 38,
    chamfer: 12
  },
  {
    id: 'pig',
    name: 'Cochon',
    color: '#f48fb1',
    accent: '#fce4ec',
    width: 50,
    height: 44,
    chamfer: 14
  },
  {
    id: 'rabbit',
    name: 'Lapin',
    color: '#eeeeee',
    accent: '#ff8a80',
    width: 44,
    height: 52,
    chamfer: 8
  },
  {
    id: 'cat',
    name: 'Chat',
    color: '#ff9800',
    accent: '#fff8e1',
    width: 48,
    height: 40,
    chamfer: 10
  },
  {
    id: 'sheep',
    name: 'Mouton',
    color: '#fafafa',
    accent: '#424242',
    width: 56,
    height: 46,
    chamfer: 16
  },
  {
    id: 'owl',
    name: 'Hibou',
    color: '#8d6e63',
    accent: '#ffecb3',
    width: 46,
    height: 48,
    chamfer: 10
  },
  {
    id: 'turtle',
    name: 'Tortue',
    color: '#43a047',
    accent: '#1b5e20',
    width: 58,
    height: 36,
    chamfer: 12
  },
  {
    id: 'koala',
    name: 'Koala',
    color: '#9e9e9e',
    accent: '#f5f5f5',
    width: 50,
    height: 46,
    chamfer: 12
  }
];

function getAnimalType(id) {
  return ANIMAL_TYPES.find(a => a.id === id) || ANIMAL_TYPES[0];
}

function pickRandomAnimal(usedIds = []) {
  const pool = ANIMAL_TYPES.filter(a => !usedIds.includes(a.id));
  const source = pool.length ? pool : ANIMAL_TYPES;
  return source[Math.floor(Math.random() * source.length)];
}

module.exports = { ANIMAL_TYPES, getAnimalType, pickRandomAnimal };
