import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import type { AddressInfo } from 'node:net';

/**
 * MPT_PUBLIC_BASE_URL takes over URL construction when the rendered files are
 * served from a different origin than the API (CDN, reverse proxy).
 * Its own file because env.ts freezes process.env at import.
 */

const TASK = 'cd1727ed-3473-42a2-a7da-4faafafec72b';
let server: http.Server;

before(async () => {
  server = http.createServer((_req, res) => {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      status: 200,
      data: { state: 1, videos: [`/opt/MoneyPrinterTurbo/storage/tasks/${TASK}/final-1.mp4`] },
    }));
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));

  process.env.MPT_ENABLED = 'true';
  process.env.MPT_API_URL = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  process.env.MPT_PUBLIC_BASE_URL = 'https://cdn.example.com';
});

after(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

describe('MPT_PUBLIC_BASE_URL', () => {
  it('serves finished files from the public origin, not the API origin', async () => {
    const { mptClient } = await import('../../src/lib/video/mpt-client');
    const status = await mptClient.getTask(TASK);
    assert.equal(status.videoUrl, `https://cdn.example.com/api/v1/download/${TASK}/final-1.mp4`);
  });
});
