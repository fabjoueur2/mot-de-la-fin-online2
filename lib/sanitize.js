'use strict';

/**
 * Nettoie un pseudo / nom d'équipe côté serveur (défense en profondeur).
 * L'échappement HTML reste obligatoire côté client à l'affichage.
 */
function sanitizeDisplayName(raw, fallback = 'Joueur') {
  let s = String(raw ?? '')
    .normalize('NFKC')
    .replace(/[\u0000-\u001F\u007F\u202A-\u202E\u2066-\u2069]/g, '')
    .replace(/[<>&"'`\\]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 20);
  return s || fallback;
}

module.exports = { sanitizeDisplayName };
