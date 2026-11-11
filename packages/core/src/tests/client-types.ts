import type { createRecallDelta } from '../index.js';
import { type RecallDeltaClient } from '../index.js';

/** Compile-only negative assertions; these malformed requests must never execute. */
export function checkClientRequests(
  client: RecallDeltaClient,
  engine: ReturnType<typeof createRecallDelta>,
) {
  // @ts-expect-error Observation fields are mandatory on the portable client.
  client.observe({ misspelledObservationId: 'x' });
  // @ts-expect-error The concrete factory must retain the same typed request boundary.
  engine.observe({ misspelledObservationId: 'x' });
  // @ts-expect-error An advance requires a structured versioned request.
  client.advanceSession('invalid');
  // @ts-expect-error Null is not a closing request.
  engine.closeSession(null);
  // @ts-expect-error The core contract does not require reference-engine extensions.
  client.experimental.inspect();
}
