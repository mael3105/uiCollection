const SEPARATORS = / \| | - | – | — | · /;

export function extractSiteName({ ogSiteName, applicationName, title, hostname }) {
  for (const candidate of [ogSiteName, applicationName]) {
    if (candidate?.trim()) return candidate.trim();
  }
  const segments = (title ?? '').split(SEPARATORS).map((s) => s.trim()).filter(Boolean);
  // Un titre sans séparateur décrit la page, pas le site
  if (segments.length > 1) {
    return segments.reduce((shortest, s) => (s.length < shortest.length ? s : shortest));
  }
  return hostname.replace(/^www\./, '');
}
