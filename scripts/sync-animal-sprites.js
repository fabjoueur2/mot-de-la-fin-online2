/**
 * Copie les sprites FreePixel et génère animals.js + animals-client.js
 * Source : ../freepixel-animals/ ou re-téléchargement API
 */
const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');

const ROOT = path.join(__dirname, '..');
const SRC_DIR = path.join(ROOT, '..', 'freepixel-animals');
const SPRITES_DIR = path.join(ROOT, 'public', 'games', 'animal-stacker', 'sprites');
const SERVER_ANIMALS = path.join(ROOT, 'games', 'animal-stacker', 'animals.js');
const CLIENT_ANIMALS = path.join(ROOT, 'public', 'games', 'animal-stacker', 'animals-client.js');

const MAX_DIM = 56;
const SPRITE_URL_PREFIX = '/games/animal-stacker/sprites/';

const FRENCH = {
  anglerfish: 'Baudroie', ant: 'Fourmi', badger: 'Blaireau', basilisk: 'Basilic',
  bear: 'Ours', bee: 'Abeille', beetle: 'Scarabée', boar: 'Sanglier', budgie: 'Perruche',
  butterfly: 'Papillon', caterpillar: 'Chenille', centaur: 'Centaure', centipede: 'Mille-pattes',
  cerberus: 'Cerbère', chameleon: 'Caméléon', clownfish: 'Poisson-clown', coral: 'Corail',
  corgi: 'Corgi', crab: 'Crabe', cricket: 'Grillon', dalmatian: 'Dalmatien', deer: 'Cerf',
  dolphin: 'Dauphin', dragonfly: 'Libellule', eagle: 'Aigle', earthworm: 'Ver de terre',
  eel: 'Anguille', elephant: 'Éléphant', fairy: 'Fée', ferret: 'Furet', firefly: 'Luciole',
  fox: 'Renard', goldfish: 'Poisson rouge', gorilla: 'Gorille', grasshopper: 'Sauterelle',
  griffin: 'Griffon', hamster: 'Hamster', hedgehog: 'Hérisson', hydra: 'Hydre',
  jellyfish: 'Méduse', kirin: 'Kirin', kitten: 'Chaton', kraken: 'Kraken', ladybug: 'Coccinelle',
  lion: 'Lion', lobster: 'Homard', lynx: 'Lynx', manticore: 'Manticore', mermaid: 'Sirène',
  minotaur: 'Minotaure', moose: 'Élan', moth: 'Papillon de nuit', octopus: 'Poulpe',
  panda: 'Panda', parrot: 'Perroquet', pegasus: 'Pégase', penguin: 'Pingouin',
  phoenix: 'Phénix', pufferfish: 'Poisson-lune', puppy: 'Chiot', rabbit: 'Lapin',
  raccoon: 'Raton laveur', raven: 'Corbeau', scorpion: 'Scorpion', seahorse: 'Hippocampe',
  shark: 'Requin', snail: 'Escargot', snake: 'Serpent', spider: 'Araignée', squirrel: 'Écureuil',
  starfish: 'Étoile de mer', swordfish: 'Espadon', tiger: 'Tigre', turtle: 'Tortue',
  unicorn: 'Licorne', walrus: 'Morse', wasp: 'Guêpe', whale: 'Baleine', wolf: 'Loup',
  yeti: 'Yéti', dragon: 'Dragon', cat: 'Chat', dog: 'Chien', owl: 'Hibou', bird: 'Oiseau',
  pig: 'Cochon', frog: 'Grenouille', sheep: 'Mouton', koala: 'Koala'
};

function readPngSize(filePath) {
  const buf = fs.readFileSync(filePath);
  if (buf.toString('ascii', 1, 4) !== 'PNG') throw new Error(`Not PNG: ${filePath}`);
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
}

function fileToId(filename) {
  return filename.replace(/_\d{8}_\d{6}\.png$/i, '').replace(/\.png$/i, '');
}

function slugToName(slug) {
  const first = slug.split('-')[0];
  if (FRENCH[first]) return FRENCH[first];
  if (slug.includes('baby-dragon')) return 'Bébé dragon';
  if (slug.includes('dog-golden')) return 'Golden retriever';
  if (slug.includes('dog-husky')) return 'Husky';
  if (slug.includes('cat-black')) return 'Chat noir';
  if (slug.includes('cat-siamese')) return 'Chat siamois';
  if (slug.includes('persian-cat')) return 'Chat persan';
  if (slug.includes('dragon-red')) return 'Dragon';
  if (slug.includes('guinea-pig')) return 'Cochon d\'Inde';
  if (slug.includes('hermit-crab')) return 'Bernard-l\'hermite';
  if (slug.includes('koi-fish')) return 'Koï';
  if (slug.includes('manta-ray')) return 'Raie manta';
  if (slug.includes('mountain-goat')) return 'Chèvre de montagne';
  if (slug.includes('owl-barn')) return 'Hibou';
  if (slug.includes('pill-bug')) return 'Cloporte';
  if (slug.includes('praying-mantis')) return 'Mante religieuse';
  if (slug.includes('sea-turtle')) return 'Tortue de mer';
  if (slug.includes('stick-insect')) return 'Phasme';
  if (slug.includes('thunderbird')) return 'Oiseau-tonnerre';
  if (slug.includes('wolpertinger')) return 'Wolpertinger';
  if (slug.includes('nature')) return 'Esprit de la nature';
  return first.charAt(0).toUpperCase() + first.slice(1);
}

