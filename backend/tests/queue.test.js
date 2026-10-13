import { beforeEach, describe, expect, it, vi } from 'vitest';

async function loadQueue() {
  vi.resetModules();
  const module = await import('../src/config/queue.js');
  return module.default || module;
}

function createBoss({ startError = null, sendError = null } = {}) {
  const boss = {
    on: vi.fn(),
    start: vi.fn(async () => {
      if (startError) throw startError;
    }),
    stop: vi.fn(async () => {}),
    createQueue: vi.fn(async () => {}),
    send: vi.fn(async () => {
      if (sendError) throw sendError;
      return 'job-123';
    })
  };
  return boss;
}

describe('pg-boss queue readiness and enqueueing', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('shares one initialization promise and waits until queues are ready', async () => {
    const boss = createBoss();
    const queue = await loadQueue();
    queue.__setBossFactoryForTests(() => boss);
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    const [firstJob, secondJob] = await Promise.all([
      queue.scheduleJob(queue.JOB_QUEUES.CALL_LEAD, { leadId: 'lead-a' }),
      queue.scheduleJob(queue.JOB_QUEUES.CALL_LEAD, { leadId: 'lead-b' })
    ]);

    expect(firstJob).toBe('job-123');
    expect(secondJob).toBe('job-123');
    expect(boss.createQueue).toHaveBeenCalledTimes(3);
    expect(logSpy.mock.calls.filter(([message]) => String(message).includes('Job enqueued to pg-boss'))).toHaveLength(2);
  });

  it('fails clearly when initialization is not ready', async () => {
    const boss = createBoss({ startError: new Error('database unavailable') });
    const queue = await loadQueue();
    queue.__setBossFactoryForTests(() => boss);

    await expect(queue.scheduleJob(queue.JOB_QUEUES.CALL_LEAD, { leadId: 'lead-a' }))
      .rejects.toThrow('Queue initialization failed: database unavailable');

  });

  it('does not log success when pg-boss rejects the enqueue', async () => {
    const boss = createBoss({ sendError: new Error('send failed') });
    const queue = await loadQueue();
    queue.__setBossFactoryForTests(() => boss);
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    await expect(queue.scheduleJob(queue.JOB_QUEUES.CALL_LEAD, { leadId: 'lead-a' }))
      .rejects.toThrow('send failed');
    expect(logSpy.mock.calls.some(([message]) => String(message).includes('Job enqueued to pg-boss'))).toBe(false);
  });
});
