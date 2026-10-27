const SEPARATORS = / \| | - | – | — | · /;

// Le nom qui ressemble au domaine l'emporte : un og:site_name ou un morceau de titre
// peut nommer la page ou le produit (« Contact », « Ontologie ») plutôt que le site.
export function extractSiteName({ ogSiteName, applicationName, title, hostname }) {
  const declared = [ogSiteName, applicationName].map(clean).filter(Boolean);
  // Un titre sans séparateur décrit la page, pas le site
  const segments = (title ?? '').split(SEPARATORS).map(clean).filter(Boolean);
  const titleNames = segments.length > 1 ? segments : [];
  const label = domainLabel(hostname);

  return declared.find((name) => matchesDomain(name, label))
    ?? titleNames.find((name) => matchesDomain(name, label))
    ?? declared[0]
    ?? titleNames.reduce((shortest, s) => (!shortest || s.length < shortest.length ? s : shortest), null)
    ?? hostname.replace(/^www\./, '');
}

// Retire les symboles décoratifs en bordure : « → Les Jardins », « ★ Aesop ★ »
function clean(s) {
  return (s ?? '').replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '');
}

const fold = (s) => s.normalize('NFD').replace(/[^\p{L}\p{N}]/gu, '').toLowerCase();

// « www.acme-studio.co.uk » → « acmestudio » : le plus long libellé hors extension
function domainLabel(hostname) {
  const labels = hostname.replace(/^www\./, '').split('.').slice(0, -1);
  return fold(labels.reduce((longest, l) => (l.length > longest.length ? l : longest), ''));
}

function matchesDomain(name, label) {
  const folded = fold(name);
  if (folded.length < 3 || label.length < 3) return false;
  return label.includes(folded) || folded.includes(label);
}
