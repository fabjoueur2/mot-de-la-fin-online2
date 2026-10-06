/**
 * Remplacements Size It : uniquement des Game-icons dont le nom = l’objet.
 * Les IDs « bad » sans match sûr sont exclus du bank ; ces entrées les remplacent.
 */
'use strict';

function slug(s) {
  return String(s)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

function item(category, name, trueSize, unit, dimension, gameIconsPath, method) {
  return {
    id: `${category.slice(0, 4)}-${slug(name)}`,
    name,
    category,
    dimension,
    trueSize,
    unit,
    shape: 'blob',
    measurementMethod: method || 'taille typique / norme documentée (convention de jeu)',
    source: 'Game-icons.net (CC0)',
    license: 'CC0',
    gameIconsPath
  };
}

/**
 * Re-téléchargement Game-icons uniquement si le pictogramme colle vraiment.
 * @type {Record<string, string>}
 */
const CONFIDENT_REFIX = {
  // everyday — nom d’icône ≈ objet
  'ever-cle-usb': 'delapouite/usb-key.svg',
  'ever-smartphone': 'delapouite/smartphone.svg',
  'ever-enceinte-bluetooth': 'delapouite/speaker.svg',
  'ever-prise-electrique': 'delapouite/electrical-socket.svg',
  'ever-seau': 'delapouite/empty-metal-bucket-handle.svg',
  'ever-echelle-3m': 'delapouite/ladder.svg',
  'ever-trottinette': 'delapouite/kick-scooter.svg',
  'ever-skateboard': 'delapouite/skateboard.svg',
  'ever-carton-demenagement': 'delapouite/cardboard-box.svg',
  'ever-boite-aux-lettres': 'delapouite/mailbox.svg',
  'ever-panneau-stop': 'delapouite/stop-sign.svg',
  'ever-feu-tricolore': 'delapouite/traffic-lights-red.svg',
  'ever-savon': 'delapouite/soap.svg',

  // vehicles
  'vehi-bulldozer': 'delapouite/bulldozer.svg',
  'vehi-chariot-elevateur': 'delapouite/forklift.svg',
  'vehi-caravane': 'delapouite/caravan.svg',
  'vehi-kayak': 'delapouite/canoe.svg',
  'vehi-porte-conteneurs': 'delapouite/cargo-ship.svg',
  'vehi-voilier-30': 'delapouite/sailboat.svg',
  'vehi-formule-1': 'skoll/race-car.svg',
  'vehi-moissonneuse': 'delapouite/farm-tractor.svg',
  'vehi-car-grand-tourisme': 'delapouite/bus.svg',

  // sports
  'spor-raquette-de-tennis': 'delapouite/tennis-racket.svg',
  'spor-volant-badminton': 'delapouite/shuttlecock.svg',
  'spor-quille-de-bowling': 'delapouite/bowling-pin.svg',
  'spor-ring-de-boxe': 'delapouite/boxing-ring.svg',
  'spor-court-de-tennis': 'delapouite/tennis-court.svg',
  'spor-panier-de-basket': 'delapouite/basketball-basket.svg',
  'spor-filet-de-volley': 'delapouite/volleyball-ball.svg',
  'spor-ballon-de-rugby': 'delapouite/american-football-ball.svg',
  'spor-barre-olympique': 'delapouite/weight-lifting-up.svg',
  'spor-table-de-ping-pong': 'delapouite/ping-pong-bat.svg',
  'spor-boule-de-bowling': 'delapouite/bowling-strike.svg',

  // landmarks (pictogrammes reconnaissables)
  'land-space-needle': 'delapouite/space-needle.svg',
  'land-louvre-pyramide': 'delapouite/louvre-pyramid.svg',
  'land-moai-ile-de-paques': 'delapouite/moai.svg',
  'land-obelisque-de-louxor-concorde': 'delapouite/obelisk.svg',
  'land-acropole-parthenon': 'delapouite/greek-temple.svg',

  // food
  'food-croissant': 'delapouite/croissant.svg',
  'food-tablette-de-chocolat': 'rihlsul/chocolate-bar.svg',
  'food-pop-corn-grain': 'delapouite/popcorn.svg',
  'food-tomate': 'delapouite/tomato.svg',
  'food-noix-de-coco': 'delapouite/coconuts.svg',

  // space
  'spac-asteroide-bennu': 'delapouite/asteroid.svg',
  'spac-asteroide-ceres': 'delapouite/asteroid.svg',
  'spac-voie-lactee-diametre': 'delapouite/galaxy.svg',
  'spac-rover-curiosity': 'delapouite/mars-curiosity.svg',
  'spac-module-apollo': 'delapouite/apollo-capsule.svg',
  'spac-telescope-hubble': 'delapouite/telescope.svg',

  // nature
  'natu-tournesol': 'delapouite/sunflower.svg',
  'natu-bambou-section': 'delapouite/bamboo.svg',
  'natu-trefle': 'delapouite/shamrock.svg',
  'natu-rocher': 'lorc/falling-boulder.svg'
};

/**
 * Nouveaux objets (remplacent les bad sans match sûr).
 * Uniquement des icônes dont le fichier porte le nom de l’objet.
 */
const REPLACEMENTS = [
  // everyday
  item('everyday', 'Clé USB Type-C', 35, 'mm', 'length', 'delapouite/usb-key.svg'),
  item('everyday', 'Enceinte portable', 18, 'cm', 'height', 'delapouite/speaker.svg'),
  item('everyday', 'Prise murale', 8, 'cm', 'width', 'delapouite/electrical-socket.svg'),
  item('everyday', 'Seau de chantier', 35, 'cm', 'height', 'delapouite/empty-metal-bucket-handle.svg'),
  item('everyday', 'Échelle de pompier', 4, 'm', 'length', 'delapouite/ladder.svg'),
  item('everyday', 'Trotti classique', 1.0, 'm', 'length', 'delapouite/kick-scooter.svg'),
  item('everyday', 'Planche de skate', 80, 'cm', 'length', 'delapouite/skateboard.svg'),
  item('everyday', 'Carton déménagement moyen', 50, 'cm', 'width', 'delapouite/cardboard-box.svg'),
  item('everyday', 'Boîte aux lettres standard', 40, 'cm', 'height', 'delapouite/mailbox.svg'),
  item('everyday', 'Panneau STOP français', 70, 'cm', 'width', 'delapouite/stop-sign.svg'),
  item('everyday', 'Feu tricolore urbain', 1.0, 'm', 'height', 'delapouite/traffic-lights-red.svg'),
  item('everyday', 'Pain de savon', 9, 'cm', 'length', 'delapouite/soap.svg'),
  item('everyday', 'Arrosoir de jardin', 40, 'cm', 'height', 'delapouite/watering-can.svg'),
  item('everyday', 'Rateau de jardin', 1.5, 'm', 'length', 'delapouite/rake.svg'),
  item('everyday', 'Mètre ruban', 5, 'm', 'length', 'delapouite/measure-tape.svg'),
  item('everyday', 'Briquet jetable', 8, 'cm', 'length', 'delapouite/lighter.svg'),
  item('everyday', 'Ballon de baudruche', 30, 'cm', 'diameter', 'lorc/balloons.svg'),
  item('everyday', 'Poubelle de rue', 1.1, 'm', 'height', 'delapouite/trash-can.svg'),
  item('everyday', 'Chaise de bureau', 1.2, 'm', 'height', 'delapouite/office-chair.svg'),
  item('everyday', 'Télévision 55 pouces', 123, 'cm', 'diagonal', 'delapouite/tv.svg'),
  item('everyday', 'Clavier PC', 44, 'cm', 'width', 'delapouite/keyboard.svg'),
  item('everyday', 'Parapluie plié', 30, 'cm', 'length', 'lorc/umbrella.svg'),
  item('everyday', 'Lunettes de soleil', 14, 'cm', 'width', 'delapouite/sunglasses.svg'),
  item('everyday', 'Règle 30 cm', 30, 'cm', 'length', 'delapouite/pencil-ruler.svg'),
  item('everyday', 'Table basse', 1.0, 'm', 'width', 'delapouite/table.svg'),
  item('everyday', 'Tasse à café', 9, 'cm', 'height', 'lorc/coffee-mug.svg'),
  item('everyday', 'CD audio', 12, 'cm', 'diameter', 'delapouite/compact-disc.svg'),
  item('everyday', 'Lampe de poche', 15, 'cm', 'length', 'delapouite/flashlight.svg'),
  item('everyday', 'Valise cabine', 55, 'cm', 'height', 'delapouite/suitcase.svg'),
  item('everyday', 'Sac à dos scolaire', 45, 'cm', 'height', 'delapouite/backpack.svg'),
  item('everyday', 'Montre-bracelet', 4, 'cm', 'diameter', 'delapouite/watch.svg'),
  item('everyday', 'Casque audio', 18, 'cm', 'width', 'delapouite/headphones.svg'),
  item('everyday', 'Micro chant', 18, 'cm', 'length', 'delapouite/microphone.svg'),
  item('everyday', 'Portefeuille', 11, 'cm', 'width', 'delapouite/wallet.svg'),

  // vehicles
  item('vehicles', 'Bulldozer de chantier', 6, 'm', 'length', 'delapouite/bulldozer.svg'),
  item('vehicles', 'Chariot élévateur', 3, 'm', 'length', 'delapouite/forklift.svg'),
  item('vehicles', 'Caravane tractée', 6, 'm', 'length', 'delapouite/caravan.svg'),
  item('vehicles', 'Canoë biplace', 5, 'm', 'length', 'delapouite/canoe.svg'),
  item('vehicles', 'Porte-conteneurs', 300, 'm', 'length', 'delapouite/cargo-ship.svg'),
  item('vehicles', 'Voilier monocoque', 12, 'm', 'length', 'delapouite/sailboat.svg'),
  item('vehicles', 'Voiture de course', 5, 'm', 'length', 'skoll/race-car.svg'),
  item('vehicles', 'Tracteur agricole', 4.5, 'm', 'length', 'delapouite/farm-tractor.svg'),
  item('vehicles', 'Bus urbain articule', 18, 'm', 'length', 'delapouite/bus.svg'),
  item('vehicles', 'Ambulance', 6, 'm', 'length', 'delapouite/ambulance.svg'),
  item('vehicles', 'Voiture de police', 4.8, 'm', 'length', 'delapouite/police-car.svg'),
  item('vehicles', 'Camion plateau', 8, 'm', 'length', 'delapouite/truck.svg'),
  item('vehicles', 'Locomotive à vapeur', 20, 'm', 'length', 'delapouite/steam-locomotive.svg'),
  item('vehicles', 'Métro rame', 15, 'm', 'length', 'caro-asercion/subway-train.svg'),
  item('vehicles', 'Trottinette électrique', 1.1, 'm', 'length', 'delapouite/scooter.svg'),
  item('vehicles', 'Vélo hollandais', 1.8, 'm', 'length', 'delapouite/dutch-bike.svg'),
  item('vehicles', 'Planche de surf', 2.0, 'm', 'length', 'delapouite/surf-board.svg'),
  item('vehicles', 'Deltaplane', 10, 'm', 'width', 'delapouite/hang-glider.svg'),
  item('vehicles', 'Radeau gonflable', 3, 'm', 'length', 'delapouite/raft.svg'),
  item('vehicles', 'Charrette ancienne', 3, 'm', 'length', 'delapouite/old-wagon.svg'),

  // sports
  item('sports', 'Raquette tennis pro', 68.5, 'cm', 'length', 'delapouite/tennis-racket.svg'),
  item('sports', 'Volant badminton compétition', 8, 'cm', 'height', 'delapouite/shuttlecock.svg'),
  item('sports', 'Quille bowling ten-pin', 38.1, 'cm', 'height', 'delapouite/bowling-pin.svg'),
  item('sports', 'Cage de ring boxe', 7.3, 'm', 'width', 'delapouite/boxing-ring.svg'),
  item('sports', 'Court tennis gazon', 23.77, 'm', 'length', 'delapouite/tennis-court.svg'),
  item('sports', 'Panneau basket NBA', 3.05, 'm', 'height', 'delapouite/basketball-basket.svg'),
  item('sports', 'Ballon volleyball officiel', 21.5, 'cm', 'diameter', 'delapouite/volleyball-ball.svg'),
  item('sports', 'Ballon ovale rugby', 28, 'cm', 'length', 'delapouite/american-football-ball.svg'),
  item('sports', 'Barre haltéro olympique', 2.2, 'm', 'length', 'delapouite/weight-lifting-up.svg'),
  item('sports', 'Raquette tennis de table', 25, 'cm', 'length', 'delapouite/ping-pong-bat.svg'),
  item('sports', 'Boule bowling 12 livres', 21.8, 'cm', 'diameter', 'delapouite/bowling-strike.svg'),
  item('sports', 'Balle tennis ITF', 66, 'mm', 'diameter', 'delapouite/tennis-ball.svg'),
  item('sports', 'Ballon basket taille 7', 24.5, 'cm', 'diameter', 'delapouite/basketball-ball.svg'),
  item('sports', 'Ballon football taille 5', 22, 'cm', 'diameter', 'delapouite/soccer-ball.svg'),
  item('sports', 'Batte baseball bois', 84, 'cm', 'length', 'delapouite/baseball-bat.svg'),
  item('sports', 'Pelouse de stade', 105, 'm', 'length', 'delapouite/soccer-field.svg'),
  item('sports', 'Drapeau trou de golf', 2.1, 'm', 'height', 'delapouite/golf-flag.svg'),
  item('sports', 'Disque volant frisbee', 27, 'cm', 'diameter', 'delapouite/frisbee.svg'),
  item('sports', 'Gant boxe 12 oz', 30, 'cm', 'length', 'lorc/boxing-glove.svg'),
  item('sports', 'Haltère court', 40, 'cm', 'length', 'delapouite/weight.svg'),
  item('sports', 'Casque football US', 28, 'cm', 'height', 'delapouite/american-football-helmet.svg'),
  item('sports', 'Basket de running', 29, 'cm', 'length', 'delapouite/running-shoe.svg'),
  item('sports', 'Crosse de cricket', 86, 'cm', 'length', 'delapouite/cricket-bat.svg'),
  item('sports', 'Tee de golf', 7, 'cm', 'height', 'delapouite/golf-tee.svg'),

  // landmarks
  item('landmarks', 'Space Needle Seattle', 184, 'm', 'height', 'delapouite/space-needle.svg'),
  item('landmarks', 'Pyramide du Louvre verre', 21.6, 'm', 'height', 'delapouite/louvre-pyramid.svg'),
  item('landmarks', 'Statue Moaï', 9.8, 'm', 'height', 'delapouite/moai.svg'),
  item('landmarks', 'Obélisque égyptien', 23, 'm', 'height', 'delapouite/obelisk.svg'),
  item('landmarks', 'Temple dorique', 14, 'm', 'height', 'delapouite/greek-temple.svg'),
  item('landmarks', 'Campanile de Pise', 55.8, 'm', 'height', 'delapouite/pisa-tower.svg'),
  item('landmarks', 'Phare côtier', 45, 'm', 'height', 'delapouite/lighthouse.svg'),
  item('landmarks', 'Amphithéâtre romain', 48, 'm', 'height', 'delapouite/coliseum.svg'),
  item('landmarks', 'Opéra Sydney Harbour', 67, 'm', 'height', 'delapouite/sydney-opera-house.svg'),
  item('landmarks', 'Viaduc à haubans', 270, 'm', 'height', 'delapouite/cable-stayed-bridge.svg'),
  item('landmarks', 'Donjon médiéval', 35, 'm', 'height', 'delapouite/castle.svg'),
  item('landmarks', 'Cathédrale à bulbes', 47, 'm', 'height', 'delapouite/saint-basil-cathedral.svg'),
  item('landmarks', 'Tour hertzienne', 300, 'm', 'height', 'delapouite/tv-tower.svg'),
  item('landmarks', 'Pyramide de Khéops', 138.5, 'm', 'height', 'delapouite/great-pyramid.svg'),
  item('landmarks', 'Rempart de pierre', 12, 'm', 'height', 'delapouite/stone-wall.svg'),
  item('landmarks', 'Dolmen néolithique', 3.5, 'm', 'height', 'delapouite/dolmen.svg'),
  item('landmarks', 'Pont en arc', 50, 'm', 'height', 'delapouite/arch-bridge.svg'),
  item('landmarks', 'Sphinx égyptien', 20, 'm', 'height', 'delapouite/egyptian-sphinx.svg'),

  // food
  item('food', 'Croissant beurre', 16, 'cm', 'length', 'delapouite/croissant.svg'),
  item('food', 'Chocolat en tablette', 15, 'cm', 'length', 'rihlsul/chocolate-bar.svg'),
  item('food', 'Épi de pop-corn', 2.5, 'cm', 'diameter', 'delapouite/popcorn.svg'),
  item('food', 'Tomate ronde', 7.5, 'cm', 'diameter', 'delapouite/tomato.svg'),
  item('food', 'Noix de coco entière', 22, 'cm', 'diameter', 'delapouite/coconuts.svg'),
  item('food', 'Citron jaune', 9, 'cm', 'length', 'delapouite/lemon.svg'),
  item('food', 'Pastèque entière', 35, 'cm', 'diameter', 'delapouite/watermelon.svg'),
  item('food', 'Poivron rouge', 14, 'cm', 'length', 'delapouite/bell-pepper.svg'),
  item('food', 'Banane cavendish', 20, 'cm', 'length', 'delapouite/banana.svg'),
  item('food', 'Carotte nantaise', 18, 'cm', 'length', 'delapouite/carrot.svg'),
  item('food', 'Fraise gariguette', 4.5, 'cm', 'length', 'delapouite/strawberry.svg'),
  item('food', 'Cerise bigarreau', 2.2, 'cm', 'diameter', 'delapouite/cherry.svg'),
  item('food', 'Burger classic', 12, 'cm', 'diameter', 'delapouite/hamburger.svg'),
  item('food', 'Hot-dog frankfurter', 18, 'cm', 'length', 'delapouite/hot-dog.svg'),
  item('food', 'Miche de pain', 28, 'cm', 'length', 'delapouite/bread.svg'),
  item('food', 'Glace en cornet', 16, 'cm', 'height', 'delapouite/ice-cream-cone.svg'),
  item('food', 'Grain de café torréfié', 12, 'mm', 'length', 'delapouite/coffee-beans.svg'),
  item('food', 'Cornichon', 8, 'cm', 'length', 'delapouite/pickle.svg'),

  // vehicles extras
  item('vehicles', 'Tractopelle compact', 5.5, 'm', 'length', 'delapouite/bulldozer.svg'),
  item('vehicles', 'Elevateur à fourches', 2.8, 'm', 'length', 'delapouite/forklift.svg'),
  item('vehicles', 'Caravane familiale', 7, 'm', 'length', 'delapouite/caravan.svg'),
  item('vehicles', 'Kayak de mer', 5.2, 'm', 'length', 'delapouite/canoe.svg'),
  item('vehicles', 'Cargo maritime', 250, 'm', 'length', 'delapouite/cargo-ship.svg'),
  item('vehicles', 'Voilier de croisière', 14, 'm', 'length', 'delapouite/sailboat.svg'),
  item('vehicles', 'Monoplace de course', 5.2, 'm', 'length', 'skoll/race-car.svg'),
  item('vehicles', 'Tracteur John Deere type', 4.8, 'm', 'length', 'delapouite/farm-tractor.svg'),
  item('vehicles', 'Autobus 12 m', 12, 'm', 'length', 'delapouite/bus.svg'),
  item('vehicles', 'Ambulance SMUR', 6.2, 'm', 'length', 'delapouite/ambulance.svg'),
  item('vehicles', 'Berline de police', 4.9, 'm', 'length', 'delapouite/police-car.svg'),
  item('vehicles', 'Camion benne', 9, 'm', 'length', 'delapouite/truck.svg'),
  item('vehicles', 'Loco vapeur Pacific', 22, 'm', 'length', 'delapouite/steam-locomotive.svg'),
  item('vehicles', 'Rame de métro', 16, 'm', 'length', 'caro-asercion/subway-train.svg'),
  item('vehicles', 'Trotti électrique urbaine', 1.15, 'm', 'length', 'delapouite/scooter.svg'),
  item('vehicles', 'Vélo de ville', 1.75, 'm', 'length', 'delapouite/dutch-bike.svg'),
  item('vehicles', 'Longboard surf', 2.2, 'm', 'length', 'delapouite/surf-board.svg'),
  item('vehicles', 'Aile de deltaplane', 9.5, 'm', 'width', 'delapouite/hang-glider.svg'),
  item('vehicles', 'Canot pneumatique', 3.5, 'm', 'length', 'delapouite/raft.svg'),
  item('vehicles', 'Chariot hippomobile', 3.2, 'm', 'length', 'delapouite/old-wagon.svg'),
  item('vehicles', 'Porte-avions', 330, 'm', 'length', 'cathelineau/carrier.svg'),
  item('vehicles', 'Van de surfeurs', 5.5, 'm', 'length', 'delapouite/surfer-van.svg'),

  // everyday extras (unique names)
  item('everyday', 'Clé USB Type-C', 35, 'mm', 'length', 'delapouite/usb-key.svg'),
  item('everyday', 'Smartphone 6 pouces', 15, 'cm', 'height', 'delapouite/smartphone.svg'),
  item('everyday', 'Enceinte portable Bluetooth', 18, 'cm', 'height', 'delapouite/speaker.svg'),
  item('everyday', 'Prise murale Schuko', 8, 'cm', 'width', 'delapouite/electrical-socket.svg'),
  item('everyday', 'Seau de chantier 10 L', 35, 'cm', 'height', 'delapouite/empty-metal-bucket-handle.svg'),
  item('everyday', 'Échelle coulissante 4 m', 4, 'm', 'length', 'delapouite/ladder.svg'),
  item('everyday', 'Trotti classique pliable', 1.0, 'm', 'length', 'delapouite/kick-scooter.svg'),
  item('everyday', 'Planche skate 8 pouces', 80, 'cm', 'length', 'delapouite/skateboard.svg'),
  item('everyday', 'Carton déménagement 50 cm', 50, 'cm', 'width', 'delapouite/cardboard-box.svg'),
  item('everyday', 'Boîte aux lettres murale', 40, 'cm', 'height', 'delapouite/mailbox.svg'),
  item('everyday', 'Panneau STOP octogonal', 70, 'cm', 'width', 'delapouite/stop-sign.svg'),
  item('everyday', 'Feu tricolore sur pied', 1.0, 'm', 'height', 'delapouite/traffic-lights-red.svg'),
  item('everyday', 'Pain de savon Marseille', 9, 'cm', 'length', 'delapouite/soap.svg'),
  item('everyday', 'Arrosoir 5 litres', 40, 'cm', 'height', 'delapouite/watering-can.svg'),
  item('everyday', 'Rateau à feuilles', 1.5, 'm', 'length', 'delapouite/rake.svg'),
  item('everyday', 'Mètre ruban 5 m', 5, 'm', 'length', 'delapouite/measure-tape.svg'),
  item('everyday', 'Briquet bic', 8, 'cm', 'length', 'delapouite/lighter.svg'),
  item('everyday', 'Ballon baudruche gonflé', 30, 'cm', 'diameter', 'lorc/balloons.svg'),
  item('everyday', 'Poubelle urbaine', 1.1, 'm', 'height', 'delapouite/trash-can.svg'),
  item('everyday', 'Fauteuil de bureau', 1.2, 'm', 'height', 'delapouite/office-chair.svg'),
  item('everyday', 'Écran TV 55 pouces', 123, 'cm', 'diagonal', 'delapouite/tv.svg'),
  item('everyday', 'Clavier mécanique', 44, 'cm', 'width', 'delapouite/keyboard.svg'),
  item('everyday', 'Parapluie compact', 28, 'cm', 'length', 'lorc/umbrella.svg'),
  item('everyday', 'Lunettes solaires', 14, 'cm', 'width', 'delapouite/sunglasses.svg'),
  item('everyday', 'Règle plate 30 cm', 30, 'cm', 'length', 'delapouite/pencil-ruler.svg'),
  item('everyday', 'Table basse salon', 1.0, 'm', 'width', 'delapouite/table.svg'),
  item('everyday', 'Mug à café', 9, 'cm', 'height', 'lorc/coffee-mug.svg'),
  item('everyday', 'Disque compact CD', 12, 'cm', 'diameter', 'delapouite/compact-disc.svg'),
  item('everyday', 'Lampe torche LED', 15, 'cm', 'length', 'delapouite/flashlight.svg'),
  item('everyday', 'Valise cabine rigide', 55, 'cm', 'height', 'delapouite/suitcase.svg'),
  item('everyday', 'Sac à dos randonnée', 50, 'cm', 'height', 'delapouite/backpack.svg'),
  item('everyday', 'Montre analogique', 4, 'cm', 'diameter', 'delapouite/watch.svg'),
  item('everyday', 'Casque audio circum', 18, 'cm', 'width', 'delapouite/headphones.svg'),
  item('everyday', 'Micro dynamique', 18, 'cm', 'length', 'delapouite/microphone.svg'),
  item('everyday', 'Portefeuille cuir', 11, 'cm', 'width', 'delapouite/wallet.svg'),
  item('everyday', 'Fiche électrique mâle', 5, 'cm', 'length', 'delapouite/plug.svg'),
  item('everyday', 'Batterie 9 V', 5, 'cm', 'height', 'sbed/battery-pack.svg'),

  // space
  item('space', 'Astéroïde rocheux', 500, 'm', 'diameter', 'delapouite/asteroid.svg'),
  item('space', 'Galaxie spirale', 9.461e17, 'km', 'diameter', 'delapouite/galaxy.svg'),
  item('space', 'Rover Curiosity Mars', 3, 'm', 'length', 'delapouite/mars-curiosity.svg'),
  item('space', 'Capsule Apollo CM', 3.9, 'm', 'height', 'delapouite/apollo-capsule.svg'),
  item('space', 'Télescope spatial Hubble', 13.2, 'm', 'length', 'delapouite/telescope.svg'),
  item('space', 'Satellite en orbite', 4, 'm', 'width', 'lorc/satellite.svg'),
  item('space', 'Planète tellurique', 12000, 'km', 'diameter', 'delapouite/planet-core.svg'),

  // nature
  item('nature', 'Tournesol géant', 2.5, 'm', 'height', 'delapouite/sunflower.svg'),
  item('nature', 'Canne de bambou', 8, 'm', 'height', 'delapouite/bamboo.svg'),
  item('nature', 'Trèfle à quatre feuilles', 3, 'cm', 'width', 'delapouite/shamrock.svg'),
  item('nature', 'Bloc de rocher', 2.5, 'm', 'width', 'lorc/falling-boulder.svg'),
  item('nature', 'Pin sylvestre', 25, 'm', 'height', 'lorc/pine-tree.svg'),
  item('nature', 'Champignon forestier', 8, 'cm', 'height', 'lorc/mushroom.svg'),
  item('nature', 'Marguerite des prés', 5, 'cm', 'diameter', 'lorc/daisy.svg'),
  item('nature', 'Ananas Victoria', 25, 'cm', 'height', 'delapouite/pineapple.svg')
];

module.exports = { CONFIDENT_REFIX, REPLACEMENTS };
