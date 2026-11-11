import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'node:net';
import { setTimeout as delay } from 'node:timers/promises';
import { z } from 'zod';
import { demoSteps } from '../scenario.js';
import { planSchema } from '../domain.js';

const directory = mkdtempSync(join(tmpdir(), 'recall-artifact-'));
const executable = fileURLToPath(import.meta.resolve('skein-js'));
async function freePort() {
  const server = createServer();
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  assert.ok(address && typeof address === 'object');
  await new Promise<void>((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  );
  return address.port;
}
async function start() {
  const port = await freePort();
  let logs = '';
  const child = spawn(
    process.execPath,
    [
      executable,
      'start',
      '-c',
      '.skein/build/langgraph.json',
      '--host',
      '127.0.0.1',
      '--store',
      'sqlite',
      '--queue',
      'sqlite',
      '--sqlite-path',
      join(directory, 'skein.sqlite'),
      '--port',
      String(port),
    ],
    {
      env: { ...process.env, RECALL_MODEL_PROVIDER: 'fixture', RECALL_DATA_DIR: directory },
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  );
  child.stdout.on('data', (data) => {
    logs = (logs + String(data)).slice(-8000);
  });
  child.stderr.on('data', (data) => {
    logs = (logs + String(data)).slice(-8000);
  });
  const origin = `http://127.0.0.1:${port}`;
  try {
    for (let attempt = 0; attempt < 150; attempt++) {
      if (child.exitCode !== null) throw new Error(`Skein exited: ${logs}`);
      try {
        if ((await fetch(`${origin}/ok`, { signal: AbortSignal.timeout(500) })).ok)
          return { child, origin };
      } catch {
        /* Startup is bounded below. */
      }
      await delay(100);
    }
    throw new Error(`Skein did not become ready: ${logs}`);
  } catch (error) {
    child.kill('SIGTERM');
    throw error;
  }
}
async function stop(child: ReturnType<typeof spawn>) {
  if (child.exitCode !== null) return;
  const ended = new Promise<void>((resolve) => child.once('exit', () => resolve()));
  child.kill('SIGTERM');
  await Promise.race([
    ended,
    delay(5000).then(() => {
      child.kill('SIGKILL');
    }),
  ]);
  await ended;
}
let running: Awaited<ReturnType<typeof start>> | undefined;
try {
  running = await start();
  const response = await fetch(`${running.origin}/threads`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: '{}',
  });
  assert.equal(response.status, 200);
  const thread = z.object({ thread_id: z.string() }).parse(await response.json());
  const result = await fetch(`${running.origin}/threads/${thread.thread_id}/runs/wait`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ assistant_id: 'warehouse', input: demoSteps[0] }),
    signal: AbortSignal.timeout(20000),
  });
  assert.equal(result.status, 200);
  const payload: unknown = await result.json();
  const parsed = z.object({ plan: planSchema, actionCommitted: z.boolean() }).safeParse(payload);
  if (!parsed.success)
    throw new Error(`Built graph did not return a plan: ${JSON.stringify(payload)}`);
  const output = parsed.data;
  assert.equal(output.plan.action, 'wait-for-job');
  assert.equal(output.actionCommitted, true);
  await stop(running.child);
  running = undefined;
  running = await start();
  const restored = await fetch(`${running.origin}/threads/${thread.thread_id}/state`);
  assert.equal(restored.status, 200);
  const checkpoint = z
    .object({ values: z.object({ plan: planSchema }) })
    .parse(await restored.json());
  assert.equal(checkpoint.values.plan.action, output.plan.action);
  console.log(
    'Built Skein artifact executed over HTTP and restored its SQLite checkpoint after restart.',
  );
} finally {
  if (running) await stop(running.child);
  rmSync(directory, { recursive: true, force: true });
}
