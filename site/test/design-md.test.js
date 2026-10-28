import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parse } from 'yaml';
import { renderDesignMd } from '../lib/design-md.js';

const analysis = JSON.parse(readFileSync(join(import.meta.dirname, 'fixtures', 'analysis-leadpages-pricing.json'), 'utf8'));
const page = {
  url: 'https://www.leadpages.com/pricing',
  site_name: 'Leadpages',
  page_title: 'Pricing | Leadpages',
  captured_at: '2026-10-27T17:02:44Z',
  display_name: null,
  site_type: 'SaaS',
  page_type: 'Pricing',
  styles: ['Tech'],
  tags: ['grille tarifaire', 'toggle annuel'],
  notes: 'Grille tarifaire en trois colonnes.',
  analysis,
};

const frontMatter = (md) => parse(md.split('---\n')[1]);
const headings = (md) => md.split('\n').filter((l) => l.startsWith('## ')).map((l) => l.slice(3));

describe('renderDesignMd', () => {
  it('should list the tags in the overview', () => {
    expect(renderDesignMd(page)).toContain('- **Tags** : grille tarifaire, toggle annuel');
  });

  it('should start with valid YAML front matter holding the measured tokens', () => {
    const fm = frontMatter(renderDesignMd(page));

    expect(fm.version).toBe('alpha');
    expect(fm.name).toBe('Leadpages');
    expect(fm.colors.primary).toBe('#5a41f6');
    expect(fm.typography.display).toMatchObject({ fontFamily: 'Uxum Grotesque', fontSize: '56px' });
    expect(fm.rounded).toEqual(analysis.rounded);
    expect(fm.spacing).toEqual(analysis.spacing);
    expect(fm.components['button-primary'].backgroundColor).toBe('{colors.primary}');
  });

  it('should keep the sections in the order the spec requires', () => {
    expect(headings(renderDesignMd(page))).toEqual([
      'Overview', 'Colors', 'Typography', 'Layout', 'Elevation & Depth', 'Shapes', 'Components',
    ]);
  });

  it('should restore the role and scale order that jsonb storage loses', () => {
    const shuffled = {
      ...analysis,
      colors: { text: '#111114', border: '#ededec', primary: '#5a41f6', surface: '#ffffff', background: '#fafaf9' },
      typography: { body: analysis.typography.body, display: analysis.typography.display, headline: analysis.typography.headline },
      rounded: { md: '9px', sm: '6px', full: '9999px', lg: '16px' },
      spacing: { md: '10px', xs: '4px', '2xl': '26px', sm: '8px' },
    };
    const fm = frontMatter(renderDesignMd({ ...page, analysis: shuffled }));

    expect(Object.keys(fm.colors)).toEqual(['background', 'surface', 'text', 'primary', 'border']);
    expect(Object.keys(fm.typography)).toEqual(['display', 'headline', 'body']);
    expect(Object.keys(fm.rounded)).toEqual(['sm', 'md', 'lg', 'full']);
    expect(Object.keys(fm.spacing)).toEqual(['xs', 'sm', 'md', '2xl']);
  });

  it("should declare Do's and Don'ts as omitted rather than invent them", () => {
    const fm = frontMatter(renderDesignMd(page));

    expect(fm.omitted).toEqual([expect.objectContaining({ section: "Do's and Don'ts" })]);
  });

  it('should carry the corrected name, the taxonomy and the notes', () => {
    const md = renderDesignMd({ ...page, display_name: 'Leadpages (tarifs)' });

    expect(frontMatter(md).name).toBe('Leadpages (tarifs)');
    expect(md).toContain('SaaS');
    expect(md).toContain('Pricing');
    expect(md).toContain('Tech');
    expect(md).toContain('Grille tarifaire en trois colonnes.');
    expect(md).toContain('https://www.leadpages.com/pricing');
  });

  it('should quote values that YAML would misread', () => {
    const md = renderDesignMd({ ...page, display_name: 'Acme: "Studio" #1', analysis: { ...analysis, meta: { ...analysis.meta, description: 'yes' } } });
    const fm = frontMatter(md);

    expect(fm.name).toBe('Acme: "Studio" #1');
    expect(fm.description).toBe('yes');
  });

  it('should still render a short file when the page has no analysis yet', () => {
    const md = renderDesignMd({ ...page, analysis: null });

    expect(frontMatter(md).name).toBe('Leadpages');
    expect(headings(md)).toEqual(['Overview']);
    expect(md).toContain('Refaire la capture');
  });
});
