'use strict';

const fs = require('fs');
const path = require('path');

const V = '2024-10-01';

function s(id, label, value, unit, unitFamily, category, year, region, source, sourceUrl) {
  return {
    id,
    label,
    value,
    unit,
    unitFamily,
    category,
    year,
    region: region || 'Monde',
    source,
    sourceUrl,
    verifiedAt: V
  };
}

const stats = [
  // PEOPLE
  s('pop-fr', 'Population de la France', 68370000, 'personnes', 'people', 'demographie', 2024, 'France', 'INSEE / ONU', 'https://www.insee.fr'),
  s('pop-world', 'Population mondiale', 8100000000, 'personnes', 'people', 'demographie', 2024, 'Monde', 'ONU / Worldometer', 'https://www.worldometers.info/world-population/'),
  s('pop-india', 'Population de l’Inde', 1428000000, 'personnes', 'people', 'demographie', 2023, 'Inde', 'ONU', 'https://population.un.org'),
  s('pop-china', 'Population de la Chine', 1412000000, 'personnes', 'people', 'demographie', 2023, 'Chine', 'ONU', 'https://population.un.org'),
  s('pop-usa', 'Population des États-Unis', 340000000, 'personnes', 'people', 'demographie', 2024, 'États-Unis', 'US Census', 'https://www.census.gov'),
  s('pop-eu', 'Population de l’Union européenne', 448000000, 'personnes', 'people', 'demographie', 2023, 'UE', 'Eurostat', 'https://ec.europa.eu/eurostat'),
  s('pop-africa', 'Population de l’Afrique', 1460000000, 'personnes', 'people', 'demographie', 2023, 'Afrique', 'ONU', 'https://population.un.org'),
  s('births-day', 'Naissances dans le monde par jour (approx.)', 385000, 'personnes', 'people', 'demographie', 2023, 'Monde', 'ONU / Worldometer', 'https://www.worldometers.info'),
  s('deaths-day', 'Décès dans le monde par jour (approx.)', 166000, 'personnes', 'people', 'demographie', 2023, 'Monde', 'ONU / Worldometer', 'https://www.worldometers.info'),
  s('smokers-world', 'Fumeurs dans le monde (adultes)', 1100000000, 'personnes', 'people', 'sante', 2022, 'Monde', 'OMS', 'https://www.who.int'),
  s('doctors-fr', 'Médecins en activité en France', 230000, 'personnes', 'people', 'sante', 2023, 'France', 'DREES', 'https://drees.solidarites-sante.gouv.fr'),
  s('teachers-fr', 'Enseignants du public en France', 870000, 'personnes', 'people', 'education', 2023, 'France', 'Ministère Éducation', 'https://www.education.gouv.fr'),
  s('students-fr', 'Élèves et étudiants en France', 15000000, 'personnes', 'people', 'education', 2023, 'France', 'Ministère Éducation', 'https://www.education.gouv.fr'),
  s('tourists-fr-year', 'Touristes internationaux accueillis en France / an', 100000000, 'personnes', 'people', 'tourisme', 2023, 'France', 'OMT / Atout France', 'https://www.unwto.org'),
  s('refugees-world', 'Réfugiés dans le monde', 36000000, 'personnes', 'people', 'societe', 2023, 'Monde', 'HCR', 'https://www.unhcr.org'),
  s('internet-users', 'Internautes dans le monde', 5400000000, 'personnes', 'people', 'tech', 2023, 'Monde', 'ITU / DataReportal', 'https://datareportal.com'),
  s('smartphone-users', 'Utilisateurs de smartphones dans le monde', 4700000000, 'personnes', 'people', 'tech', 2023, 'Monde', 'Statista / GSMA', 'https://www.gsma.com'),
  s('fb-users', 'Utilisateurs mensuels actifs Facebook', 3100000000, 'personnes', 'people', 'tech', 2024, 'Monde', 'Meta', 'https://about.fb.com'),
  s('yt-users', 'Utilisateurs mensuels YouTube', 2500000000, 'personnes', 'people', 'tech', 2023, 'Monde', 'Google / Statista', 'https://www.statista.com'),
  s('christians', 'Chrétiens dans le monde (approx.)', 2400000000, 'personnes', 'people', 'societe', 2020, 'Monde', 'Pew Research', 'https://www.pewresearch.org'),
  s('muslims', 'Musulmans dans le monde (approx.)', 1900000000, 'personnes', 'people', 'societe', 2020, 'Monde', 'Pew Research', 'https://www.pewresearch.org'),
  s('english-speakers', 'Locuteurs d’anglais (L1+L2, approx.)', 1500000000, 'personnes', 'people', 'langue', 2023, 'Monde', 'Ethnologue / British Council', 'https://www.ethnologue.com'),
  s('french-speakers', 'Locuteurs de français (L1+L2, approx.)', 320000000, 'personnes', 'people', 'langue', 2022, 'Monde', 'OIF', 'https://www.francophonie.org'),
  s('olympians-paris', 'Athlètes aux JO de Paris 2024', 11000, 'personnes', 'people', 'sport', 2024, 'France', 'CIO', 'https://olympics.com'),
  s('pilots-world', 'Pilotes de ligne dans le monde (approx.)', 290000, 'personnes', 'people', 'transport', 2023, 'Monde', 'IATA / CAE', 'https://www.iata.org'),
  s('astronauts-ever', 'Personnes ayant voyagé dans l’espace (cumul)', 650, 'personnes', 'people', 'espace', 2024, 'Monde', 'World Spaceflight', 'https://www.worldspaceflight.com'),
  s('billionaires', 'Milliardaires dans le monde', 2600, 'personnes', 'people', 'economie', 2024, 'Monde', 'Forbes', 'https://www.forbes.com'),
  s('paris-pop', 'Population de Paris intramuros', 2100000, 'personnes', 'people', 'demographie', 2023, 'France', 'INSEE', 'https://www.insee.fr'),
  s('tokyo-metro', 'Population de l’aire urbaine de Tokyo', 37000000, 'personnes', 'people', 'demographie', 2023, 'Japon', 'ONU', 'https://population.un.org'),
  s('births-fr-year', 'Naissances en France par an', 680000, 'personnes', 'people', 'demographie', 2023, 'France', 'INSEE', 'https://www.insee.fr'),

  // COUNT (objets / unités)
  s('cars-world', 'Voitures en circulation dans le monde', 1400000000, 'véhicules', 'count', 'transport', 2023, 'Monde', 'OICA / ACEA', 'https://www.oica.net'),
  s('cars-fr', 'Voitures particulières en France', 38000000, 'véhicules', 'count', 'transport', 2023, 'France', 'SDES', 'https://www.statistiques.developpement-durable.gouv.fr'),
  s('bikes-nl', 'Vélos aux Pays-Bas (approx.)', 23000000, 'vélos', 'count', 'transport', 2022, 'Pays-Bas', 'CBS / Fietsersbond', 'https://www.cbs.nl'),
  s('planes-commercial', 'Avions commerciaux en service dans le monde', 28000, 'avions', 'count', 'transport', 2023, 'Monde', 'Aviation Week / Cirium', 'https://www.cirium.com'),
  s('ships-merchant', 'Navires marchands dans le monde', 105000, 'navires', 'count', 'transport', 2023, 'Monde', 'UNCTAD', 'https://unctad.org'),
  s('books-year', 'Livres publiés dans le monde par an (approx.)', 2200000, 'livres', 'count', 'culture', 2022, 'Monde', 'IPA / UNESCO', 'https://www.internationalpublishers.org'),
  s('films-year', 'Longs métrages produits dans le monde / an', 10000, 'films', 'count', 'culture', 2022, 'Monde', 'UNESCO UIS', 'https://uis.unesco.org'),
  s('trees-world', 'Arbres sur Terre (approx.)', 3000000000000, 'arbres', 'count', 'nature', 2015, 'Monde', 'Nature / Crowther Lab', 'https://www.nature.com'),
  s('dogs-world', 'Chiens domestiques dans le monde (approx.)', 900000000, 'animaux', 'count', 'animaux', 2022, 'Monde', 'WSAVA / Statista', 'https://www.statista.com'),
  s('cats-world', 'Chats domestiques dans le monde (approx.)', 600000000, 'animaux', 'count', 'animaux', 2022, 'Monde', 'Statista', 'https://www.statista.com'),
  s('cattle-world', 'Bovins dans le monde', 1500000000, 'animaux', 'count', 'animaux', 2022, 'Monde', 'FAO', 'https://www.fao.org'),
  s('chickens-world', 'Poulets dans le monde (effectif)', 25000000000, 'animaux', 'count', 'animaux', 2022, 'Monde', 'FAO', 'https://www.fao.org'),
  s('phones-sold-year', 'Smartphones vendus dans le monde / an', 1200000000, 'appareils', 'count', 'tech', 2023, 'Monde', 'IDC / Canalys', 'https://www.idc.com'),
  s('emails-day', 'E-mails envoyés dans le monde par jour', 350000000000, 'messages', 'count', 'tech', 2023, 'Monde', 'Radicati', 'https://www.radicati.com'),
  s('tweets-day', 'Posts X (Twitter) par jour (approx.)', 500000000, 'messages', 'count', 'tech', 2023, 'Monde', 'Estimations industrie', 'https://www.statista.com'),
  s('google-searches-day', 'Recherches Google par jour (approx.)', 8500000000, 'requêtes', 'count', 'tech', 2023, 'Monde', 'Internet Live Stats', 'https://www.internetlivestats.com'),
  s('starbucks', 'Magasins Starbucks dans le monde', 38000, 'magasins', 'count', 'economie', 2024, 'Monde', 'Starbucks', 'https://www.starbucks.com'),
  s('mcdonalds', 'Restaurants McDonald’s dans le monde', 42000, 'magasins', 'count', 'economie', 2023, 'Monde', 'McDonald’s', 'https://corporate.mcdonalds.com'),
  s('airports-world', 'Aéroports dans le monde', 42000, 'aéroports', 'count', 'transport', 2023, 'Monde', 'CIA World Factbook', 'https://www.cia.gov'),
  s('skyscrapers', 'Immeubles de plus de 150 m dans le monde', 7000, 'bâtiments', 'count', 'architecture', 2023, 'Monde', 'CTBUH', 'https://www.skyscrapercenter.com'),
  s('satellites-active', 'Satellites actifs en orbite', 10000, 'satellites', 'count', 'espace', 2024, 'Monde', 'UCS Satellite Database', 'https://www.ucsusa.org'),
  s('languages', 'Langues vivantes dans le monde (approx.)', 7000, 'langues', 'count', 'langue', 2023, 'Monde', 'Ethnologue', 'https://www.ethnologue.com'),
  s('countries', 'États membres de l’ONU', 193, 'pays', 'count', 'geopolitique', 2024, 'Monde', 'ONU', 'https://www.un.org'),
  s('olympics-summer', 'Éditions des JO d’été (jusqu’à Paris 2024)', 30, 'événements', 'count', 'sport', 2024, 'Monde', 'CIO', 'https://olympics.com'),
  s('fifa-wc', 'Coupes du monde FIFA masculines disputées', 22, 'événements', 'count', 'sport', 2022, 'Monde', 'FIFA', 'https://www.fifa.com'),
  s('unesco-sites', 'Sites du patrimoine mondial UNESCO', 1200, 'sites', 'count', 'culture', 2024, 'Monde', 'UNESCO', 'https://whc.unesco.org'),
  s('books-fr-year', 'Livres publiés en France / an', 70000, 'livres', 'count', 'culture', 2023, 'France', 'SNE', 'https://www.sne.fr'),
  s('domains-com', 'Noms de domaine .com enregistrés', 160000000, 'domaines', 'count', 'tech', 2024, 'Monde', 'Verisign', 'https://www.verisign.com'),

  // DISTANCE_KM
  s('earth-equator', 'Circonférence de la Terre à l’équateur', 40075, 'km', 'distance_km', 'science', 2020, 'Terre', 'NASA / IERS', 'https://nssdc.gsfc.nasa.gov'),
  s('earth-moon', 'Distance moyenne Terre–Lune', 384400, 'km', 'distance_km', 'espace', 2020, 'Système solaire', 'NASA', 'https://nssdc.gsfc.nasa.gov'),
  s('earth-sun', 'Distance moyenne Terre–Soleil (1 UA)', 149600000, 'km', 'distance_km', 'espace', 2020, 'Système solaire', 'NASA', 'https://nssdc.gsfc.nasa.gov'),
  s('paris-ny', 'Distance Paris–New York (grand cercle)', 5837, 'km', 'distance_km', 'geographie', 2020, 'Monde', 'Great Circle Mapper', 'https://www.gcmap.com'),
  s('paris-tokyo', 'Distance Paris–Tokyo (grand cercle)', 9715, 'km', 'distance_km', 'geographie', 2020, 'Monde', 'Great Circle Mapper', 'https://www.gcmap.com'),
  s('france-length', 'Longueur N–S de la France métropolitaine', 1000, 'km', 'distance_km', 'geographie', 2020, 'France', 'IGN', 'https://www.ign.fr'),
  s('amazon-length', 'Longueur du fleuve Amazone (approx.)', 6400, 'km', 'distance_km', 'nature', 2020, 'Amérique du Sud', 'USGS / Britannica', 'https://www.britannica.com'),
  s('nile-length', 'Longueur du Nil (approx.)', 6650, 'km', 'distance_km', 'nature', 2020, 'Afrique', 'Britannica', 'https://www.britannica.com'),
  s('great-wall', 'Longueur de la Grande Muraille (ensemble)', 21196, 'km', 'distance_km', 'histoire', 2012, 'Chine', 'Administration nationale Chine', 'https://whc.unesco.org'),
  s('marathon', 'Distance d’un marathon', 42.195, 'km', 'distance_km', 'sport', 2020, 'Monde', 'World Athletics', 'https://worldathletics.org'),
  s('tour-eiffel-height-km', 'Hauteur de la tour Eiffel', 0.33, 'km', 'distance_km', 'architecture', 2023, 'France', 'SETTE', 'https://www.toureiffel.paris'),
  s('everest', 'Altitude du mont Everest', 8.849, 'km', 'distance_km', 'nature', 2020, 'Népal/Chine', 'Survey of Nepal', 'https://www.nationalgeographic.com'),
  s('mariana', 'Profondeur de la fosse des Mariannes', 11, 'km', 'distance_km', 'nature', 2019, 'Pacifique', 'NOAA', 'https://oceanservice.noaa.gov'),
  s('flight-paris-ny', 'Distance typique vol Paris–NY (route aérienne)', 5850, 'km', 'distance_km', 'transport', 2020, 'Monde', 'Airlines', 'https://www.gcmap.com'),

  // MONEY_USD (PIB, budgets — mêmes unités $)
  s('gdp-world', 'PIB mondial (nominal)', 105000000000000, 'USD', 'money_usd', 'economie', 2023, 'Monde', 'Banque mondiale', 'https://data.worldbank.org'),
  s('gdp-usa', 'PIB des États-Unis', 27000000000000, 'USD', 'money_usd', 'economie', 2023, 'États-Unis', 'Banque mondiale', 'https://data.worldbank.org'),
  s('gdp-china', 'PIB de la Chine', 18000000000000, 'USD', 'money_usd', 'economie', 2023, 'Chine', 'Banque mondiale', 'https://data.worldbank.org'),
  s('gdp-fr', 'PIB de la France', 3000000000000, 'USD', 'money_usd', 'economie', 2023, 'France', 'Banque mondiale', 'https://data.worldbank.org'),
  s('gdp-germany', 'PIB de l’Allemagne', 4500000000000, 'USD', 'money_usd', 'economie', 2023, 'Allemagne', 'Banque mondiale', 'https://data.worldbank.org'),
  s('apple-revenue', 'Chiffre d’affaires annuel Apple', 380000000000, 'USD', 'money_usd', 'economie', 2023, 'Monde', 'Apple 10-K', 'https://investor.apple.com'),
  s('amazon-revenue', 'Chiffre d’affaires annuel Amazon', 575000000000, 'USD', 'money_usd', 'economie', 2023, 'Monde', 'Amazon', 'https://ir.aboutamazon.com'),
  s('military-usa', 'Budget militaire des États-Unis / an', 860000000000, 'USD', 'money_usd', 'geopolitique', 2023, 'États-Unis', 'SIPRI', 'https://www.sipri.org'),
  s('military-world', 'Dépenses militaires mondiales / an', 2400000000000, 'USD', 'money_usd', 'geopolitique', 2023, 'Monde', 'SIPRI', 'https://www.sipri.org'),
  s('olympics-paris-budget', 'Budget des JO Paris 2024 (approx.)', 9000000000, 'USD', 'money_usd', 'sport', 2024, 'France', 'COJOP / presse', 'https://www.paris2024.org'),
  s('netflix-revenue', 'Chiffre d’affaires annuel Netflix', 34000000000, 'USD', 'money_usd', 'tech', 2023, 'Monde', 'Netflix', 'https://ir.netflix.net'),
  s('aid-oda', 'Aide publique au développement mondiale / an', 220000000000, 'USD', 'money_usd', 'geopolitique', 2022, 'Monde', 'OCDE', 'https://www.oecd.org'),

  // AREA_KM2
  s('area-fr', 'Superficie de la France métropolitaine', 543940, 'km²', 'area_km2', 'geographie', 2020, 'France', 'IGN', 'https://www.ign.fr'),
  s('area-usa', 'Superficie des États-Unis', 9834000, 'km²', 'area_km2', 'geographie', 2020, 'États-Unis', 'CIA World Factbook', 'https://www.cia.gov'),
  s('area-russia', 'Superficie de la Russie', 17098000, 'km²', 'area_km2', 'geographie', 2020, 'Russie', 'CIA World Factbook', 'https://www.cia.gov'),
  s('area-china', 'Superficie de la Chine', 9600000, 'km²', 'area_km2', 'geographie', 2020, 'Chine', 'CIA World Factbook', 'https://www.cia.gov'),
  s('area-brazil', 'Superficie du Brésil', 8516000, 'km²', 'area_km2', 'geographie', 2020, 'Brésil', 'CIA World Factbook', 'https://www.cia.gov'),
  s('area-amazon', 'Surface de la forêt amazonienne (approx.)', 5500000, 'km²', 'area_km2', 'nature', 2020, 'Amérique du Sud', 'WWF / NASA', 'https://www.wwf.org'),
  s('area-sahara', 'Surface du Sahara', 9200000, 'km²', 'area_km2', 'nature', 2020, 'Afrique', 'Britannica', 'https://www.britannica.com'),
  s('area-paris', 'Superficie de Paris intramuros', 105, 'km²', 'area_km2', 'geographie', 2020, 'France', 'INSEE', 'https://www.insee.fr'),
  s('area-belgium', 'Superficie de la Belgique', 30528, 'km²', 'area_km2', 'geographie', 2020, 'Belgique', 'Statbel', 'https://statbel.fgov.be'),
  s('area-monaco', 'Superficie de Monaco', 2.1, 'km²', 'area_km2', 'geographie', 2020, 'Monaco', 'Gouvernement Monaco', 'https://en.gouv.mc'),
  s('area-earth-land', 'Superficie des terres émergées', 149000000, 'km²', 'area_km2', 'science', 2020, 'Terre', 'NASA', 'https://nssdc.gsfc.nasa.gov'),
  s('area-pacific', 'Surface de l’océan Pacifique', 165000000, 'km²', 'area_km2', 'nature', 2020, 'Pacifique', 'NOAA', 'https://oceanservice.noaa.gov'),

  // TIME_YEARS
  s('age-universe', 'Âge de l’Univers', 13800000000, 'années', 'time_years', 'science', 2020, 'Univers', 'Planck / NASA', 'https://www.nasa.gov'),
  s('age-earth', 'Âge de la Terre', 4540000000, 'années', 'time_years', 'science', 2020, 'Terre', 'USGS', 'https://www.usgs.gov'),
  s('age-human-sapiens', 'Apparition d’Homo sapiens (approx.)', 300000, 'années', 'time_years', 'histoire', 2020, 'Afrique', 'Smithsonian', 'https://humanorigins.si.edu'),
  s('age-pyramids', 'Âge des pyramides de Gizeh (approx.)', 4500, 'années', 'time_years', 'histoire', 2020, 'Égypte', 'Britannica', 'https://www.britannica.com'),
  s('age-rome', 'Âge de la fondation de Rome (tradition)', 2777, 'années', 'time_years', 'histoire', 2024, 'Italie', 'Tradition romaine', 'https://www.britannica.com'),
  s('age-usa', 'Âge des États-Unis (depuis 1776)', 248, 'années', 'time_years', 'histoire', 2024, 'États-Unis', 'Histoire', 'https://www.archives.gov'),
  s('age-internet', 'Âge du World Wide Web (depuis 1989)', 35, 'années', 'time_years', 'tech', 2024, 'Monde', 'CERN', 'https://home.cern'),
  s('age-iphone', 'Âge de l’iPhone (depuis 2007)', 17, 'années', 'time_years', 'tech', 2024, 'Monde', 'Apple', 'https://www.apple.com'),
  s('human-life-expect', 'Espérance de vie mondiale', 73, 'années', 'time_years', 'sante', 2023, 'Monde', 'OMS / Banque mondiale', 'https://data.worldbank.org'),
  s('human-life-fr', 'Espérance de vie en France', 83, 'années', 'time_years', 'sante', 2023, 'France', 'INSEE', 'https://www.insee.fr')
];

// Fix accidental space in id
for (const row of stats) {
  row.id = row.id.replace(/\s+/g, '');
}

const dest = path.join(__dirname, '..', 'games', 'factor', 'stats.json');
fs.writeFileSync(dest, JSON.stringify(stats, null, 2), 'utf8');
console.log('Wrote', stats.length, 'stats →', dest);
const families = {};
for (const row of stats) {
  families[row.unitFamily] = (families[row.unitFamily] || 0) + 1;
}
console.log(families);
