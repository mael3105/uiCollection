// Filtres de la collection : ce que la personne a saisi dans la fiche (types, styles)
// et ce que l'analyse a relevé (technologies, famille de la couleur de marque).
export const FACETS = [
  { key: 'site_type', label: 'Type de site' },
  { key: 'page_type', label: 'Type de page' },
  { key: 'style', label: 'Style' },
  { key: 'tech', label: 'Technologie' },
  { key: 'color', label: 'Couleur' },
];

export const NEUTRAL = 'noir et blanc';

// Teinte de référence affichée à côté de chaque famille
export const FAMILY_SWATCH = {
  rouge: '#d92b2b',
  orange: '#ff9667',
  jaune: '#f2c12e',
  vert: '#2f9e5b',
  bleu: '#3b6cf6',
  violet: '#8a3ffc',
  rose: '#e0468f',
  [NEUTRAL]: '#222222',
};

// Bornes hautes de teinte (degrés), dans l'ordre du cercle
const HUES = [[15, 'rouge'], [45, 'orange'], [70, 'jaune'], [165, 'vert'], [250, 'bleu'], [290, 'violet'], [345, 'rose'], [360, 'rouge']];

/** Famille d'une couleur vive (#rrggbb), null pour un gris, un quasi-noir ou un quasi-blanc. */
export function colorFamily(hex) {
  const m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})/i.exec(hex ?? '');
  if (!m) return null;
  const [r, g, b] = m.slice(1).map((h) => parseInt(h, 16) / 255);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const s = max === min ? 0 : (max - min) / (1 - Math.abs(2 * l - 1));
  if (s <= 0.25 || l <= 0.15 || l >= 0.85) return null;
  const d = max - min;
  const hue = max === r ? (60 * ((g - b) / d) + 360) % 360 : max === g ? 60 * ((b - r) / d) + 120 : 60 * ((r - g) / d) + 240;
  return HUES.find(([limit]) => hue < limit)[1];
}

/** @returns {string[]} les valeurs d'une page pour un filtre */
export function valuesOf(page, key) {
  if (key === 'site_type' || key === 'page_type') return page[key] ? [page[key]] : [];
  if (key === 'style') return page.styles ?? [];
  if (key === 'tech') return page.analysis?.tech ?? [];
  if (key === 'color') {
    const colors = page.analysis?.colors;
    if (!colors) return [];
    const families = [...new Set([colors.primary, colors.accent].map(colorFamily).filter(Boolean))];
    return families.length ? families : [NEUTRAL];
  }
  return [];
}

/** @returns {{ value: string, count: number }[]} les valeurs présentes, les plus fréquentes d'abord */
export function facetOptions(pages, key) {
  const counts = new Map();
  for (const page of pages) {
    for (const value of valuesOf(page, key)) counts.set(value, (counts.get(value) ?? 0) + 1);
  }
  return [...counts]
    .map(([value, count]) => ({ value, count }))
    .sort((a, b) => b.count - a.count || a.value.localeCompare(b.value, 'fr'));
}

/** Garde les pages qui ont la valeur choisie pour chaque filtre actif. */
export function applyFacets(pages, filters) {
  const active = Object.entries(filters).filter(([, value]) => value);
  if (!active.length) return pages;
  return pages.filter((page) => active.every(([key, value]) => valuesOf(page, key).includes(value)));
}
