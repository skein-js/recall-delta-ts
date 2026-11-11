import type { Observation } from '@skein-js/recall-delta';
import type { WarehouseInput } from './domain.js';

const observedAt = '2026-11-01T08:00:00Z';
export function report(
  observationId: string,
  warehouse: string,
  diagnosis: string,
  action: string,
): Observation {
  return {
    observationId,
    kind: 'document',
    observedAt,
    source: { type: 'incident-report', id: observationId },
    content: { warehouse, symptom: 'dispatch ERP stock discrepancy', diagnosis, action },
  };
}
export const demoSteps: WarehouseInput[] = [
  {
    runId: 'demo-1',
    cues: ['dispatch ERP discrepancy warehouse north'],
    observations: [
      report('incident-north', 'north', 'delayed-posting', 'wait-for-job'),
      report('incident-south', 'south', 'delayed-posting', 'wait-for-job'),
    ],
    system: { warehouse: 'north', dispatchPosted: false, erpUpdated: false, postingJob: 'pending' },
  },
  {
    runId: 'demo-2',
    cues: ['dispatch ERP discrepancy warehouse south'],
    observations: [],
    system: { warehouse: 'south', dispatchPosted: false, erpUpdated: false, postingJob: 'missing' },
  },
];
