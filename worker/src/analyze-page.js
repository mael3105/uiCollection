import { collectDesign } from './collect-design.js';
import { summarizeDesign } from './summarize-design.js';

/** Analyse de design du haut de page, à appeler sur une page nettoyée et revenue en haut. */
export async function analyzePage(page) {
  return summarizeDesign(await page.evaluate(collectDesign));
}
