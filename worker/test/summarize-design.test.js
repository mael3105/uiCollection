import { describe, expect, it } from 'vitest';
import { summarizeDesign, toHex } from '../src/summarize-design.js';

const typo = (fontFamily, fontSize, fontWeight = '400', lineHeight = 'normal', letterSpacing = 'normal') =>
  ({ fontFamily, fontSize, fontWeight, lineHeight, letterSpacing });

function raw(overrides = {}) {
  return {
    viewport: { width: 1440, height: 900 },
    backgrounds: [['rgb(255, 255, 255)', 900000], ['rgb(245, 246, 248)', 200000], ['rgb(0, 105, 255)', 12000]],
    surfaces: [['rgb(255, 255, 255)', 200], ['rgb(245, 246, 248)', 60], ['rgb(0, 105, 255)', 4]],
    texts: [['rgb(17, 24, 39)', 900], ['rgb(107, 114, 128)', 300], ['rgb(0, 105, 255)', 40]],
    borders: [['rgb(229, 231, 235)', 20]],
    radii: [['8px', 12], ['6px', 3], ['9999px', 2], ['16px', 4]],
    spacings: [['16px', 30], ['24px', 20], ['8px', 18], ['32px', 9], ['13px', 1]],
    shadows: [['rgba(0, 0, 0, 0.1) 0px 4px 12px 0px', 5]],
    actions: [
      { text: 'Démarrer', bg: 'rgb(0, 105, 255)', color: 'rgb(255, 255, 255)', border: 'none', radius: '8px', padding: '12px 20px', ...typo('Inter', '16px', '600'), area: 9000 },
      { text: 'Voir la démo', bg: 'rgba(0, 0, 0, 0)', color: 'rgb(17, 24, 39)', border: '1px solid rgb(229, 231, 235)', radius: '8px', padding: '12px 20px', ...typo('Inter', '16px', '600'), area: 9000 },
    ],
    input: { bg: 'rgb(255, 255, 255)', color: 'rgb(17, 24, 39)', border: '1px solid rgb(229, 231, 235)', radius: '6px', padding: '10px 12px', ...typo('Inter', '15px') },
    typography: {
      display: typo('"Cal Sans", Inter, sans-serif', '64px', '700', '70.4px', '-1.28px'),
      headline: typo('"Cal Sans", sans-serif', '40px', '700', '48px'),
      title: null,
      body: typo('Inter, sans-serif', '16px', '400', '25.6px'),
      label: typo('Inter, sans-serif', '15px', '600', 'normal'),
      caption: typo('Inter, sans-serif', '13px', '400', '19.5px'),
    },
    fontsLoaded: ['Inter', 'Cal Sans', 'Inter'],
    meta: { description: 'Landing pages', lang: 'en', themeColor: null, ogImage: null, canonical: null, generator: null },
    tech: ['Next.js', 'React'],
    layout: { pageHeight: 5400, contentWidth: 1200, hasVideo: false, hasCanvas: false },
    headings: [{ level: 1, text: 'Build pages that convert' }],
    ...overrides,
  };
}

describe('toHex', () => {
  it('should convert rgb and rgba to hex', () => {
    expect(toHex('rgb(0, 105, 255)')).toBe('#0069ff');
    expect(toHex('rgba(0, 0, 0, 0.5)')).toBe('#00000080');
  });

  it('should drop fully transparent colors and keep other CSS colors as they are', () => {
    expect(toHex('rgba(0, 0, 0, 0)')).toBe(null);
    expect(toHex('oklch(0.7 0.1 200)')).toBe('oklch(0.7 0.1 200)');
  });
});

