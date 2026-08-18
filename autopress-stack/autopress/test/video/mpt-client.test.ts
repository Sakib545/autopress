import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import type { AddressInfo } from 'node:net';

/**
 * Exercises the real client against a stub MoneyPrinterTurbo.
 *
 * src/lib/env.ts snapshots process.env at import time, so the environment is
 * fixed here before the client is ever imported, and scenarios that need a
 * different environment live in sibling files (node:test isolates per file).
 * No database, no Redis, no traffic beyond loopback.
 */

const TASK = 'cd1727ed-3473-42a2-a7da-4faafafec72b';
type Mode = 'ok' | 'complete-no-url' | 'failed' | 'garbage' | 'error500';

let server: http.Server;
let port = 0;
let mode: Mode = 'ok';

function json(res: http.ServerResponse, status: number, body: unknown) {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
}

function buildServer() {
  return http.createServer((req, res) => {
    const url = req.url ?? '';

    if (mode === 'error500') return json(res, 500, { message: 'boom' });
    if (mode === 'garbage') {
      res.writeHead(200, { 'Content-Type': 'text/html' });
      return res.end('<html>not json</html>');
    }

    if (req.method === 'POST' && url.startsWith('/api/v1/videos')) {
      return json(res, 200, { status: 200, data: { task_id: TASK } });
    }

    if (url.startsWith(`/api/v1/tasks/${TASK}`)) {
      if (mode === 'failed') {
        return json(res, 200, { status: 200, data: { state: -1, message: 'no material found' } });
      }
      if (mode === 'complete-no-url') {
        return json(res, 200, { status: 200, data: { state: 1, videos: [] } });
      }
      return json(res, 200, {
        status: 200,
        data: {
          state: 1,
          progress: 100,
          // Exactly what MoneyPrinterTurbo returns: a path on its own filesystem.
          videos: [`/opt/MoneyPrinterTurbo/storage/tasks/${TASK}/final-1.mp4`],
        },
      });
    }

    if (url.startsWith('/api/v1/tasks')) return json(res, 200, { status: 200, data: { tasks: [], total: 0 } });
    return json(res, 404, { message: 'not found' });
  });
}

const listen = (srv: http.Server, p: number) =>
  new Promise<void>((resolve) => srv.listen(p, '127.0.0.1', resolve));
const close = (srv: http.Server) => new Promise<void>((resolve) => srv.close(() => resolve()));

// Reserve a port, then pin the environment to it before the client is imported.
before(async () => {
  server = buildServer();
  await listen(server, 0);
  port = (server.address() as AddressInfo).port;
  process.env.MPT_ENABLED = 'true';
  process.env.MPT_API_URL = `http://127.0.0.1:${port}`;
  process.env.MPT_PUBLIC_BASE_URL = '';
  process.env.MPT_PUBLIC_URL = '';
  process.env.MPT_API_KEY = '';
});

after(async () => {
  if (server.listening) await close(server);
});

const baseUrl = () => `http://127.0.0.1:${port}`;
const client = async () => (await import('../../src/lib/video/mpt-client')).mptClient;

const REQUEST = {
  video_subject: 'Compressing video',
  video_script: 'Compression keeps quality high. Read the full article on our website.',
  video_aspect: '9:16' as const,
  video_source: 'pexels' as const,
  video_count: 1,
  video_language: 'en',
  voice_name: 'en-US-AriaNeural-Female',
  subtitle_enabled: true,
};

describe('MoneyPrinterTurbo client', () => {
  it('3. creates a task and returns its id', async () => {
    mode = 'ok';
    assert.equal(await (await client()).createTask(REQUEST), TASK);
  });

  it('4. polls to completion and maps the filesystem path to a download URL', async () => {
    mode = 'ok';
    const status = await (await client()).getTask(TASK);
    assert.equal(status.state, 'COMPLETE');
    assert.equal(status.progress, 100);
    // The whole point of mpt-url: a naive join produced a 404 before this.
    assert.equal(status.videoUrl, `${baseUrl()}/api/v1/download/${TASK}/final-1.mp4`);
  });

  it('5. surfaces a failed task with its reason', async () => {
    mode = 'failed';
    const status = await (await client()).getTask(TASK);
    assert.equal(status.state, 'FAILED');
    assert.equal(status.error, 'no material found');
    assert.equal(status.videoUrl, null);
  });

  it('9. never fabricates a URL when a completed task returned no file', async () => {
    mode = 'complete-no-url';
    const status = await (await client()).getTask(TASK);
    assert.equal(status.state, 'COMPLETE');
    assert.equal(status.videoUrl, null);
    assert.match(status.urlError ?? '', /no video files/i);
  });

  it('treats a non-JSON body as a request error, not a crash', async () => {
    mode = 'garbage';
    await assert.rejects(async () => (await client()).getTask(TASK), /non-JSON/);
  });

  it('treats a 5xx as a retryable outage', async () => {
    mode = 'error500';
    const { VideoServiceUnavailableError } = await import('../../src/lib/video/types');
    await assert.rejects(
      async () => (await client()).getTask(TASK),
      (e: Error) => e instanceof VideoServiceUnavailableError,
    );
  });

  it('rejects an unsafe task id before it reaches the URL', async () => {
    mode = 'ok';
    await assert.rejects(async () => (await client()).getTask('../../etc/passwd'), /Invalid MoneyPrinterTurbo task id/);
  });

  it('refuses to dispatch an empty narration script', async () => {
    mode = 'ok';
    await assert.rejects(
      async () => (await client()).createTask({ ...REQUEST, video_script: '   ' }),
      /empty narration/i,
    );
  });

  it('refuses to dispatch without a voice name', async () => {
    // Regression: an empty voice made MPT fail at the audio stage with
    // "Invalid voice ''", which looked like an AutoPress bug for a while.
    mode = 'ok';
    await assert.rejects(
      async () => (await client()).createTask({ ...REQUEST, voice_name: '' }),
      /without a voice name/i,
    );
  });

  it('answers the connection check while the service is up', async () => {
    mode = 'ok';
    assert.equal(await (await client()).ping(), true);
  });

  // Kept last: it takes the stub down, then brings it back on the same port.
  it('2. reports the service unreachable when it is offline', async () => {
    mode = 'ok';
    const mpt = await client();
    const { VideoServiceUnavailableError } = await import('../../src/lib/video/types');

    await close(server);
    await assert.rejects(
      () => mpt.createTask(REQUEST),
      (e: Error) => e instanceof VideoServiceUnavailableError,
      'an offline service must raise the retryable error, not a generic one',
    );
    assert.equal(await mpt.ping(), false);

    server = buildServer();
    await listen(server, port);
    assert.equal(await mpt.ping(), true, 'client recovers once the service returns');
  });
});
