import { describe, expect, it } from 'vitest';
import { hasUnsavedChanges, statusLabel } from '../lib/page-state.js';

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
