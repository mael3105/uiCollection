const fold = (s) => (s ?? '').normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();

export function filterPages(pages, query) {
  const q = fold(query).trim();
  if (!q) return pages;
  return pages.filter((p) => [p.site_name, p.page_title, p.url].some((field) => fold(field).includes(q)));
}
