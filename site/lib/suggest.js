// Suggestions des listes déroulantes de la fiche (types de site et de page, tags).
const fold = (s) => (s ?? '').normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase().trim();

/** Valeurs qui commencent par la saisie, puis celles qui la contiennent ; sans accents ni casse. */
export function suggest(options, query, { exclude = [], limit = 8 } = {}) {
  const q = fold(query);
  const excluded = new Set(exclude.map(fold));
  const candidates = options.filter((o) => !excluded.has(fold(o)));
  const starts = candidates.filter((o) => fold(o).startsWith(q));
  const contains = candidates.filter((o) => !fold(o).startsWith(q) && fold(o).includes(q));
  return [...starts, ...contains].slice(0, limit);
}

/** Tags déjà posés sur la collection, une fois chacun (première écriture gardée), les plus utilisés d'abord. */
export function existingTags(pages) {
  const counts = new Map();
  for (const page of pages) {
    for (const tag of page.tags ?? []) {
      const key = fold(tag);
      const entry = counts.get(key) ?? { tag, count: 0 };
      entry.count += 1;
      counts.set(key, entry);
    }
  }
  return [...counts.values()]
    .sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag, 'fr'))
    .map((e) => e.tag);
}
