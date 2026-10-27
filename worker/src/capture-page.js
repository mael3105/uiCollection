import { cleanPage } from './clean-page.js';
import { trackRequests } from './network-quiet.js';
import { analyzePage } from './analyze-page.js';
import { extractSiteName } from './site-name.js';

const CONTEXT = {
  viewport: { width: 1440, height: 900 },
  deviceScaleFactor: 1,
  locale: 'fr-FR',
};

export async function capturePage(browser, url, { timeoutMs = 90000 } = {}) {
  const context = await browser.newContext(CONTEXT);
  const page = await context.newPage();
  let timer;
  const deadline = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`capture interrompue après ${timeoutMs / 1000} s`)), timeoutMs);
  });
  try {
    return await Promise.race([run(page, url, timeoutMs), deadline]);
  } finally {
    clearTimeout(timer);
    await context.close();
  }
}

async function run(page, url, timeoutMs) {
  const warnings = [];
  const requests = trackRequests(page);
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: timeoutMs });
  try { await page.waitForLoadState('networkidle', { timeout: 10000 }); }
  catch { warnings.push('réseau jamais au repos (normal sur certains sites)'); }
  await page.waitForTimeout(1500);

  const cleaned = await cleanPage(page);
  warnings.push(...cleaned.warnings);
  // Image de carrousel ou chargée paresseusement pendant le nettoyage
  await requests.waitForQuiet({ idleMs: 500, timeoutMs: 5000 });
  await page.waitForTimeout(300);

  const meta = await page.evaluate(() => ({
    ogSiteName: document.querySelector('meta[property="og:site_name"]')?.content,
    applicationName: document.querySelector('meta[name="application-name"]')?.content,
    title: document.title,
  }));
  const finalUrl = page.url();
  const jpeg = await page.screenshot({ type: 'jpeg', quality: 80, animations: 'disabled' });
  // Une analyse ratée ne coûte pas la vignette
  let analysis = null;
  try { analysis = await analyzePage(page); }
  catch (err) { warnings.push(`analyse impossible : ${String(err?.message ?? err).split('\n')[0]}`); }

  return {
    jpeg,
    siteName: extractSiteName({ ...meta, hostname: new URL(finalUrl).hostname }),
    pageTitle: meta.title,
    finalUrl,
    warnings,
    analysis,
  };
}
