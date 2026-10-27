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
