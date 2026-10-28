const EDITABLE_TEXT = ['display_name', 'site_type', 'page_type', 'notes'];

const LABELS = {
  capture: { pending: 'en attente', processing: 'capture en cours', failed: 'échec' },
  analysis: { pending: 'analyse en attente', processing: 'analyse en cours', failed: 'échec' },
};

/** Vrai si les valeurs du formulaire diffèrent de la fiche enregistrée. */
export function hasUnsavedChanges(page, values) {
  if (EDITABLE_TEXT.some((key) => (page[key] ?? null) !== (values[key] ?? null))) return true;
  const sorted = (list) => [...(list ?? [])].sort().join('\n');
  return sorted(page.styles) !== sorted(values.styles);
}

/** Libellé de la pastille d'état, ou null pour une page prête. */
export function statusLabel(page) {
  if (page.status === 'ready') return null;
  return (LABELS[page.job] ?? LABELS.capture)[page.status];
}

/** Ce que le robot traite en ce moment, pour le bandeau du haut ; null s'il ne fait rien. */
export function activityLabel(pages) {
  const busy = pages.filter((p) => p.status === 'pending' || p.status === 'processing');
  if (!busy.length) return null;
  const where = (url) => url.replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, '');
  if (busy.length === 1) {
    const [page] = busy;
    return { title: `1 ${page.job === 'analysis' ? 'analyse' : 'capture'} en cours`, detail: where(page.url) };
  }
  const jobs = new Set(busy.map((p) => p.job ?? 'capture'));
  const noun = jobs.size > 1 ? 'traitements' : jobs.has('analysis') ? 'analyses' : 'captures';
  const hosts = busy.slice(0, 3).map((p) => where(new URL(p.url).origin));
  return { title: `${busy.length} ${noun} en cours`, detail: hosts.join(', ') + (busy.length > 3 ? '…' : '') };
}
