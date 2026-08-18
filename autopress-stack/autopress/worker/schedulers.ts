import { getQueue } from '../src/lib/queues';

/**
 * Repeatable jobs only *schedule* work — they select candidates and enqueue
 * unit-of-work jobs, so a slow model call can never block the tick.
 */
export async function registerSchedulers() {
  const registrations: { queue: Parameters<typeof getQueue>[0]; pattern: string; name: string }[] = [
    { queue: 'topic.discover', pattern: '0 6 * * *', name: 'daily-topic-discovery' },
    { queue: 'publish.run', pattern: '*/5 * * * *', name: 'publish-tick' },
    { queue: 'refresh.scan', pattern: '30 3 * * *', name: 'daily-freshness-scan' },
    { queue: 'links.check', pattern: '0 4 * * 1', name: 'weekly-link-check' },
    { queue: 'metrics.sync', pattern: '0 5 * * *', name: 'daily-metrics-sync' },
    // Video: sweep for stranded QUEUED rows, and poll in-flight MPT tasks.
    { queue: 'video.generate', pattern: '*/10 * * * *', name: 'video-dispatch-sweep' },
    { queue: 'video.poll', pattern: '*/2 * * * *', name: 'video-poll-tick' },
  ];

  for (const reg of registrations) {
    const queue = getQueue(reg.queue);
    if (!queue) continue;
    await queue.add(
      reg.queue,
      { trigger: 'scheduler' },
      {
        repeat: { pattern: reg.pattern, key: reg.name },
        jobId: reg.name,
        removeOnComplete: { count: 50 },
      },
    );
    console.log(`[scheduler] ${reg.name} -> ${reg.queue} (${reg.pattern})`);
  }
}
