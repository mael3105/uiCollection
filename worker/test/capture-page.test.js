import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { chromium } from 'playwright';
import { pathToFileURL } from 'node:url';
import { join } from 'node:path';
import { capturePage } from '../src/capture-page.js';

const fixture = (name) => pathToFileURL(join(import.meta.dirname, 'fixtures', name)).href;

describe('capturePage', () => {
  let browser;

  beforeAll(async () => {
    browser = await chromium.launch();
  });

  afterAll(async () => {
    await browser.close();
  });

  it('should return a JPEG with the page title and site name', async () => {
    const result = await capturePage(browser, fixture('newsletter-modal.html'));

    expect(result.jpeg[0]).toBe(0xff);
    expect(result.jpeg[1]).toBe(0xd8);
    expect(result.pageTitle).toBe('Maison Test | Boutique');
    expect(result.siteName).toBe('Maison Test');
    expect(result.finalUrl).toBe(fixture('newsletter-modal.html'));
  });

  it('should return the design analysis of the page', async () => {
    const result = await capturePage(browser, fixture('design-sample.html'));

    expect(result.analysis.colors.primary).toBe('#0069ff');
    expect(result.analysis.typography.display.fontSize).toBe('64px');
  });
});
