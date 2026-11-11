import { expect, it } from 'vitest';

import { createRecallDelta, type RecallOptions, type ScopeKind } from '../index.js';
import { harness, instant, observation } from './harness.js';

it('rejects private scope promotion through another binding or a changed live grant', () => {
  const { client: alice, store } = harness();
  const source = alice.observe({
    ...observation('secret', 'private dispatch report'),
    requestId: 'secret',
  });
  const before = store.read();
  const context = { tenantId: 'tenant', scopeId: 'private', principalId: 'bob' };
  let kind: ScopeKind = 'group-shared';
  const bob = createRecallDelta({
    store,
    context,
    grant: () => ({
      kind,
      readers: ['bob'],
      writers: ['bob'],
      feedbackWriters: ['bob'],
      maintainers: ['bob'],
    }),
  });
  expect(() => bob.readEvidence(source)).toThrow('scope_unavailable');
  expect(() => bob.experimental.inspect()).toThrow('scope_unavailable');
  expect(() => bob.observe({ ...observation('bob'), requestId: 'bob' })).toThrow(
    'scope_unavailable',
  );
  kind = 'user-private';
  expect(() => bob.readEvidence(source)).toThrow('scope_unavailable');
  expect(store.read()).toEqual(before);
  const aliceRebound = createRecallDelta({
    store,
    context: { ...context, principalId: 'alice' },
    grant: () => ({
      kind: 'group-shared',
      readers: ['alice'],
      writers: ['alice'],
      feedbackWriters: [],
      maintainers: [],
    }),
  });
  expect(() => aliceRebound.readEvidence(source)).toThrow('scope_unavailable');
  expect(alice.readEvidence(source).content).toBe('private dispatch report');
});

it('fails closed on nullish grants and revocation through an authorization lookup', () => {
  for (const missing of [undefined, null]) {
    const { client: owner, store } = harness();
    const source = owner.observe({ ...observation('source'), requestId: 'source' });
    let available = true;
    const options: RecallOptions = {
      store,
      context: { tenantId: 'tenant', scopeId: 'private', principalId: 'alice' },
      clock: () => instant,
      // @ts-expect-error Exercise invalid authorization results from JavaScript/runtime integrations.
      grant: () =>
        available
          ? {
              kind: 'user-private',
              readers: ['alice'],
              writers: ['alice'],
              feedbackWriters: ['alice'],
              maintainers: ['alice'],
            }
          : missing,
    };
    const client = createRecallDelta(options);
    expect(client.readEvidence(source).evidenceId).toBe(source.evidenceId);
    const before = store.read();
    available = false;
    expect(() => client.readEvidence(source)).toThrowError(
      expect.objectContaining({ code: 'invalid_request' }),
    );
    expect(() => client.observe({ ...observation('denied'), requestId: 'denied' })).toThrowError(
      expect.objectContaining({ code: 'invalid_request' }),
    );
    expect(() =>
      client.experimental.revokeEvidence({ ...source, requestId: 'revoke' }),
    ).toThrowError(expect.objectContaining({ code: 'invalid_request' }));
    expect(store.read()).toEqual(before);
  }
});
