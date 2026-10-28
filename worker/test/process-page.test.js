import { describe, expect, it } from 'vitest';
import { processPage } from '../src/process-page.js';

const row = { id: 'abc', url: 'https://a.com/pricing' };
const captured = {
  jpeg: Buffer.from([0xff, 0xd8]),
  siteName: 'A',
  pageTitle: 'Pricing | A',
  finalUrl: 'https://a.com/pricing',
  warnings: ['1 popup(s) masquée(s) sans bouton de fermeture'],
  analysis: { version: 1, colors: { primary: '#0069ff' } },
};

function fakes({ captureResults = [captured], uploadError } = {}) {
  const calls = { capture: 0, upload: [], update: [] };
  return {
    calls,
    deps: {
      capture: async () => {
        const result = captureResults[Math.min(calls.capture++, captureResults.length - 1)];
        if (result instanceof Error) throw result;
        return result;
      },
      upload: async (path, buffer) => {
        calls.upload.push([path, buffer]);
        if (uploadError) throw uploadError;
      },
      update: async (id, fields) => {
        calls.update.push([id, fields]);
      },
    },
  };
}

describe('processPage', () => {
  it('should upload the thumbnail and mark the page ready', async () => {
    const { calls, deps } = fakes();

    const status = await processPage(row, deps);

    expect(status).toBe('ready');
    expect(calls.upload).toEqual([['abc.jpg', captured.jpeg]]);
    expect(calls.update).toHaveLength(1);
    const [id, fields] = calls.update[0];
    expect(id).toBe('abc');
    expect(fields).toMatchObject({
      status: 'ready',
      site_name: 'A',
      page_title: 'Pricing | A',
      final_url: 'https://a.com/pricing',
      thumbnail_path: 'abc.jpg',
      capture_warnings: captured.warnings,
      analysis: captured.analysis,
      error: null,
    });
    expect(new Date(fields.captured_at).toISOString()).toBe(fields.captured_at);
  });

  it('should retry once when the first capture fails', async () => {
    const { calls, deps } = fakes({ captureResults: [new Error('timeout'), captured] });

    const status = await processPage(row, deps);

    expect(status).toBe('ready');
    expect(calls.capture).toBe(2);
  });

  it('should mark the page failed with the first error line after two failures', async () => {
    const err = new Error('net::ERR_BLOCKED\nstack…');
    const { calls, deps } = fakes({ captureResults: [err, err] });

    const status = await processPage(row, deps);

    expect(status).toBe('failed');
    expect(calls.upload).toHaveLength(0);
    expect(calls.update).toEqual([['abc', { status: 'failed', error: 'net::ERR_BLOCKED' }]]);
  });

  it('should mark the page failed when the upload fails', async () => {
    const { calls, deps } = fakes({ uploadError: new Error('storage down') });

    const status = await processPage(row, deps);

    expect(status).toBe('failed');
    expect(calls.update.at(-1)[1]).toMatchObject({ status: 'failed', error: 'storage down' });
  });

  describe('analysis job', () => {
    const analysisRow = { ...row, job: 'analysis', capture_warnings: ['ancienne alerte'] };

    it('should store the analysis without replacing the thumbnail', async () => {
      const { calls, deps } = fakes();

      const status = await processPage(analysisRow, deps);

      expect(status).toBe('ready');
      expect(calls.upload).toHaveLength(0);
      expect(calls.update).toEqual([['abc', {
        status: 'ready',
        job: 'capture',
        analysis: captured.analysis,
        capture_warnings: captured.warnings,
        error: null,
      }]]);
    });

    it('should keep the page ready with a warning when the page cannot be loaded', async () => {
      const err = new Error('net::ERR_BLOCKED\nstack…');
      const { calls, deps } = fakes({ captureResults: [err, err] });

      const status = await processPage(analysisRow, deps);

      expect(status).toBe('ready');
      expect(calls.update).toEqual([['abc', {
        status: 'ready',
        job: 'capture',
        capture_warnings: ['ancienne alerte', 'analyse impossible : net::ERR_BLOCKED'],
      }]]);
    });
  });
});
