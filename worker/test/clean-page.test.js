import { afterAll, beforeAll, beforeEach, afterEach, describe, expect, it } from 'vitest';
import { chromium } from 'playwright';
import { pathToFileURL } from 'node:url';
import { join } from 'node:path';
import { cleanPage, dismissConsent, dismissPopups } from '../src/clean-page.js';

const fixture = (name) => pathToFileURL(join(import.meta.dirname, 'fixtures', name)).href;

describe('clean-page', () => {
  let browser;
  let context;
  let page;

  beforeAll(async () => {
    browser = await chromium.launch();
  });

  afterAll(async () => {
    await browser.close();
  });

  beforeEach(async () => {
    context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    page = await context.newPage();
  });

  afterEach(async () => {
    await context.close();
  });

  it('should refuse cookies when a refuse button exists', async () => {
    await page.goto(fixture('cookie-banner.html'));

    const consent = await dismissConsent(page);

    expect(consent).toBe('refus');
    expect(await page.evaluate(() => window.choice)).toBe('refus');
    expect(await page.locator('#banner').count()).toBe(0);
  });

  it('should refuse cookies through links without clicking marketing buttons', async () => {
    await page.goto(fixture('consent-links.html'));

    const consent = await dismissConsent(page);

    expect(consent).toBe('refus');
    expect(await page.evaluate(() => window.choice)).toBe('refus');
    expect(await page.evaluate(() => window.marketingClicked)).toBeUndefined();
  });

  it('should close a newsletter modal and unlock scrolling', async () => {
    await page.goto(fixture('newsletter-modal.html'));

    await dismissPopups(page);

    expect(await page.locator('#modal').isVisible().catch(() => false)).toBe(false);
    expect(await page.evaluate(() => getComputedStyle(document.body).overflow)).not.toBe('hidden');
  });

  it('should hide a covering overlay without close button and warn', async () => {
    await page.goto(fixture('overlay-no-button.html'));

    const warnings = await dismissPopups(page);

    expect(await page.locator('#overlay').isVisible()).toBe(false);
    expect(warnings.length).toBeGreaterThan(0);
  });

  it('should close a modal without following site navigation links', async () => {
    await page.goto(fixture('fixed-header-link.html'));

    await dismissPopups(page);

    expect(page.url()).toBe(fixture('fixed-header-link.html'));
    expect(await page.locator('#modal').count()).toBe(0);
  });

  it('should hide a low z-index backdrop and its sibling dialog panel', async () => {
    await page.goto(fixture('sibling-modal.html'));

    await dismissPopups(page);

    expect(await page.locator('#backdrop').isVisible()).toBe(false);
    expect(await page.locator('#panel').isVisible()).toBe(false);
  });

  it('should click a close button labelled only with ×', async () => {
    await page.setContent(`<div id="m" style="position:fixed;top:40%;left:40%;width:10%;height:10%;z-index:5">
      Promo <button onclick="window.dismissed = true; this.parentElement.remove()">×</button></div>`);

    await dismissPopups(page);

    expect(await page.evaluate(() => window.dismissed)).toBe(true);
  });

  it('should keep a sticky site header visible', async () => {
    await page.goto(fixture('sticky-header.html'));

    await dismissPopups(page);

    expect(await page.locator('#site-header').isVisible()).toBe(true);
  });

  it('should close a popup that appears late', async () => {
    await page.goto(fixture('late-popup.html'));

    await cleanPage(page);

    expect(await page.locator('#late').isVisible().catch(() => false)).toBe(false);
  });
});
