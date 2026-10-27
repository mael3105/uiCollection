const fold = (s) => (s ?? '').normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();

// Seul ce que la carte affiche compte : le nom (corrigé ou détecté) et l'URL sans son protocole.
export function filterPages(pages, query) {
  const q = fold(query).trim();
  if (!q) return pages;
  return pages.filter((p) => [p.display_name, p.site_name, p.url?.replace(/^https?:\/\//, '')].some((field) => fold(field).includes(q)));
}
