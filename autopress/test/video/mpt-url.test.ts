import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { resolveVideoUrl, resolveFirstVideoUrl, extractTaskFile, isSafeTaskId } from '../../src/lib/video/mpt-url';

const API = 'http://127.0.0.1:8080';
const TASK = 'cd1727ed-3473-42a2-a7da-4faafafec72b';

describe('extractTaskFile', () => {
  it('pulls task id and filename out of an MPT absolute path', () => {
    const got = extractTaskFile(`/opt/MoneyPrinterTurbo/storage/tasks/${TASK}/final-1.mp4`);
    assert.deepEqual(got, { taskId: TASK, filename: 'final-1.mp4' });
  });

  it('handles a relative path', () => {
    assert.deepEqual(extractTaskFile(`./${TASK}/combined-1.mp4`), { taskId: TASK, filename: 'combined-1.mp4' });
  });

  it('rejects a bare filename with no task segment', () => {
    assert.equal(extractTaskFile('final-1.mp4'), null);
  });

  it('refuses path traversal', () => {
    assert.equal(extractTaskFile('/storage/tasks/../../etc/passwd'), null);
  });
});

describe('resolveVideoUrl', () => {
  it('passes an absolute http URL through untouched', () => {
    const got = resolveVideoUrl('https://cdn.example.com/v/final-1.mp4', { apiBaseUrl: API });
    assert.equal(got.ok, true);
    assert.equal(got.ok && got.kind, 'absolute');
    assert.equal(got.ok && got.url, 'https://cdn.example.com/v/final-1.mp4');
  });

  // The bug this module exists to fix: naive joining produced
  // http://127.0.0.1:8080/opt/MoneyPrinterTurbo/storage/tasks/... → 404.
  it('maps an MPT filesystem path onto the download endpoint', () => {
    const got = resolveVideoUrl(`/opt/MoneyPrinterTurbo/storage/tasks/${TASK}/final-1.mp4`, {
      taskId: TASK, apiBaseUrl: API,
    });
    assert.equal(got.ok, true);
    assert.equal(got.ok && got.url, `${API}/api/v1/download/${TASK}/final-1.mp4`);
  });

  it('prefers MPT_PUBLIC_BASE_URL when configured', () => {
    const got = resolveVideoUrl(`/storage/tasks/${TASK}/final-1.mp4`, {
      taskId: TASK, apiBaseUrl: API, publicBaseUrl: 'https://videos.example.com',
    });
    assert.equal(got.ok && got.url, `https://videos.example.com/api/v1/download/${TASK}/final-1.mp4`);
  });

  it('falls back to the known task id when the path carries none', () => {
    const got = resolveVideoUrl('final-1.mp4', { taskId: TASK, apiBaseUrl: API });
    assert.equal(got.ok, false, 'a bare filename has no directory to trust');
  });

  it('never invents a URL when nothing usable was returned', () => {
    const got = resolveVideoUrl('', { taskId: TASK, apiBaseUrl: API });
    assert.equal(got.ok, false);
    assert.match(got.ok === false ? got.reason : '', /empty video path/i);
  });

  it('reports a missing base URL instead of guessing', () => {
    const got = resolveVideoUrl(`/storage/tasks/${TASK}/final-1.mp4`, { taskId: TASK, apiBaseUrl: '' });
    assert.equal(got.ok, false);
    assert.match(got.ok === false ? got.reason : '', /MPT_PUBLIC_BASE_URL|MPT_API_URL/);
  });
});

describe('resolveFirstVideoUrl', () => {
  it('explains an empty completion rather than returning a broken URL', () => {
    const got = resolveFirstVideoUrl([], { taskId: TASK, apiBaseUrl: API });
    assert.equal(got.ok, false);
    assert.match(got.ok === false ? got.reason : '', /returned no video files/i);
  });

  it('skips unusable entries and takes the first that resolves', () => {
    const got = resolveFirstVideoUrl(['', `/storage/tasks/${TASK}/final-2.mp4`], { taskId: TASK, apiBaseUrl: API });
    assert.equal(got.ok && got.url, `${API}/api/v1/download/${TASK}/final-2.mp4`);
  });
});

describe('isSafeTaskId', () => {
  it('accepts uuids and rejects path characters', () => {
    assert.equal(isSafeTaskId(TASK), true);
    assert.equal(isSafeTaskId('../../etc/passwd'), false);
    assert.equal(isSafeTaskId(''), false);
  });
});
