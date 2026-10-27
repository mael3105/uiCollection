const firstLine = (err) => String(err?.message ?? err).split('\n')[0];

export async function processPage(row, { capture, upload, update, maxAttempts = 2 }) {
  let lastError;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const result = await capture(row.url);
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
  await update(row.id, { status: 'failed', error: firstLine(lastError) });
  return 'failed';
}
