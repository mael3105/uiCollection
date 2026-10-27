// URL partagée gardée jusqu'à ce que l'ajout réussisse : connexion, réseau
// faible ou projet en pause ne doivent pas la faire perdre.
const KEY = 'uicollection.pendingAdd';

export function savePendingAdd(storage, url) {
  try { storage.setItem(KEY, url); } catch { /* stockage bloqué : l'appelant garde l'URL en mémoire */ }
}

export function readPendingAdd(storage) {
  try { return storage.getItem(KEY); } catch { return null; }
}

export function clearPendingAdd(storage) {
  try { storage.removeItem(KEY); } catch { /* rien à effacer */ }
}
