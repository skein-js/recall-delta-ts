import { report } from '../scenario.js';
import type { Plan, WarehouseInput } from '../domain.js';
export interface CaseFamily {
  familyId: string;
  split: 'development' | 'heldout';
  input: WarehouseInput;
  expected: Pick<Plan, 'diagnosis' | 'action'>;
}
const outcomes: Pick<Plan, 'diagnosis' | 'action'>[] = [
  { diagnosis: 'missing-posting', action: 'post-dispatch' },
  { diagnosis: 'delayed-posting', action: 'wait-for-job' },
  { diagnosis: 'stale-erp', action: 'reconcile-erp' },
];
/** Labels live only in this evaluator module; the graph receives input, never this wrapper. */
export function caseFamilies(): CaseFamily[] {
  return Array.from({ length: 120 }, (_, index) => {
    const expected = outcomes[index % outcomes.length];
    if (!expected) throw new Error('Missing evaluator outcome');
    const warehouse = `warehouse-${index}`,
      familyId = `incident-family-${String(index).padStart(3, '0')}`;
    const split = index < 20 ? ('development' as const) : ('heldout' as const);
    const distractor = outcomes[(index + 1) % outcomes.length];
    if (!distractor) throw new Error('Missing distractor');
    return {
      familyId,
      split,
      expected,
      input: {
        runId: familyId,
        cues: [`${warehouse} dispatch ERP stock discrepancy`],
        observations: [
          report(
            `${familyId}-distractor`,
            `warehouse-${index + 120}`,
            distractor.diagnosis,
            distractor.action,
          ),
          report(`${familyId}-experience`, warehouse, expected.diagnosis, expected.action),
        ],
        system: {
          warehouse,
          dispatchPosted: expected.diagnosis === 'stale-erp',
          erpUpdated: false,
          postingJob:
            expected.diagnosis === 'missing-posting'
              ? 'missing'
              : expected.diagnosis === 'delayed-posting'
                ? 'pending'
                : 'complete',
        },
      },
    };
  });
}
