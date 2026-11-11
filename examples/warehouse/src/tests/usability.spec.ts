import { expect, it } from 'vitest';

import { gradeUsability } from '../experiments/usability.js';
it('requires independent participants and complete observations before awarding usability success', () => {
  const tasks = ['formation', 'explanation', 'correction', 'removal'];
  const records = Array.from({ length: 5 }, (_, index) =>
    tasks.map((taskId) => ({
      participantId: `participant-${index}`,
      taskId,
      success: true,
      durationSeconds: 90,
    })),
  ).flat();
  expect(gradeUsability(records).verdict).toBe('supported');
  expect(
    gradeUsability(records.filter((record) => record.participantId === 'participant-0')).verdict,
  ).toBe('inconclusive');
  expect(
    gradeUsability(records.map((record) => ({ ...record, durationSeconds: 180 }))).verdict,
  ).toBe('failed');
  expect(() => gradeUsability([...records, records[0]])).toThrow();
});
