import { describe, expect, it } from 'vitest';
import { isHttpUrl, readAddParam, stripAddParam } from '../lib/add-param.js';
import { clearPendingAdd, readPendingAdd, savePendingAdd } from '../lib/pending-add.js';
import { filterPages } from '../lib/filter-pages.js';

function memoryStorage() {
  const data = new Map();
  return {
    getItem: (k) => (data.has(k) ? data.get(k) : null),
    setItem: (k, v) => data.set(k, String(v)),
    removeItem: (k) => data.delete(k),
  };
}

describe('add-param', () => {
  it('should read the decoded add parameter', () => {
    expect(readAddParam('https://x.io/uiCollection/?add=https%3A%2F%2Fa.com%2Fp%3Fq%3D1')).toBe('https://a.com/p?q=1');
  });

  it('should return null without add parameter', () => {
    expect(readAddParam('https://x.io/uiCollection/')).toBe(null);
  });

  it('should strip the add parameter', () => {
    expect(stripAddParam('https://x.io/uiCollection/?add=abc')).toBe('https://x.io/uiCollection/');
  });

  it('should accept only http and https URLs', () => {
    expect(isHttpUrl('https://a.com')).toBe(true);
    expect(isHttpUrl('http://a.com/x')).toBe(true);
    expect(isHttpUrl('mailto:a@b.c')).toBe(false);
    expect(isHttpUrl('a.com')).toBe(false);
  });
});

describe('pending-add', () => {
  it('should keep the saved URL until it is cleared', () => {
    const storage = memoryStorage();

    savePendingAdd(storage, 'https://a.com');

    expect(readPendingAdd(storage)).toBe('https://a.com');
    expect(readPendingAdd(storage)).toBe('https://a.com');
    clearPendingAdd(storage);
    expect(readPendingAdd(storage)).toBe(null);
  });

  it('should not throw when storage is blocked', () => {
    const broken = { getItem() { throw new Error('blocked'); }, setItem() { throw new Error('blocked'); }, removeItem() { throw new Error('blocked'); } };

    expect(() => savePendingAdd(broken, 'https://a.com')).not.toThrow();
    expect(readPendingAdd(broken)).toBe(null);
    expect(() => clearPendingAdd(broken)).not.toThrow();
  });
});

describe('filterPages', () => {
  const rows = [
    { id: 'h1', site_name: 'Hôtel Particulier', page_title: 'Accueil', url: 'https://h.fr/' },
    { id: 's1', site_name: 'Stripe', page_title: 'Pricing | Stripe', url: 'https://stripe.com/pricing' },
    { id: 'p1', site_name: null, page_title: null, url: 'https://pending.io/' },
  ];

  it('should match ignoring case and accents', () => {
    expect(filterPages(rows, 'hotel').map((r) => r.id)).toEqual(['h1']);
  });

  it('should match on URL', () => {
    expect(filterPages(rows, 'PRICING').map((r) => r.id)).toEqual(['s1']);
    expect(filterPages(rows, 'pending.io').map((r) => r.id)).toEqual(['p1']);
  });

  it('should ignore the page title, which the card does not show', () => {
    expect(filterPages(rows, 'accueil')).toEqual([]);
  });

  it('should ignore the URL scheme, which the card does not show', () => {
    expect(filterPages(rows, 'https')).toEqual([]);
  });

  it('should return everything for a blank query', () => {
    expect(filterPages(rows, '  ').length).toBe(rows.length);
  });
});
