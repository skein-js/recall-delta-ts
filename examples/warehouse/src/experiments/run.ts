import { z } from 'zod';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { defaultPolicy, protocolCommit } from '@skein-js/recall-delta';
import { historicalContextByteLimit } from '../context.js';
import { caseFamilies } from './cases.js';
import { pairedInterval, runBenchmark, summarize } from './benchmark.js';
import { runMechanics } from './mechanics.js';
import { runAdversarial } from './adversarial.js';
import { hindsightAudit } from './hindsight.js';
import { runLongitudinal } from './longitudinal.js';
import { runRetention } from './retention.js';
import { acceptanceCriteria } from './criteria.js';
import { gradeUsability } from './usability.js';

mkdirSync('reports', { recursive: true });
const heldout = process.argv.includes('--heldout'),
  freeze = process.argv.includes('--freeze');
const allCases = caseFamilies();
const manifest = {
  protocolCommit,
  policy: defaultPolicy,
  historicalContextByteLimit,
  diagnosticToolCallLimit: 8,
  planner: 'deterministic-fixture',
  repetitions: 3,
  generatorRevision: 'warehouse-v2',
  fixtureHash: createHash('sha256').update(JSON.stringify(allCases)).digest('hex'),
  split: { developmentFamilies: 20, heldoutFamilies: 100 },
  limitation:
    'ASCII fixture context uses a conservative 2000-byte cap; live token usage/cost is not measured by this offline harness',
};
const fingerprint = createHash('sha256').update(JSON.stringify(manifest)).digest('hex');
const frozenPath = 'reports/frozen-manifest.json';
const freezeSchema = z.object({
  fingerprint: z.string().regex(/^[a-f0-9]{64}$/),
  selectedBaseline: z.enum(['context', 'summary', 'retrieval']),
});
if (heldout) {
  if (!existsSync(frozenPath))
    throw new Error('Run the development pilot and --freeze before held-out evaluation');
  const saved = freezeSchema.parse(JSON.parse(readFileSync(frozenPath, 'utf8')));
  if (saved.fingerprint !== fingerprint)
    throw new Error('Frozen configuration differs; do not tune against held-out cases');
}
const measurements = await runBenchmark(
  allCases.filter((family) => family.split === (heldout ? 'heldout' : 'development')),
);
const summary = summarize(measurements);
const baselines = summary
  .filter((row) => ['context', 'summary', 'retrieval'].includes(row.mode))
  .sort(
    (a, b) =>
      b.successRate - a.successRate ||
      a.meanToolCalls - b.meanToolCalls ||
      a.mode.localeCompare(b.mode),
  );
const selectedBaseline = heldout
  ? freezeSchema.parse(JSON.parse(readFileSync(frozenPath, 'utf8'))).selectedBaseline
  : (baselines[0]?.mode ?? 'retrieval');
const mechanics = await runMechanics(),
  adversarial = await runAdversarial();
const longitudinal = runLongitudinal(),
  retention = runRetention();
const usabilityArgument = process.argv.indexOf('--usability');
const usabilityFile = usabilityArgument >= 0 ? process.argv[usabilityArgument + 1] : undefined;
const usability = gradeUsability(
  usabilityFile ? JSON.parse(readFileSync(usabilityFile, 'utf8')) : [],
);
const associative = summary.find((row) => row.mode === 'associative');
const baseline = summary.find((row) => row.mode === selectedBaseline);
const interval = pairedInterval(measurements, selectedBaseline);
const fixtureComparison = {
  successGain: (associative?.successRate ?? 0) - (baseline?.successRate ?? 0),
  interval,
  p95LatencyRatio:
    baseline?.p95LatencyMs && associative?.p95LatencyMs
      ? associative.p95LatencyMs / baseline.p95LatencyMs
      : null,
  operatingCostRatio: null,
};

const scorecard = [
  {
    question: 1,
    verdict: 'inconclusive',
    reason:
      'Fixture planner only; live task quality, operating cost and latency acceptance remain untested',
    observedFixtureComparison: fixtureComparison,
  },
  {
    question: 2,
    verdict: 'inconclusive',
    mechanics: 'supported',
    reason:
      'Dependency invalidation and fixture replanning passed; 95% live-agent revision target is untested',
  },
  {
    question: 3,
    verdict: 'supported',
    boundary:
      'deterministic processing/status path; durable restart additionally covered by SQLite integration gate',
  },
  {
    question: 4,
    verdict: 'inconclusive',
    mechanics: 'retry deduplication supported',
    diagnostics: longitudinal,
    reason:
      'Retrieval streams measured; recurring agent-task effectiveness thresholds remain untested',
  },
  { question: 5, ...adversarial },
  {
    question: 6,
    verdict: 'inconclusive',
    mechanics: 'engine invalidation and reconstructed-context recovery supported',
    reason:
      'Operator-owned raw Skein checkpoint history is retained separately; hosted history revocation has not been established',
  },
  { question: 7, ...usability, mechanics: 'lineage inspection supported' },
  { question: 8, ...hindsightAudit },
].map((question) => ({ ...question, acceptance: acceptanceCriteria[question.question] }));
if (freeze) {
  if (existsSync(frozenPath))
    throw new Error('Freeze is write-once; preserve this manifest for the held-out study');
  writeFileSync(frozenPath, JSON.stringify({ fingerprint, selectedBaseline, manifest }, null, 2));
}
const report = {
  phase: heldout ? 'heldout' : 'development',
  fingerprint,
  manifest,
  selectedBaseline,
  summary,
  scorecard,
  mechanics,
  longitudinal,
  retention,
  measurements,
};
writeFileSync(`reports/${report.phase}.json`, JSON.stringify(report, null, 2));
console.log(JSON.stringify({ phase: report.phase, fingerprint, summary, scorecard }, null, 2));
