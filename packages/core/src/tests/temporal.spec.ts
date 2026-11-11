import { expect, it } from 'vitest';

import { validTimeSchema } from '../index.js';
import { harness, instant, observation } from './harness.js';

it('orders equivalent and fractional UTC timestamps consistently in intervals and recall', () => {
  const start = '2026-11-11T10:00:00Z';
  const end = '2026-11-11T10:00:00.001Z';
  expect(validTimeSchema.safeParse({ from: start, until: end }).success).toBe(true);
  expect(validTimeSchema.safeParse({ from: end, until: start }).success).toBe(false);
  expect(
    validTimeSchema.safeParse({ from: start, until: '2026-11-11T10:00:00.000Z' }).success,
  ).toBe(false);
  expect(
    validTimeSchema.safeParse({
      from: '2026-11-11T10:00:00.0001Z',
      until: '2026-11-11T10:00:00.0002Z',
    }).success,
  ).toBe(true);
  const { client, setTime, open } = harness({ policy: { reinforce: false } });
  setTime(instant + 1);
  client.observe({
    ...observation('source', {
      statement: 'dispatch status',
      validTime: { from: end, until: '2026-11-11T10:00:01Z' },
    }),
    requestId: 'source',
  });
  const session = open();
  const query = (requestId: string, expectedVersion: number, knownAt: string, validAt: string) =>
    client.advanceSession({
      requestId,
      sessionId: session.sessionId,
      expectedVersion,
      cues: ['dispatch status'],
      evidenceIds: [],
      temporal: { knownAt, validAt },
    });
  expect(query('before-known', 0, start, end).changes).toEqual([]);
  expect(query('before-valid', 1, end, start).changes).toEqual([]);
  expect(query('at-boundary', 2, end, '2026-11-11T10:00:00.0010Z').changes[0]?.type).toBe(
    'candidate.emerged',
  );
  expect(
    query('after-valid', 3, '2026-11-11T10:00:02Z', '2026-11-11T10:00:01.000Z').changes[0]?.type,
  ).toBe('candidate.withdrawn');
});
