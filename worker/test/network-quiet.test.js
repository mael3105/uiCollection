import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { chromium } from 'playwright';
import { trackRequests } from '../src/network-quiet.js';

// 1×1 px transparent
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=', 'base64');

describe('trackRequests', () => {
  let browser;

  beforeAll(async () => {
    browser = await chromium.launch();
  });

  afterAll(async () => {
    await browser.close();
  });

  it('should wait for an image requested late by a carousel', async () => {
    const page = await browser.newPage();
    await page.route('https://img.test/**', async (route) => {
      await new Promise((r) => setTimeout(r, 800));
      await route.fulfill({ body: PNG, contentType: 'image/png' });
    });
    const tracker = trackRequests(page);
    await page.setContent(`<div id="slide"></div><script>
      setTimeout(() => {
        const img = new Image();
        img.onload = () => { document.getElementById('slide').style.backgroundImage = 'url(' + img.src + ')'; window.loaded = true; };
        img.src = 'https://img.test/slide.png';
      }, 100);
    </script>`);

    await tracker.waitForQuiet({ idleMs: 500, timeoutMs: 5000 });

    expect(await page.evaluate(() => window.loaded)).toBe(true);
    await page.close();
  });

  it('should give up after the timeout on a page that never stops loading', async () => {
    const page = await browser.newPage();
    await page.route('https://img.test/**', () => {}); // jamais servie
    const tracker = trackRequests(page);
    await page.setContent('<img src="https://img.test/forever.png">', { waitUntil: 'domcontentloaded' });
    const start = Date.now();

    await tracker.waitForQuiet({ idleMs: 500, timeoutMs: 1000 });

    expect(Date.now() - start).toBeLessThan(2000);
    await page.close();
  });
});
