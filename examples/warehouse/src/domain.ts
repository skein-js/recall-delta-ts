import { candidateSchema, observationSchema, snapshotSchema } from '@skein-js/recall-delta';
import { z } from 'zod';

export const modeSchema = z.enum(['context', 'summary', 'retrieval', 'associative']);
export type Mode = z.infer<typeof modeSchema>;
export const planSchema = z.object({
  diagnosis: z.enum(['missing-posting', 'delayed-posting', 'stale-erp', 'unknown']),
  action: z.enum(['post-dispatch', 'wait-for-job', 'reconcile-erp', 'inspect-posting-job']),
  basedOn: z.array(z.string()),
  explanation: z.string().max(1000),
});
export type Plan = z.infer<typeof planSchema>;
export const systemSchema = z.object({
  warehouse: z.string(),
  dispatchPosted: z.boolean(),
  erpUpdated: z.boolean(),
  postingJob: z.enum(['missing', 'pending', 'complete']),
});
export const assumptionSchema = z.object({
  candidateId: z.string(),
  atVersion: z.number(),
  status: z.enum(['active', 'stale']),
});
export const inputSchema = z.object({
  runId: z.string().min(1),
  cues: z.array(z.string()),
  observations: z.array(observationSchema).default([]),
  system: systemSchema,
});
export type WarehouseInput = z.infer<typeof inputSchema>;
export const hostViewSchema = z.object({
  snapshot: snapshotSchema.nullable(),
  candidates: z.array(candidateSchema),
  assumptions: z.array(assumptionSchema),
});
export type HostView = z.infer<typeof hostViewSchema>;
export interface TraceEvent {
  phase: string;
  detail: string;
}
export function verifyAction(plan: Plan, system: z.infer<typeof systemSchema>): boolean {
  if (plan.action === 'inspect-posting-job') return true;
  if (plan.action === 'post-dispatch')
    return !system.dispatchPosted && system.postingJob === 'missing';
  if (plan.action === 'wait-for-job') return system.postingJob === 'pending';
  return system.dispatchPosted && !system.erpUpdated && system.postingJob === 'complete';
}
