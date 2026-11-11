import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex } from '@noble/hashes/utils.js';
import { z } from 'zod';

import type { Json } from './contracts.js';

export const policySchema = z.object({
  revision: z.string(),
  recallMode: z.enum(['associative', 'retrieval', 'recent']),
  carry: z.number().min(0).max(1),
  spread: z.number().min(0).max(1),
  inhibition: z.number().min(0).max(1),
  reinforce: z.boolean(),
  candidateLimit: z.number().int().min(1).max(100),
  threshold: z.number().min(0).max(1),
  receiptMs: z.number().positive(),
  sessionMs: z.number().positive(),
  decayMs: z.number().positive(),
  dormantBelow: z.number().min(0).max(1),
  graceMs: z.number().positive(),
  hardLimitBytes: z.number().positive(),
});
export type MemoryPolicy = z.infer<typeof policySchema>;
export const defaultPolicy: MemoryPolicy = {
  revision: 'development-1',
  recallMode: 'associative',
  carry: 0.5,
  spread: 0.2,
  inhibition: 0.05,
  reinforce: true,
  candidateLimit: 8,
  threshold: 0.04,
  receiptMs: 3_600_000,
  sessionMs: 3_600_000,
  decayMs: 30 * 86_400_000,
  dormantBelow: 0.15,
  graceMs: 30 * 86_400_000,
  hardLimitBytes: 16 * 1024 * 1024,
};
export function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value !== null && typeof value === 'object') {
    return `{${Object.entries(value)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([key, entry]) => `${JSON.stringify(key)}:${canonical(entry)}`)
      .join(',')}}`;
  }
  return JSON.stringify(value) ?? 'null';
}
export const retainedBytes = (value: unknown): number =>
  new TextEncoder().encode(canonical(value)).byteLength;
export function extractCues(value: Json): string[] {
  const values: string[] = [];
  function visit(entry: Json): void {
    if (typeof entry === 'string' || typeof entry === 'number') values.push(String(entry));
    else if (Array.isArray(entry)) entry.forEach(visit);
    else if (entry !== null && typeof entry === 'object') Object.values(entry).forEach(visit);
  }
  visit(value);
  const stop = new Set([
    'the',
    'a',
    'an',
    'is',
    'was',
    'were',
    'and',
    'at',
    'of',
    'to',
    'in',
    'it',
    'for',
  ]);
  return [
    ...new Set(
      values
        .join(' ')
        .toLowerCase()
        .match(/[a-z0-9]+(?:-[a-z0-9]+)*/g) ?? [],
    ),
  ]
    .filter((term) => !stop.has(term))
    .sort();
}
export function cueSimilarity(left: readonly string[], right: readonly string[]): number {
  const overlap = left.filter((term) => right.includes(term)).length;
  return left.length && right.length ? overlap / Math.sqrt(left.length * right.length) : 0;
}
export const clamp = (value: number): number =>
  Math.round(Math.min(1, Math.max(0, value)) * 1_000_000) / 1_000_000;

export function retentionFingerprint(policy: MemoryPolicy): string {
  return canonical({
    revision: policy.revision,
    decayMs: policy.decayMs,
    dormantBelow: policy.dormantBelow,
    graceMs: policy.graceMs,
  });
}

export function createEngineProfile(policy: MemoryPolicy): string {
  const digest = sha256(new TextEncoder().encode(canonical(policy)));
  return `recall-delta:reference-v2:sha256:${bytesToHex(digest)}`;
}
