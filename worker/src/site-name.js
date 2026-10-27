const SEPARATORS = / \| | - | — | · /;

export function extractSiteName({ ogSiteName, applicationName, title, hostname }) {
  for (const candidate of [ogSiteName, applicationName]) {
    if (candidate?.trim()) return candidate.trim();
  }
  const segments = (title ?? '').split(SEPARATORS).map((s) => s.trim()).filter(Boolean);
  if (segments.length) {
    return segments.reduce((shortest, s) => (s.length < shortest.length ? s : shortest));
  }
  return hostname.replace(/^www\./, '');
}
