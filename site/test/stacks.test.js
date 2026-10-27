import { describe, expect, it } from 'vitest';
import { domainOf, groupBySite } from '../lib/stacks.js';

const p = (id, url) => ({ id, url });

describe('domainOf', () => {
  it('should drop www and keep subdomains', () => {
    expect(domainOf('https://www.Leadpages.com/pricing')).toBe('leadpages.com');
    expect(domainOf('https://blog.leadpages.com/')).toBe('blog.leadpages.com');
  });
});

describe('groupBySite', () => {
  it('should stack pages of the same site where its most recent page sits', () => {
    const pages = [
      p('a', 'https://leadpages.com/pricing'),
      p('b', 'https://linear.app/'),
      p('c', 'https://www.leadpages.com/'),
      p('d', 'https://leadpages.com/templates'),
    ];

    expect(groupBySite(pages)).toEqual([
      { kind: 'stack', domain: 'leadpages.com', pages: [pages[0], pages[2], pages[3]] },
      { kind: 'page', page: pages[1] },
    ]);
  });

  it('should leave a site with a single page as a plain card', () => {
    expect(groupBySite([p('a', 'https://a.com/')])).toEqual([{ kind: 'page', page: p('a', 'https://a.com/') }]);
  });
});
