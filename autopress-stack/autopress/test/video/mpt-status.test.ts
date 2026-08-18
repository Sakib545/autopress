import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  normaliseState, collectVideoPaths, shouldAutoRetry, hasPollTimedOut, isTransientPollFailure,
} from '../../src/lib/video/mpt-status';

describe('normaliseState', () => {
  it('maps MPT numeric codes', () => {
    assert.equal(normaliseState({ state: -1 }), 'FAILED');
    assert.equal(normaliseState({ state: 0 }), 'PENDING');
    assert.equal(normaliseState({ state: 1 }), 'COMPLETE');
    assert.equal(normaliseState({ state: 4 }), 'PROCESSING');
  });

  it('maps the string variants other MPT builds emit', () => {
    assert.equal(normaliseState({ state: 'complete' }), 'COMPLETE');
    assert.equal(normaliseState({ state: 'SUCCESS' }), 'COMPLETE');
    assert.equal(normaliseState({ state: 'failure' }), 'FAILED');
    assert.equal(normaliseState({ state: 'running' }), 'PROCESSING');
  });

  it('handles a numeric code delivered as a string', () => {
    // Regression: "1" fell through to the word branch and reported a finished
    // task as PENDING, which then polled until the deadline.
    assert.equal(normaliseState({ state: '1' }), 'COMPLETE');
    assert.equal(normaliseState({ state: '-1' }), 'FAILED');
    assert.equal(normaliseState({ state: ' 4 ' }), 'PROCESSING');
    assert.equal(normaliseState({ state: '0' }), 'PENDING');
  });

  it('treats anything unknown as still pending, never as complete', () => {
    assert.equal(normaliseState({ state: 'banana' }), 'PENDING');
    assert.equal(normaliseState({ state: 99 }), 'PENDING');
  });
});

describe('collectVideoPaths', () => {
  it('prefers combined videos and drops empty entries', () => {
    const got = collectVideoPaths({ state: 1, combined_videos: ['/a/combined-1.mp4', ''], videos: ['/a/final-1.mp4'] });
    assert.deepEqual(got, ['/a/combined-1.mp4', '/a/final-1.mp4']);
  });

  it('returns an empty list when the task carried no files', () => {
    assert.deepEqual(collectVideoPaths({ state: 1 }), []);
  });
});

describe('shouldAutoRetry', () => {
  const base = { autoRetryEnabled: true, retryable: true, attempts: 1, maxRetries: 3 };

  it('retries a retryable failure within budget', () => {
    assert.equal(shouldAutoRetry(base), true);
  });

  it('stops at the retry ceiling', () => {
    assert.equal(shouldAutoRetry({ ...base, attempts: 3 }), false);
  });

  it('never retries when MPT_AUTO_RETRY is off', () => {
    assert.equal(shouldAutoRetry({ ...base, autoRetryEnabled: false }), false);
  });

  it('never retries a rejected request, only an unreachable service', () => {
    assert.equal(shouldAutoRetry({ ...base, retryable: false }), false);
  });

  it('honours MPT_MAX_RETRIES=0', () => {
    assert.equal(shouldAutoRetry({ ...base, attempts: 0, maxRetries: 0 }), false);
  });
});

describe('hasPollTimedOut', () => {
  const now = new Date('2026-08-18T12:00:00Z');

  it('times out once MPT_MAX_POLL_MINUTES has elapsed', () => {
    assert.equal(
      hasPollTimedOut({ startedAt: new Date('2026-08-18T11:20:00Z'), now, maxPollMinutes: 30 }),
      true,
    );
  });

  it('keeps polling inside the window', () => {
    assert.equal(
      hasPollTimedOut({ startedAt: new Date('2026-08-18T11:45:00Z'), now, maxPollMinutes: 30 }),
      false,
    );
  });

  it('does not time out a row that never started', () => {
    assert.equal(hasPollTimedOut({ startedAt: null, now, maxPollMinutes: 30 }), false);
  });
});

describe('isTransientPollFailure', () => {
  it('treats an unreachable service as a hiccup, not a broken video', () => {
    // MPT's API stalls while ffmpeg encodes; the job is fine.
    const err = new Error('MoneyPrinterTurbo is unreachable: ... — timed out after 45000ms');
    err.name = 'VideoServiceUnavailableError';
    assert.equal(isTransientPollFailure(err), true);
  });

  it('recognises the usual network failures by message', () => {
    for (const m of ['fetch failed', 'connect ECONNREFUSED 127.0.0.1:8080', 'socket hang up', 'timed out after 45000ms']) {
      assert.equal(isTransientPollFailure(new Error(m)), true, m);
    }
  });

  it('does not swallow a real error', () => {
    assert.equal(isTransientPollFailure(new Error('MoneyPrinterTurbo returned non-JSON from /tasks/x')), false);
    assert.equal(isTransientPollFailure(new Error('Invalid MoneyPrinterTurbo task id')), false);
    assert.equal(isTransientPollFailure(null), false);
  });
});
