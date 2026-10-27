import { describe, expect, it } from 'vitest';
import { extractSiteName } from '../src/site-name.js';

describe('extractSiteName', () => {
  it('should prefer og:site_name', () => {
    expect(extractSiteName({ ogSiteName: 'Stripe', title: 'Pricing | Stripe', hostname: 'stripe.com' })).toBe('Stripe');
  });

  it('should fall back to application-name', () => {
    expect(extractSiteName({ applicationName: 'Linear', title: 'x', hostname: 'linear.app' })).toBe('Linear');
  });

  it('should take the shortest title segment', () => {
    expect(extractSiteName({ title: 'Tarifs et forfaits complets — Notion', hostname: 'www.notion.so' })).toBe('Notion');
    expect(extractSiteName({ title: 'Hôtel Particulier · Accueil', hostname: 'h.fr' })).toBe('Accueil');
    expect(extractSiteName({ title: 'Tarifs détaillés – Linear', hostname: 'linear.app' })).toBe('Linear');
  });

  it('should fall back to the hostname without www', () => {
    expect(extractSiteName({ title: '', hostname: 'www.aesop.com' })).toBe('aesop.com');
  });

  it('should ignore blank metadata and use a title without separators as is', () => {
    expect(extractSiteName({ ogSiteName: '  ', title: 'Seul titre', hostname: 'a.fr' })).toBe('Seul titre');
  });
});
