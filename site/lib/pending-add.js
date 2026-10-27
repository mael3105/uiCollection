// URL partagée pendant que la session est expirée : gardée le temps de se connecter.
const KEY = 'uicollection.pendingAdd';

export function savePendingAdd(storage, url) {
  try { storage.setItem(KEY, url); } catch { /* stockage bloqué : l'URL restera dans l'adresse */ }
}

export function takePendingAdd(storage) {
  try {
    const url = storage.getItem(KEY);
    storage.removeItem(KEY);
    return url;
  } catch {
    return null;
  }
}
