import { z } from 'zod';
const recordSchema = z.object({
  participantId: z.string().min(1),
  taskId: z.enum(['formation', 'explanation', 'correction', 'removal']),
  success: z.boolean(),
  durationSeconds: z.number().finite().nonnegative(),
});
export function gradeUsability(input: unknown) {
  const records = z.array(recordSchema).parse(input);
  const keys = records.map((record) => `${record.participantId}:${record.taskId}`);
  if (new Set(keys).size !== keys.length)
    throw new Error('Duplicate participant/task observations');
  const participants = [...new Set(records.map((record) => record.participantId))];
  const durations = records.map((record) => record.durationSeconds).sort((a, b) => a - b);
  const midpoint = Math.floor(durations.length / 2);
  const medianSeconds = durations.length
    ? durations.length % 2
      ? (durations[midpoint] ?? 0)
      : ((durations[midpoint - 1] ?? 0) + (durations[midpoint] ?? 0)) / 2
    : null;
  const completed = records.filter((record) => record.success).length;
  const completionRate = records.length ? completed / records.length : null;
  const completeStudy =
    participants.length >= 5 &&
    participants.every(
      (id) => records.filter((record) => record.participantId === id).length === 4,
    );
  const verdict = !completeStudy
    ? 'inconclusive'
    : (completionRate ?? 0) >= 0.8 && medianSeconds !== null && medianSeconds < 180
      ? 'supported'
      : 'failed';
  return {
    verdict,
    participants: participants.length,
    recordedTasks: records.length,
    completionRate,
    medianSeconds,
    reason: completeStudy
      ? 'Provided participant observations graded; technical lineage is a separate mechanism check'
      : 'Five unfamiliar participants with all four tasks are required',
  };
}
