import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

/**
 * Scenario 1: MPT_ENABLED=false.
 *
 * Lives in its own file because src/lib/env.ts snapshots process.env when the
 * module is first imported, and node:test gives each file its own process.
 * The assertion that matters: nothing reaches the network, and the error is the
 * typed "disabled" one, so callers can distinguish it from an outage.
 */
process.env.MPT_ENABLED = 'false';
process.env.MPT_API_URL = 'http://127.0.0.1:8080';

describe('MoneyPrinterTurbo disabled', () => {
  it('never calls out and raises the disabled error', async () => {
    const { mptClient } = await import('../../src/lib/video/mpt-client');
    const { VideoServiceDisabledError } = await import('../../src/lib/video/types');

    assert.equal(mptClient.isConfigured(), false);
    await assert.rejects(
      () => mptClient.getTask('cd1727ed-3473-42a2-a7da-4faafafec72b'),
      (e: Error) => e instanceof VideoServiceDisabledError,
    );
    assert.equal(await mptClient.ping(), false);
  });
});
