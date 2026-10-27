const fold = (s) => (s ?? '').normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();

// Seul ce que la carte affiche compte : le nom du site et l'URL sans son protocole.
export function filterPages(pages, query) {
  const q = fold(query).trim();
  if (!q) return pages;
  return pages.filter((p) => [p.site_name, p.url?.replace(/^https?:\/\//, '')].some((field) => fold(field).includes(q)));
}
