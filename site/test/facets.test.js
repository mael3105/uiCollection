import { describe, expect, it } from 'vitest';
import { applyFacets, colorFamily, facetOptions, valuesOf } from '../lib/facets.js';

const page = (id, fields = {}) => ({ id, url: `https://${id}.com/`, styles: [], analysis: null, ...fields });
const analysis = (colors, tech = []) => ({ colors, tech });

describe('colorFamily', () => {
  it('should name the hue of a vivid color', () => {
    expect(colorFamily('#ff9667')).toBe('orange');
    expect(colorFamily('#0069ff')).toBe('bleu');
    expect(colorFamily('#5e6ad2')).toBe('bleu');
    expect(colorFamily('#1f6f43')).toBe('vert');
    expect(colorFamily('#c4126a')).toBe('rose');
    expect(colorFamily('#d92b2b')).toBe('rouge');
    expect(colorFamily('#8a3ffc')).toBe('violet');
    expect(colorFamily('#f2c12e')).toBe('jaune');
  });

  it('should return null for greys, near black and near white', () => {
    expect(colorFamily('#222222')).toBe(null);
    expect(colorFamily('#f7f8f8')).toBe(null);
    expect(colorFamily('#08090a')).toBe(null);
    expect(colorFamily('not a color')).toBe(null);
  });
});

describe('valuesOf', () => {
  it('should read the colors of the brand and accent, or black and white when none is vivid', () => {
    expect(valuesOf(page('a', { analysis: analysis({ primary: '#0069ff', accent: '#ff9667', text: '#d92b2b' }) }), 'color')).toEqual(['bleu', 'orange']);
    expect(valuesOf(page('b', { analysis: analysis({ primary: '#222222', text: '#222222' }) }), 'color')).toEqual(['noir et blanc']);
    expect(valuesOf(page('c'), 'color')).toEqual([]);
  });

  it('should read typed fields, styles and technologies', () => {
    const p = page('a', { site_type: 'SaaS', page_type: null, styles: ['Minimal', 'Tech'], analysis: analysis({}, ['Next.js']) });

    expect(valuesOf(p, 'site_type')).toEqual(['SaaS']);
    expect(valuesOf(p, 'page_type')).toEqual([]);
    expect(valuesOf(p, 'style')).toEqual(['Minimal', 'Tech']);
    expect(valuesOf(p, 'tech')).toEqual(['Next.js']);
    expect(valuesOf({ ...p, tags: ['bento', 'grille'] }, 'tag')).toEqual(['bento', 'grille']);
    expect(valuesOf(p, 'tag')).toEqual([]);
  });
});

describe('facetOptions', () => {
  it('should count each value, most frequent first, then alphabetically', () => {
    const pages = [
      page('a', { styles: ['Tech', 'Minimal'] }),
      page('b', { styles: ['Minimal'] }),
      page('c', { styles: ['Éditorial'] }),
    ];

    expect(facetOptions(pages, 'style')).toEqual([
      { value: 'Minimal', count: 2 },
      { value: 'Éditorial', count: 1 },
      { value: 'Tech', count: 1 },
    ]);
  });
});

describe('applyFacets', () => {
  const pages = [
    page('a', { site_type: 'SaaS', styles: ['Minimal'] }),
    page('b', { site_type: 'SaaS', styles: ['Tech'] }),
    page('c', { site_type: 'Portfolio', styles: ['Minimal'] }),
  ];

  it('should keep the pages that match every chosen facet', () => {
    expect(applyFacets(pages, { site_type: 'SaaS', style: 'Minimal' }).map((p) => p.id)).toEqual(['a']);
  });

  it('should return every page without filters', () => {
    expect(applyFacets(pages, {})).toBe(pages);
  });
});
