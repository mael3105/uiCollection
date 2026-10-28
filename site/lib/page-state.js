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
