import { z } from 'zod';
const recallResponse = z.object({
  results: z.array(
    z
      .object({ id: z.string(), text: z.string(), document_id: z.string().optional() })
      .passthrough(),
  ),
});
/** Mapping audit only: never turn missing activation or source policy into fabricated core data. */
export function auditHindsightResponse(input: unknown, sourceMap: ReadonlyMap<string, string>) {
  const response = recallResponse.parse(input);
  return response.results.map((record) => ({
    backendId: record.id,
    evidenceId: record.document_id ? (sourceMap.get(record.document_id) ?? null) : null,
    missing: [
      ...(!record.document_id || !sourceMap.has(record.document_id)
        ? ['admitted source lineage']
        : []),
      'declared activation interpretation',
      'authorization/revocation fence',
      'atomic session and retry sidecar',
    ],
  }));
}
export const hindsightAudit = {
  verdict: 'inconclusive' as const,
  adapter: 'not advertised as core-conforming',
  documentedOverlap: ['retain/recall', 'asynchronous operation status', 'document references'],
  unverified: [
    'source-preserving admission mapping',
    'caller-specific feedback',
    'revocation across sidecar history',
    'stable interpretation identity across backend revisions',
  ],
  sources: [
    'https://hindsight.vectorize.io/1.0/developer/api/retain',
    'https://hindsight.vectorize.io/1.0/developer/api/recall',
    'https://hindsight.vectorize.io/1.0/developer/api/operations',
  ],
  reason:
    'Documentation establishes overlap, not the required end-to-end guarantees. No independent backend was started or called.',
};
