import { describe, expect, it } from 'vitest';
import { createThumbnails } from '../lib/thumbnails.js';

const ready = (id, extra = {}) => ({ id, status: 'ready', thumbnail_path: `${id}.jpg`, captured_at: '2026-10-27T10:00:00Z', ...extra });

function fakeSign(results) {
  const calls = [];
  const sign = async (paths) => {
    calls.push(paths);
    return paths.map((p) => ({ path: p, signedUrl: results[p] ?? null }));
  };
  return { calls, sign };
}

describe('createThumbnails', () => {
  it('should sign ready pages once and expose their URL', async () => {
    const { calls, sign } = fakeSign({ 'a.jpg': 'https://signed/a' });
    const thumbs = createThumbnails({ sign, ttlMs: 3600_000 });

    const changed = await thumbs.refresh([ready('a'), { id: 'b', status: 'pending' }]);
    const again = await thumbs.refresh([ready('a')]);

    expect(changed).toBe(true);
    expect(again).toBe(false);
    expect(calls).toEqual([['a.jpg']]);
    expect(thumbs.urlFor(ready('a'))).toBe('https://signed/a');
  });

  it('should not retry a thumbnail that could not be signed', async () => {
    const { calls, sign } = fakeSign({});
    const thumbs = createThumbnails({ sign, ttlMs: 3600_000 });

    expect(await thumbs.refresh([ready('gone')])).toBe(false);
    expect(await thumbs.refresh([ready('gone')])).toBe(false);
    expect(calls).toHaveLength(1);
    expect(thumbs.urlFor(ready('gone'))).toBe(null);
  });

  it('should sign only once for concurrent refreshes', async () => {
    const { calls, sign } = fakeSign({ 'a.jpg': 'https://signed/a' });
    const thumbs = createThumbnails({ sign, ttlMs: 3600_000 });

    await Promise.all([thumbs.refresh([ready('a')]), thumbs.refresh([ready('a')])]);

    expect(calls).toHaveLength(1);
  });

  it('should re-sign URLs close to expiry', async () => {
    let clock = 0;
    const { calls, sign } = fakeSign({ 'a.jpg': 'https://signed/a' });
    const thumbs = createThumbnails({ sign, ttlMs: 3600_000, now: () => clock });

    await thumbs.refresh([ready('a')]);
    clock = 3600_000 - 60_000;
    const changed = await thumbs.refresh([ready('a')]);

    expect(changed).toBe(true);
    expect(calls).toHaveLength(2);
  });

  it('should sign again after a recapture', async () => {
    const { calls, sign } = fakeSign({ 'a.jpg': 'https://signed/a' });
    const thumbs = createThumbnails({ sign, ttlMs: 3600_000 });

    await thumbs.refresh([ready('a')]);
    await thumbs.refresh([ready('a', { captured_at: '2026-10-28T10:00:00Z' })]);

    expect(calls).toHaveLength(2);
  });
});