describe('summarizeDesign', () => {
  it('should assign color roles from surface and text weights', () => {
    const { colors } = summarizeDesign(raw());

    expect(colors).toMatchObject({
      background: '#ffffff',
      surface: '#f5f6f8',
      text: '#111827',
      'text-muted': '#6b7280',
      primary: '#0069ff',
      border: '#e5e7eb',
    });
  });

  it('should take the primary color from the main call to action', () => {
    const { colors } = summarizeDesign(raw({
      backgrounds: [['rgb(255, 255, 255)', 900000], ['rgb(220, 38, 38)', 50000]],
      actions: [{ ...raw().actions[0], bg: 'rgb(124, 58, 237)' }],
    }));

    expect(colors.primary).toBe('#7c3aed');
  });

  it('should take the background from what is visible, not from what is declared', () => {
    const { colors, layout } = summarizeDesign(raw({
      surfaces: [['rgb(17, 16, 24)', 180], ['rgb(255, 255, 255)', 30], ['media', 20]],
    }));

    expect(colors.background).toBe('#111018');
    expect(layout.heroMedia).toBe(false);
  });

  it('should fall back to the declared page background behind a media hero', () => {
    const { colors, layout } = summarizeDesign(raw({
      surfaces: [['media', 180], ['rgb(162, 145, 94)', 20]],
    }));

    expect(colors.background).toBe('#ffffff');
    expect(layout.heroMedia).toBe(true);
  });

  it('should blend translucent surfaces over the background', () => {
    const { colors } = summarizeDesign(raw({
      surfaces: [['rgb(8, 9, 10)', 200], ['rgba(255, 255, 255, 0.05)', 60]],
    }));

    expect(colors.surface).toBe('#151616'); // alpha 0,05 arrondi à 13/255
  });

  it('should use the most visible filled call to action when no color is vivid', () => {
    const { colors, components } = summarizeDesign(raw({
      actions: [
        { ...raw().actions[0], bg: 'rgb(17, 16, 24)', area: 6000 },
        { ...raw().actions[1], bg: 'rgba(255, 255, 255, 0.14)', area: 9000 },
      ],
      backgrounds: [['rgb(255, 255, 255)', 900000]],
      texts: [['rgb(17, 24, 39)', 900]],
    }));

    expect(colors.primary).toBe('#111018');
    expect(components['button-primary'].backgroundColor).toBe('{colors.primary}');
  });

  it('should prefer the header call to action over larger neutral buttons', () => {
    const { colors } = summarizeDesign(raw({
      actions: [
        { ...raw().actions[0], bg: 'rgb(244, 244, 245)', area: 12000, top: 620 },
        { ...raw().actions[0], bg: 'rgb(17, 16, 24)', area: 5000, top: 34 },
      ],
      backgrounds: [['rgb(255, 255, 255)', 900000]],
      texts: [['rgb(17, 24, 39)', 900]],
    }));

    expect(colors.primary).toBe('#111018');
  });

  it('should call the more contrasted of the two main text colors the text', () => {
    const { colors } = summarizeDesign(raw({
      surfaces: [['rgb(8, 9, 10)', 200]],
      texts: [['rgb(208, 214, 224)', 900], ['rgb(247, 248, 248)', 600]],
    }));

    expect(colors.text).toBe('#f7f8f8');
    expect(colors['text-muted']).toBe('#d0d6e0');
  });

  it('should accept a muted brand color such as gold', () => {
    const { colors } = summarizeDesign(raw({ actions: [{ ...raw().actions[0], bg: 'rgb(162, 145, 94)' }] }));

    expect(colors.primary).toBe('#a2915e');
  });

  it('should leave icon fonts out of the font list', () => {
    const { fonts } = summarizeDesign(raw({ fontsLoaded: ['Font Awesome 5 Free', 'icomoon', 'Inter', 'Inter Fallback', 'Material Symbols Outlined'] }));

    expect(fonts).toEqual(['Inter']);
  });

  it('should report a dark theme from the background luminance', () => {
    const analysis = summarizeDesign(raw({ surfaces: [['rgb(10, 10, 12)', 900]] }));

    expect(analysis.layout.theme).toBe('sombre');
  });

  it('should keep the first font family and a unitless line height', () => {
    const { typography } = summarizeDesign(raw());

    expect(typography.display).toEqual({ fontFamily: 'Cal Sans', fontSize: '64px', fontWeight: 700, lineHeight: 1.1, letterSpacing: '-0.02em' });
    expect(typography.body.lineHeight).toBe(1.6);
    expect(typography.label.lineHeight).toBeUndefined();
    expect(typography).not.toHaveProperty('title');
  });

  it('should build rounded and spacing scales from the most frequent values', () => {
    const { rounded, spacing } = summarizeDesign(raw());

    expect(rounded).toEqual({ sm: '6px', md: '8px', lg: '16px', full: '9999px' });
    expect(spacing).toEqual({ xs: '8px', sm: '16px', md: '24px', lg: '32px' });
  });

  it('should describe buttons and inputs with token references', () => {
    const { components } = summarizeDesign(raw());

    expect(components['button-primary']).toEqual({
      backgroundColor: '{colors.primary}',
      textColor: '#ffffff',
      rounded: '{rounded.md}',
      padding: '12px 20px',
      typography: '{typography.label}',
    });
    expect(components['button-secondary']).toMatchObject({ backgroundColor: 'transparent', textColor: '{colors.text}', border: '1px solid #e5e7eb' });
    expect(components.input).toMatchObject({ rounded: '{rounded.sm}', border: '1px solid #e5e7eb' });
  });

  it('should list loaded fonts once and keep meta, tech and headings', () => {
    const analysis = summarizeDesign(raw());

    expect(analysis.version).toBe(1);
    expect(analysis.fonts).toEqual(['Inter', 'Cal Sans']);
    expect(analysis.tech).toEqual(['Next.js', 'React']);
    expect(analysis.meta.description).toBe('Landing pages');
    expect(analysis.headings).toEqual([{ level: 1, text: 'Build pages that convert' }]);
    expect(analysis.layout).toMatchObject({ pageHeight: 5400, contentWidth: 1200, theme: 'clair' });
  });

  it('should expose a weighted palette for swatches', () => {
    const { palette } = summarizeDesign(raw());

    expect(palette[0]).toBe('#ffffff');
    expect(palette).toContain('#0069ff');
    expect(new Set(palette).size).toBe(palette.length);
    expect(palette.length).toBeLessThanOrEqual(8);
  });

  it('should survive a page with almost nothing to measure', () => {
    const analysis = summarizeDesign(raw({
      backgrounds: [], surfaces: [], texts: [], borders: [], radii: [], spacings: [], shadows: [], actions: [], input: null,
      typography: { display: null, headline: null, title: null, body: null, label: null, caption: null },
    }));

    expect(analysis.colors).toEqual({});
    expect(analysis.components).toEqual({});
    expect(analysis.rounded).toEqual({});
  });
});
