import { describe, expect, it } from 'vitest';
import { existingTags, suggest } from '../lib/suggest.js';

describe('suggest', () => {
  const options = ['Startups / SaaS', 'Agence', 'Art & Illustration', 'Média & Magazine', 'Real Estate'];

  it('should put values that start with the query before values that contain it, ignoring case and accents', () => {
    expect(suggest(options, 'a')).toEqual(['Agence', 'Art & Illustration', 'Startups / SaaS', 'Média & Magazine', 'Real Estate']);
    expect(suggest(options, 'media')).toEqual(['Média & Magazine']);
  });

  it('should return every option for an empty query, minus the excluded ones', () => {
    expect(suggest(options, ' ', { exclude: ['agence'] })).toEqual(['Startups / SaaS', 'Art & Illustration', 'Média & Magazine', 'Real Estate']);
  });

  it('should stop at the limit', () => {
    expect(suggest(options, '', { limit: 2 })).toEqual(['Startups / SaaS', 'Agence']);
  });
});

describe('existingTags', () => {
  it('should list each tag once, most used first, keeping the first spelling', () => {
    const pages = [{ tags: ['grille', 'Dégradé'] }, { tags: ['dégradé'] }, { tags: null }, { tags: ['bento'] }];

    expect(existingTags(pages)).toEqual(['Dégradé', 'bento', 'grille']);
  });
});
