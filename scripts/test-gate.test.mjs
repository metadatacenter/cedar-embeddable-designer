import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { test } from 'node:test';

function gate(workers, fail = '') {
  const directory = mkdtempSync(path.join(tmpdir(), 'ced-gate-'));
  const log = path.join(directory, 'events');
  writeFileSync(
    path.join(directory, 'npm'),
    `#!${process.execPath}
const fs = require('node:fs');
const script = process.argv[3];
const emit = event => fs.appendFileSync(process.env.GATE_LOG, JSON.stringify({event, script, workers: process.env.CEDAR_TEST_WORKERS, vitest: process.env.VITEST_MAX_WORKERS})+'\\n');
emit('start');
setTimeout(() => { emit('end'); process.exit(script === process.env.GATE_FAIL ? 7 : 0); }, 50);
`,
    { mode: 0o755 },
  );
  try {
    const result = spawnSync(process.execPath, [fileURLToPath(new URL('./test-gate.mjs', import.meta.url))], {
      encoding: 'utf8',
      env: {
        ...process.env,
        PATH: `${directory}:${process.env.PATH}`,
        CEDAR_TEST_WORKERS: String(workers),
        GATE_LOG: log,
        GATE_FAIL: fail,
      },
    });
    return {
      result,
      events: readFileSync(log, 'utf8')
        .trim()
        .split('\n')
        .map((line) => JSON.parse(line)),
    };
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

for (const budget of [1, 2, 8])
  test(`gate preserves output ordering within ${budget} workers`, () => {
    const { result, events } = gate(budget);
    assert.equal(result.status, 0, result.stderr);
    let active = 0;
    let peak = 0;
    const finished = new Set();
    for (const event of events) {
      if (event.event === 'start') {
        assert.equal(event.vitest, event.workers);
        active += Number(event.workers);
        peak = Math.max(peak, active);
        assert.ok(active <= budget);
        if (event.script === 'dist') assert.equal(finished.size, 5);
        if (event.script === 'test:browser:prebuilt') assert.ok(finished.has('dist'));
      } else {
        active -= Number(event.workers);
        finished.add(event.script);
      }
    }
    assert.equal(peak, budget);
    assert.equal(finished.size, 7);
  });

test('failure fails the gate without running downstream stages', () => {
  const { result, events } = gate(1, 'test');
  assert.notEqual(result.status, 0);
  assert.deepEqual(
    events.filter((e) => e.event === 'start').map((e) => e.script),
    ['test'],
  );
});

test('parallel failure drains active checks and blocks dist and browsers', () => {
  const { result, events } = gate(8, 'lint');
  assert.notEqual(result.status, 0);
  const starts = events
    .filter((e) => e.event === 'start')
    .map((e) => e.script)
    .sort();
  const ends = events
    .filter((e) => e.event === 'end')
    .map((e) => e.script)
    .sort();
  assert.deepEqual(starts, ends);
  assert.ok(starts.includes('lint'));
  assert.ok(!starts.includes('dist'));
  assert.ok(!starts.includes('test:browser:prebuilt'));
});