function scaleDims(w, h) {
  const scale = MAX_DIM / Math.max(w, h);
  const width = Math.max(28, Math.round(w * scale));
  const height = Math.max(28, Math.round(h * scale));
  const chamfer = Math.min(14, Math.round(Math.min(width, height) * 0.22));
  return { width, height, chamfer };
}

function fetchJson(url) {
  return new Promise((resolve, reject) => {
    const lib = url.startsWith('https') ? https : http;
    lib.get(url, (res) => {
      let data = '';
      res.on('data', (c) => { data += c; });
      res.on('end', () => {
        try { resolve(JSON.parse(data)); } catch (e) { reject(e); }
      });
    }).on('error', reject);
  });
}

function download(url, dest) {
  return new Promise((resolve, reject) => {
    const lib = url.startsWith('https') ? https : http;
    const file = fs.createWriteStream(dest);
    lib.get(url, (res) => {
      if (res.statusCode === 301 || res.statusCode === 302) {
        file.close();
        fs.unlinkSync(dest);
        return download(res.headers.location, dest).then(resolve).catch(reject);
      }
      res.pipe(file);
      file.on('finish', () => { file.close(); resolve(); });
    }).on('error', reject);
  });
}

async function ensureSprites() {
  fs.mkdirSync(SPRITES_DIR, { recursive: true });

  let files = [];
  if (fs.existsSync(SRC_DIR)) {
    files = fs.readdirSync(SRC_DIR).filter(f => f.endsWith('.png'));
  }

  if (files.length < 100) {
    console.log('Téléchargement des sprites depuis freepixel.art…');
    const html = await new Promise((resolve, reject) => {
      https.get('https://freepixel.art/browse/animals', (res) => {
        let d = '';
        res.on('data', (c) => { d += c; });
        res.on('end', () => resolve(d));
      }).on('error', reject);
    });
    const htmlUrls = [...html.matchAll(/https:\/\/freepixel\.art\/cdn\/sorted\/animals\/[^"'&\\]+\.png/g)].map(m => m[0]);
    const api = await fetchJson('https://freepixel.art/api/collections/animals/assets?page=0&limit=100');
    const urls = [...new Set([...htmlUrls, ...api.assets])];
    for (const url of urls) {
      const name = path.basename(url);
      const dest = path.join(SPRITES_DIR, name);
      if (!fs.existsSync(dest)) {
        await download(url, dest);
      }
    }
    files = fs.readdirSync(SPRITES_DIR).filter(f => f.endsWith('.png'));
  } else {
    for (const f of files) {
      const dest = path.join(SPRITES_DIR, f);
      if (!fs.existsSync(dest)) {
        fs.copyFileSync(path.join(SRC_DIR, f), dest);
      }
    }
    const extra = fs.readdirSync(SPRITES_DIR).filter(f => f.endsWith('.png'));
    files = [...new Set([...files, ...extra])];
  }

  return files.sort();
}

function buildManifest(files) {
  return files.map((filename) => {
    const filePath = path.join(SPRITES_DIR, filename);
    const { width: pw, height: ph } = readPngSize(filePath);
    const { width, height, chamfer } = scaleDims(pw, ph);
    const id = fileToId(filename);
    return {
      id,
      name: slugToName(id),
      sprite: SPRITE_URL_PREFIX + filename,
      width,
      height,
      chamfer
    };
  });
}

function writeServerModule(animals) {
  const content = `/** Animaux — sprites FreePixel (généré par scripts/sync-animal-sprites.js) */
const ANIMAL_TYPES = ${JSON.stringify(animals, null, 2)};

function getAnimalType(id) {
  return ANIMAL_TYPES.find(a => a.id === id) || ANIMAL_TYPES[0];
}

function pickRandomAnimal(usedIds = []) {
  const pool = ANIMAL_TYPES.filter(a => !usedIds.includes(a.id));
  const source = pool.length ? pool : ANIMAL_TYPES;
  return source[Math.floor(Math.random() * source.length)];
}

module.exports = { ANIMAL_TYPES, getAnimalType, pickRandomAnimal };
`;
  fs.writeFileSync(SERVER_ANIMALS, content, 'utf8');
}

function writeClientModule(animals) {
  const content = `/** Manifeste client — sprites FreePixel (généré) */
window.ANIMAL_TYPES = ${JSON.stringify(animals, null, 2)};

window.getAnimalType = function getAnimalType(id) {
  return window.ANIMAL_TYPES.find(a => a.id === id) || window.ANIMAL_TYPES[0];
};
`;
  fs.writeFileSync(CLIENT_ANIMALS, content, 'utf8');
}

async function main() {
  const files = await ensureSprites();
  const animals = buildManifest(files);
  writeServerModule(animals);
  writeClientModule(animals);
  console.log(`OK: ${animals.length} sprites → ${SPRITES_DIR}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
