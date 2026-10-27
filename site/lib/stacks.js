// Les pages d'un même site (domaine sans www.) forment une pile, placée là où se
// trouve sa page la plus récente ; l'ordre d'entrée (du plus récent) est conservé.
export function domainOf(url) {
  try { return new URL(url).hostname.toLowerCase().replace(/^www\./, ''); } catch { return url; }
}

export function groupBySite(pages) {
  const bySite = new Map();
  for (const page of pages) {
    const domain = domainOf(page.url);
    if (!bySite.has(domain)) bySite.set(domain, []);
    bySite.get(domain).push(page);
  }
  return [...bySite].map(([domain, group]) => (group.length > 1
    ? { kind: 'stack', domain, pages: group }
    : { kind: 'page', page: group[0] }));
}
