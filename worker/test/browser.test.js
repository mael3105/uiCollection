import { describe, expect, it } from 'vitest';
import { createBrowserProvider } from '../src/browser.js';

function fakeBrowser() {
  return { connected: true, isConnected() { return this.connected; }, async close() { this.connected = false; } };
}

describe('createBrowserProvider', () => {
  it('should reuse the browser while it is connected', async () => {
    let launches = 0;
    const provider = createBrowserProvider(async () => { launches++; return fakeBrowser(); });

    const first = await provider.get();
    const second = await provider.get();

    expect(second).toBe(first);
    expect(launches).toBe(1);
  });

  it('should relaunch after the browser crashed', async () => {
    let launches = 0;
    const provider = createBrowserProvider(async () => { launches++; return fakeBrowser(); });

    const first = await provider.get();
    first.connected = false;
    const second = await provider.get();

    expect(second).not.toBe(first);
    expect(launches).toBe(2);
  });
});
