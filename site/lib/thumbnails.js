// URL signées des vignettes privées : une signature par capture, renouvelée avant
// expiration, jamais redemandée pour une vignette introuvable.
const RENEW_MARGIN_MS = 5 * 60_000;

export function createThumbnails({ sign, ttlMs, now = Date.now }) {
  const entries = new Map(); // `${id}:${captured_at}` → { url, expiresAt } ; url null = introuvable
  let inFlight = null;

  const keyOf = (page) => `${page.id}:${page.captured_at}`;
  const needsSigning = (page) => {
    if (page.status !== 'ready' || !page.thumbnail_path) return false;
    const entry = entries.get(keyOf(page));
    if (!entry) return true;
    return entry.url !== null && entry.expiresAt - now() < RENEW_MARGIN_MS;
  };

  async function signBatch(pages) {
    const due = pages.filter(needsSigning);
    if (!due.length) return false;
    let results;
    try {
      results = await sign(due.map((p) => p.thumbnail_path));
    } catch {
      return false;
    }
    let changed = false;
    const expiresAt = now() + ttlMs;
    due.forEach((page, i) => {
      const url = results[i]?.signedUrl ?? null;
      entries.set(keyOf(page), { url, expiresAt });
      if (url) changed = true;
    });
    return changed;
  }

  return {
    urlFor: (page) => entries.get(keyOf(page))?.url ?? null,
    async refresh(pages) {
      if (inFlight) await inFlight;
      inFlight = signBatch(pages);
      try { return await inFlight; } finally { inFlight = null; }
    },
  };
}
