const firstLine = (err) => String(err?.message ?? err).split('\n')[0];

export async function processPage(row, { capture, upload, update, maxAttempts = 2 }) {
  // « Relancer l'analyse » : la vignette et le nom restent, seule l'analyse change
  const isAnalysisOnly = row.job === 'analysis';
  let lastError;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const result = await capture(row.url);
      if (isAnalysisOnly) {
        await update(row.id, {
          status: 'ready',
          job: 'capture',
          analysis: result.analysis ?? null,
          capture_warnings: result.warnings,
          error: null,
        });
        return 'ready';
      }
      const path = `${row.id}.jpg`;
      await upload(path, result.jpeg);
      await update(row.id, {
        status: 'ready',
        site_name: result.siteName,
        page_title: result.pageTitle,
        final_url: result.finalUrl,
        thumbnail_path: path,
        capture_warnings: result.warnings,
        analysis: result.analysis ?? null,
        error: null,
        captured_at: new Date().toISOString(),
      });
      return 'ready';
    } catch (err) {
      lastError = err;
    }
  }
  if (isAnalysisOnly) {
    // La vignette existante reste valable : la page n'est pas en échec
    await update(row.id, {
      status: 'ready',
      job: 'capture',
      capture_warnings: [...(row.capture_warnings ?? []), `analyse impossible : ${firstLine(lastError)}`],
    });
    return 'ready';
  }
  await update(row.id, { status: 'failed', error: firstLine(lastError) });
  return 'failed';
}
