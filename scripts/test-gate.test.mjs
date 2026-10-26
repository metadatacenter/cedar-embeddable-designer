import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir, uptime } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { test } from 'node:test';

function gate(workers, fail = '', environment = {}, copies = 1) {
  const directory = mkdtempSync(path.join(tmpdir(), 'ced-gate-'));
  const log = path.join(directory, 'events');
  writeFileSync(
    path.join(directory, 'npm'),
    `#!${process.execPath}
const fs = require('node:fs');
const script = process.argv[3];
const emit = event => fs.appendFileSync(process.env.GATE_LOG, JSON.stringify({event, script, workers: process.env.CEDAR_TEST_WORKERS, vitest: process.env.VITEST_MAX_WORKERS, webkit: process.env.CED_WEBKIT})+'\\n');
emit('start');
setTimeout(() => { emit('end'); process.exit(script === process.env.GATE_FAIL ? 7 : 0); }, 50);
`,
    { mode: 0o755 },
  );
  try {
    const script = fileURLToPath(new URL('./test-gate.mjs', import.meta.url));
    // Several copies run at once, as gates in concurrent builds do.
    const command =
      copies === 1
        ? [process.execPath, [script]]
        : ['sh', ['-c', `for i in $(seq ${copies}); do "$GATE_NODE" "$GATE_SCRIPT" & done; wait`]];
    const result = spawnSync(...command, {
      encoding: 'utf8',
      env: {
        ...process.env,
        GATE_NODE: process.execPath,
        GATE_SCRIPT: script,
        PATH: `${directory}:${process.env.PATH}`,
        CEDAR_TEST_WORKERS: String(workers),
        GATE_LOG: log,
        GATE_FAIL: fail,
        // A build runs these tests inside its own pool, which no test may draw on.
        CEDAR_WORKER_POOL: undefined, CEDAR_STAGE_CACHE_MODULE: undefined, CEDAR_STAGE_CACHE: undefined, CEDAR_TASK_CACHE_CONFIG: undefined,
        ...environment,
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
        if (event.script === 'dist') assert.equal(finished.size, 6);
        if (event.script === 'test:browser:prebuilt') {
          assert.ok(finished.has('dist'));
          assert.equal(event.webkit, '1', 'the complete gate must include WebKit interactions');
        }
        if (event.script === 'test:visual') {
          assert.ok(finished.has('dist'));
          assert.equal(event.workers, budget >= 6 ? '2' : '1');
        }
      } else {
        active -= Number(event.workers);
        finished.add(event.script);
      }
    }
    assert.equal(peak, budget);
    assert.equal(finished.size, 9);
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
  assert.ok(!starts.includes('test:visual'));
});

function sharedPool(size) {
  const directory = mkdtempSync(path.join(tmpdir(), 'ced-pool-'));
  writeFileSync(path.join(directory, 'size'), `${size}\n`);
  return directory;
}

const slots = (pool) => readdirSync(pool).filter((name) => name.startsWith('slot-'));

test("stages stay within the build's shared pool and return every worker", () => {
  const pool = sharedPool(3);
  try {
    const { result, events } = gate(8, '', { CEDAR_WORKER_POOL: pool });
    assert.equal(result.status, 0, result.stderr);
    let active = 0;
    for (const event of events) {
      active += (event.event === 'start' ? 1 : -1) * Number(event.workers);
      assert.ok(active <= 3, `${active} workers from a pool of 3`);
    }
    assert.equal(new Set(events.map((event) => event.script)).size, 9);
    assert.deepEqual(slots(pool), []);
  } finally {
    rmSync(pool, { recursive: true, force: true });
  }
});

test('a stage waits for workers held elsewhere and takes them back once their holder exits', () => {
  const pool = sharedPool(2);
  try {
    // An orphaned sleep is reaped as soon as it exits, so its slots read as abandoned from then on.
    const holder = spawnSync('sh', ['-c', 'sleep 0.6 >/dev/null 2>&1 & echo $!'], { encoding: 'utf8' }).stdout;
    for (const slot of ['slot-0', 'slot-1']) {
      mkdirSync(path.join(pool, slot));
      writeFileSync(path.join(pool, slot, 'owner'), holder);
    }
    const began = Date.now();
    const { result, events } = gate(2, '', { CEDAR_WORKER_POOL: pool });
    assert.equal(result.status, 0, result.stderr);
    assert.ok(Date.now() - began >= 500, 'the gate did not wait for the workers held elsewhere');
    assert.equal(new Set(events.map((event) => event.script)).size, 9);
    assert.deepEqual(slots(pool), []);
  } finally {
    rmSync(pool, { recursive: true, force: true });
  }
});

// How the gate names this boot: when the machine started, in whole seconds.
const boot = () => Math.round(Date.now() / 1000 - uptime());

test('a stage waits behind an older request from a process that is still running', () => {
  const pool = sharedPool(4);
  try {
    // An orphaned sleep is reaped as soon as it exits, so its request is dropped from then on.
    const holder = spawnSync('sh', ['-c', 'sleep 0.6 >/dev/null 2>&1 & echo $!'], { encoding: 'utf8' }).stdout.trim();
    const arrived = (BigInt(Date.now() - 1000) * 1000000n).toString().padStart(20, '0');
    mkdirSync(path.join(pool, 'queue'));
    writeFileSync(path.join(pool, 'queue', `${arrived}-${holder}-${boot()}-older`), '');
    const began = Date.now();
    const { result, events } = gate(2, '', { CEDAR_WORKER_POOL: pool });
    assert.equal(result.status, 0, result.stderr);
    assert.ok(Date.now() - began >= 500, 'the gate overtook the older request');
    assert.equal(new Set(events.map((event) => event.script)).size, 9);
    assert.deepEqual(readdirSync(path.join(pool, 'queue')), []);
  } finally {
    rmSync(pool, { recursive: true, force: true });
  }
});

test('workers and requests left from an earlier boot are taken back though their process number is in use', () => {
  const pool = sharedPool(1);
  try {
    mkdirSync(path.join(pool, 'slot-0'));
    writeFileSync(path.join(pool, 'slot-0', 'owner'), `${process.pid} ${boot() - 86400}\n`);
    mkdirSync(path.join(pool, 'queue'));
    const arrived = (BigInt(Date.now() - 1000) * 1000000n).toString().padStart(20, '0');
    writeFileSync(path.join(pool, 'queue', `${arrived}-${process.pid}-${boot() - 86400}-earlier`), '');
    const { result, events } = gate(1, '', { CEDAR_WORKER_POOL: pool });
    assert.equal(result.status, 0, result.stderr);
    assert.equal(new Set(events.map((event) => event.script)).size, 9);
    assert.deepEqual(slots(pool), []);
    assert.deepEqual(readdirSync(path.join(pool, 'queue')), []);
  } finally {
    rmSync(pool, { recursive: true, force: true });
  }
});

test('gates in concurrent builds stay within the pool they share', () => {
  const pool = sharedPool(3);
  try {
    const { events } = gate(8, '', { CEDAR_WORKER_POOL: pool }, 2);
    let active = 0;
    for (const event of events) {
      active += (event.event === 'start' ? 1 : -1) * Number(event.workers);
      assert.ok(active <= 3, `${active} workers from a pool of 3`);
    }
    assert.equal(events.filter((event) => event.event === 'end').length, 18, 'both gates ran every stage');
    assert.deepEqual(slots(pool), []);
  } finally {
    rmSync(pool, { recursive: true, force: true });
  }
});

test('a conformance refusal prevents packaging and browser acceptance', () => {
  const { result, events } = gate(1, 'test:conformance');
  assert.notEqual(result.status, 0);
  const started = events.filter((event) => event.event === 'start').map((event) => event.script);
  assert.ok(started.includes('test:conformance'));
  for (const blocked of ['dist', 'test:browser:prebuilt', 'test:visual']) assert.ok(!started.includes(blocked));
});
