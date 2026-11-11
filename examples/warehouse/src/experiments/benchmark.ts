import { performance } from 'node:perf_hooks';
import { createMemoryRecallStore, createRecallDelta, defaultPolicy } from '@skein-js/recall-delta';
import { makeWarehouseGraph } from '../graph.js';
import type { Mode } from '../domain.js';
import type { CaseFamily } from './cases.js';

export interface Measurement {
  familyId: string;
  repetition: number;
  mode: string;
  success: boolean;
  latencyMs: number;
  operatingCost: null;
  planner: 'fixture';
  toolCalls: number;
}
export async function runBenchmark(cases: CaseFamily[], repetitions = 3): Promise<Measurement[]> {
  const measurements: Measurement[] = [];
  const variants: { name: string; mode: Mode; policy: Partial<typeof defaultPolicy> }[] = [
    { name: 'context', mode: 'context', policy: { recallMode: 'retrieval', reinforce: false } },
    {
      name: 'summary',
      mode: 'summary',
      policy: { recallMode: 'recent', reinforce: false, candidateLimit: 4 },
    },
    { name: 'retrieval', mode: 'retrieval', policy: { recallMode: 'retrieval', reinforce: false } },
    { name: 'associative', mode: 'associative', policy: {} },
    { name: 'no-activation', mode: 'associative', policy: { carry: 0 } },
    { name: 'no-reinforcement', mode: 'associative', policy: { reinforce: false } },
    { name: 'no-associations', mode: 'associative', policy: { spread: 0 } },
  ];
  for (const family of cases)
    for (let repetition = 0; repetition < repetitions; repetition++)
      for (const variant of variants) {
        const memory = createRecallDelta({
          store: createMemoryRecallStore(),
          context: { tenantId: family.familyId, scopeId: 'private', principalId: 'fixture-user' },
          processingMode: 'deferred',
          policy: variant.policy,
        });
        const graph = makeWarehouseGraph({ memory: () => memory, mode: variant.mode });
        const start = performance.now();
        const warmup = await graph.invoke({
          ...family.input,
          runId: `${family.input.runId}:partial`,
          cues: ['dispatch ERP stock discrepancy'],
        });
        const result = await graph.invoke({ ...family.input, observations: [], view: warmup.view });
        measurements.push({
          familyId: family.familyId,
          repetition,
          mode: variant.name,
          success:
            result.plan?.diagnosis === family.expected.diagnosis &&
            result.plan.action === family.expected.action &&
            result.actionCommitted,
          latencyMs: performance.now() - start,
          operatingCost: null,
          planner: 'fixture',
          toolCalls: warmup.toolCalls + result.toolCalls,
        });
      }
  return measurements;
}
export function summarize(measurements: Measurement[]) {
  return [...new Set(measurements.map((row) => row.mode))].map((mode) => {
    const rows = measurements.filter((row) => row.mode === mode),
      latencies = rows.map((row) => row.latencyMs).sort((a, b) => a - b);
    return {
      mode,
      runs: rows.length,
      successRate: rows.filter((row) => row.success).length / rows.length,
      meanToolCalls: rows.reduce((sum, row) => sum + row.toolCalls, 0) / rows.length,
      p95LatencyMs:
        latencies[Math.min(latencies.length - 1, Math.ceil(latencies.length * 0.95) - 1)] ?? null,
    };
  });
}
/** Average repetitions inside each family before bootstrap: they are not independent cases. */
export function pairedInterval(
  measurements: Measurement[],
  baseline: string,
): [number, number] | null {
  const families = [...new Set(measurements.map((row) => row.familyId))];
  const mean = (values: number[]) => values.reduce((sum, value) => sum + value, 0) / values.length;
  const differences = families.flatMap((family) => {
    const selected = measurements.filter((row) => row.familyId === family);
    const a = selected.filter((row) => row.mode === 'associative'),
      b = selected.filter((row) => row.mode === baseline);
    return a.length && b.length
      ? [mean(a.map((row) => Number(row.success))) - mean(b.map((row) => Number(row.success)))]
      : [];
  });
  if (!differences.length) return null;
  let seed = 20261111;
  const samples = Array.from({ length: 2000 }, () =>
    mean(
      differences.map(() => {
        seed = (Math.imul(1664525, seed) + 1013904223) >>> 0;
        return differences[seed % differences.length] ?? 0;
      }),
    ),
  ).sort((a, b) => a - b);
  return [samples[49] ?? 0, samples[1949] ?? 0];
}
