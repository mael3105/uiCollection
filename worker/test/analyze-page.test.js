import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { chromium } from 'playwright';
import { pathToFileURL } from 'node:url';
import { join } from 'node:path';
import { analyzePage } from '../src/analyze-page.js';

const fixture = (name) => pathToFileURL(join(import.meta.dirname, 'fixtures', name)).href;

describe('analyzePage', () => {
  let browser;
  let analysis;

  beforeAll(async () => {
    browser = await chromium.launch();
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    await page.goto(fixture('design-sample.html'));
    analysis = await analyzePage(page);
  });

  afterAll(async () => {
    await browser.close();
  });

  it('should find the brand, background, surface and text colors', () => {
    expect(analysis.colors).toMatchObject({
      background: '#ffffff',
      surface: '#f5f6f8',
      text: '#111827',
      primary: '#0069ff',
      border: '#e5e7eb',
    });
  });

  it('should read the type roles', () => {
    expect(analysis.typography.display).toEqual({ fontFamily: 'Arial', fontSize: '64px', fontWeight: 700, lineHeight: 1.1, letterSpacing: '-0.02em' });
    expect(analysis.typography.headline).toMatchObject({ fontSize: '40px', fontWeight: 700 });
    expect(analysis.typography.body).toMatchObject({ fontFamily: 'Georgia', fontSize: '16px', lineHeight: 1.6 });
    expect(analysis.typography.label).toMatchObject({ fontSize: '15px', fontWeight: 600 });
  });

  it('should measure shapes, spacing and shadows', () => {
    expect(analysis.rounded).toMatchObject({ sm: '6px', md: '8px', lg: '16px' });
    expect(Object.values(analysis.spacing)).toEqual(expect.arrayContaining(['16px', '24px']));
    expect(analysis.shadows[0]).toContain('4px 12px');
  });

  it('should describe the buttons and the input', () => {
    expect(analysis.components['button-primary']).toMatchObject({ backgroundColor: '{colors.primary}', textColor: '#ffffff', rounded: '{rounded.md}', padding: '12px 20px' });
    expect(analysis.components['button-secondary']).toMatchObject({ backgroundColor: 'transparent', border: '1px solid #e5e7eb' });
    expect(analysis.components.input).toMatchObject({ rounded: '{rounded.sm}' });
  });

  it('should collect meta, tech, layout and headings', () => {
    expect(analysis.meta).toMatchObject({ description: 'Pages de vente qui convertissent', lang: 'fr', themeColor: '#0069ff', generator: 'WordPress 6.6' });
    expect(analysis.tech).toEqual(expect.arrayContaining(['WordPress', 'GSAP']));
    expect(analysis.layout).toMatchObject({ contentWidth: 1200, theme: 'clair', hasVideo: false, hasCanvas: false });
    expect(analysis.meta.favicon).toMatch(/\/icons\/acme\.svg$/);
    expect(analysis.headings).toEqual([{ level: 1, text: 'Des pages qui convertissent' }, { level: 2, text: 'Tarifs simples' }]);
  });
});

describe('analyzePage on unusual pages', () => {
  let browser;
  let page;

  beforeAll(async () => {
    browser = await chromium.launch();
    page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  });

  afterAll(async () => {
    await browser.close();
  });

  it('should take the largest visible text as display when the h1 is small', async () => {
    await page.setContent(`<body style="margin:0;font-family:Arial">
      <h1 style="font-size:17px">Hôtel 5 étoiles à Paris</h1>
      <h2 style="font:300 110px/0.8 Georgia">Les Jardins</h2><p>Bienvenue.</p></body>`);

    const analysis = await analyzePage(page);

    expect(analysis.typography.display).toMatchObject({ fontFamily: 'Georgia', fontSize: '110px' });
  });

  it('should flag a hero that sits on an image or a video', async () => {
    await page.setContent(`<body style="margin:0;background:#fff;color:#fff">
      <section style="height:900px;background:url(data:image/gif;base64,R0lGODlhAQABAIAAAP///wAAACH5BAEAAAAALAAAAAABAAEAAAICRAEAOw==) center/cover">
        <h1 style="margin:0;padding:200px">Lancez-vous</h1></section></body>`);

    const analysis = await analyzePage(page);

    expect(analysis.layout.heroMedia).toBe(true);
  });

  it('should see a background video that ignores the pointer', async () => {
    await page.setContent(`<body style="margin:0;background:#f3f4f6">
      <section style="position:relative;height:900px;background:#000;color:#fff">
        <video style="position:absolute;inset:0;width:100%;height:100%;pointer-events:none;background:#336"></video>
        <h1 style="position:relative;margin:0;padding:200px">Lancez-vous</h1></section></body>`);

    const analysis = await analyzePage(page);

    expect(analysis.layout.heroMedia).toBe(true);
  });
});
