import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('built service worker', () => {
  it('leaves companion API requests to the browser network stack', () => {
    // Run the production build before this integration test. A NetworkOnly
    // route still calls respondWith(), which is unnecessary for uncached APIs.
    const worker = readFileSync(new URL('../dist/sw.js', import.meta.url), 'utf8');
    expect(worker).not.toContain('NetworkOnly');
    expect(worker).toContain('precacheAndRoute');
  });
});
