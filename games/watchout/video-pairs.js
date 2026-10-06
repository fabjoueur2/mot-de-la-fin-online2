/**
 * Banque de paires WatchOut — durées proches (±5s).
 * IDs YouTube de clips courts / viraux (à enrichir).
 * Le moteur peut aussi tirer des paires live via YouTube Data API (YOUTUBE_API_KEY).
 */
module.exports = [
  {
    pairId: 'animals_001',
    category: 'animals',
    difficulty: 'normal',
    label: 'Animaux maladroits',
    mainVideo: { youtubeId: 'jNQXAC9IVRw', duration: 19 },
    impostorVideo: { youtubeId: 'kJQP7kiw5Fk', duration: 20 }
  },
  {
    pairId: 'animals_002',
    category: 'animals',
    difficulty: 'hard',
    label: 'Chien vs chat',
    mainVideo: { youtubeId: 'CevxZvSJLk8', duration: 30 },
    impostorVideo: { youtubeId: '9bZkp7q19f0', duration: 28 }
  },
  {
    pairId: 'fails_001',
    category: 'fails',
    difficulty: 'easy',
    label: 'Fails sport',
    mainVideo: { youtubeId: 'tVj0ZTS4WF4', duration: 25 },
    impostorVideo: { youtubeId: 'fJ9rUzIMcZQ', duration: 24 }
  },
  {
    pairId: 'fails_002',
    category: 'fails',
    difficulty: 'normal',
    label: 'Chutes',
    mainVideo: { youtubeId: 'hY7m5jjJ9mM', duration: 22 },
    impostorVideo: { youtubeId: 'L_jWHffIx5E', duration: 23 }
  },
  {
    pairId: 'sports_001',
    category: 'sports',
    difficulty: 'hard',
    label: 'Sauts ratés',
    mainVideo: { youtubeId: 'Zi_XLOBDo_Y', duration: 27 },
    impostorVideo: { youtubeId: 'OPf0YbXqDm0', duration: 29 }
  },
  {
    pairId: 'food_001',
    category: 'food',
    difficulty: 'normal',
    label: 'Nourriture volée',
    mainVideo: { youtubeId: '2Vv-BfVoq4g', duration: 26 },
    impostorVideo: { youtubeId: 'RgKAFK5djSk', duration: 28 }
  },
  {
    pairId: 'kids_001',
    category: 'kids',
    difficulty: 'easy',
    label: 'Enfants surpris',
    mainVideo: { youtubeId: 'e-ORhEE9VVg', duration: 24 },
    impostorVideo: { youtubeId: 'YQHsXMglC9A', duration: 25 }
  },
  {
    pairId: 'weird_001',
    category: 'weird',
    difficulty: 'easy',
    label: 'Situations absurdes',
    mainVideo: { youtubeId: 'astISOttCQ0', duration: 21 },
    impostorVideo: { youtubeId: 'QH2-TGUlwu4', duration: 22 }
  },
  {
    pairId: 'animals_003',
    category: 'animals',
    difficulty: 'easy',
    label: 'Animaux vs objets',
    mainVideo: { youtubeId: 'MTXxBD4pB9c', duration: 18 },
    impostorVideo: { youtubeId: 'lTRiuFIWV54', duration: 20 }
  },
  {
    pairId: 'sports_002',
    category: 'sports',
    difficulty: 'normal',
    label: 'Ballons & racks',
    mainVideo: { youtubeId: '3JZ_D3ELwOQ', duration: 30 },
    impostorVideo: { youtubeId: '09R8_2nJtjg', duration: 31 }
  },
  {
    pairId: 'fails_003',
    category: 'fails',
    difficulty: 'hard',
    label: 'Presque réussi',
    mainVideo: { youtubeId: 'pRpeEdMmmQ0', duration: 23 },
    impostorVideo: { youtubeId: 'ktvTqknDobU', duration: 24 }
  },
  {
    pairId: 'weird_002',
    category: 'weird',
    difficulty: 'normal',
    label: 'Réactions inattendues',
    mainVideo: { youtubeId: 'fKopy74weus', duration: 27 },
    impostorVideo: { youtubeId: 'uelHwf8o7_U', duration: 26 }
  }
];
