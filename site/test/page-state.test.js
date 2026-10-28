import { describe, expect, it } from 'vitest';
import { activityLabel, hasUnsavedChanges, statusLabel } from '../lib/page-state.js';

describe('hasUnsavedChanges', () => {
  const saved = { display_name: 'Leadpages', site_type: null, page_type: 'Pricing', styles: ['Tech', 'Minimal'], notes: null };
  const same = { display_name: 'Leadpages', site_type: null, page_type: 'Pricing', styles: ['Tech', 'Minimal'], notes: null };

  it('should be false when the form matches the saved page', () => {
    expect(hasUnsavedChanges(saved, same)).toBe(false);
  });

  it('should ignore the order of styles', () => {
    expect(hasUnsavedChanges(saved, { ...same, styles: ['Minimal', 'Tech'] })).toBe(false);
  });

  it('should treat a missing styles list as empty', () => {
    expect(hasUnsavedChanges({ ...saved, styles: undefined }, { ...same, styles: [] })).toBe(false);
  });

  it('should detect an edited text field', () => {
    expect(hasUnsavedChanges(saved, { ...same, notes: 'Belle grille' })).toBe(true);
  });

  it('should detect an added style', () => {
    expect(hasUnsavedChanges(saved, { ...same, styles: ['Tech', 'Minimal', 'Luxe'] })).toBe(true);
  });
});

describe('statusLabel', () => {
  it('should name a capture in progress', () => {
    expect(statusLabel({ status: 'processing', job: 'capture' })).toBe('capture en cours');
  });

  it('should name an analysis-only job', () => {
    expect(statusLabel({ status: 'pending', job: 'analysis' })).toBe('analyse en attente');
    expect(statusLabel({ status: 'processing', job: 'analysis' })).toBe('analyse en cours');
  });

  it('should return null for a ready page', () => {
    expect(statusLabel({ status: 'ready', job: 'capture' })).toBe(null);
  });
});

describe('activityLabel', () => {
  const busy = (url, status, job = 'capture') => ({ url, status, job });

  it('should return null when the robot has nothing to do', () => {
    expect(activityLabel([busy('https://a.com/', 'ready'), busy('https://b.com/', 'failed')])).toBe(null);
  });

  it('should name the one page being captured or analysed', () => {
    expect(activityLabel([busy('https://www.awwwards.com/websites/nominees/', 'processing')]))
      .toEqual({ title: '1 capture en cours', detail: 'awwwards.com/websites/nominees' });
    expect(activityLabel([busy('https://a.com/', 'pending', 'analysis')]))
      .toEqual({ title: '1 analyse en cours', detail: 'a.com' });
  });

  it('should count mixed jobs and list at most three sites', () => {
    const pages = ['a', 'b', 'c', 'd'].map((h, i) => busy(`https://${h}.com/`, 'pending', i ? 'capture' : 'analysis'));

    expect(activityLabel(pages)).toEqual({ title: '4 traitements en cours', detail: 'a.com, b.com, c.com…' });
  });
});
