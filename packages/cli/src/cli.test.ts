import { mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';
import { run } from './index.js';

interface Captured {
  code: number;
  stdout: string;
  stderr: string;
}

async function cli(...argv: string[]): Promise<Captured> {
  let stdout = '';
  let stderr = '';
  const code = await run(argv, {
    out: (text) => {
      stdout += text;
    },
    err: (text) => {
      stderr += text;
    },
  });
  return { code, stdout, stderr };
}

function workspace(files: Record<string, unknown | string>): string {
  const dir = mkdtempSync(join(tmpdir(), 'causal-cli-'));
  for (const [name, body] of Object.entries(files)) {
    writeFileSync(
      join(dir, name),
      typeof body === 'string' ? body : JSON.stringify(body, null, 2) + '\n',
    );
  }
  return dir;
}

const clean = {
  causal: '0.1',
  profile: 'dag',
  variables: [
    { id: 'a', label: 'A' },
    { id: 'b', label: 'B' },
  ],
  relations: [{ from: 'a', to: 'b', assertion: { status: 'accepted' } }],
  views: [{ id: 'fig', theme: 'book-bw' }],
};

const warns = {
  causal: '0.1',
  profile: 'dag',
  variables: ['a', 'b'],
  relations: [{ from: 'a', to: 'b', assertion: { status: 'proposed' } }],
};

const broken = { causal: '0.1', profile: 'dag', variables: ['a'], relations: ['a -> ghost'] };

test('validate reports success on a valid document', async () => {
  const dir = workspace({ 'm.causal.json': clean });
  const result = await cli('validate', join(dir, 'm.causal.json'));
  assert.equal(result.code, 0);
  assert.match(result.stdout, /No problems in 1 document/);
});

test('render writes a figure to the requested destination', async () => {
  const dir = workspace({ 'm.causal.json': clean });
  const out = join(dir, 'figures');
  const result = await cli(
    'render',
    join(dir, 'm.causal.json'),
    '--view',
    'fig',
    '--format',
    'svg',
    '--out',
    out + '/',
  );
  assert.equal(result.code, 0);
  assert.deepEqual(readdirSync(out), ['m-fig.svg']);
  assert.match(readFileSync(join(out, 'm-fig.svg'), 'utf8'), /^<svg xmlns/);
});

test('render --all writes one figure per declared view', async () => {
  const many = { ...clean, views: [{ id: 'one' }, { id: 'two', include: ['a'] }] };
  const dir = workspace({ 'm.causal.json': many });
  const out = join(dir, 'figs');
  const result = await cli('render', join(dir, 'm.causal.json'), '--all', '--out', out + '/');
  assert.equal(result.code, 0);
  assert.deepEqual(readdirSync(out).sort(), ['m-one.svg', 'm-two.svg']);
});

test('structured output parses and carries rule, severity, pointer, and location', async () => {
  const dir = workspace({ 'm.causal.json': broken });
  const result = await cli('validate', join(dir, 'm.causal.json'), '--json');
  const payload = JSON.parse(result.stdout);
  assert.equal(payload.results.length, 1);
  const hit = payload.results[0].diagnostics.find(
    (d: any) => d.rule === 'relation-dangling-endpoint',
  );
  assert.ok(hit);
  assert.equal(hit.severity, 'error');
  assert.equal(hit.layer, 'referential');
  assert.equal(hit.pointer, '/relations/0');
  assert.equal(typeof hit.line, 'number');
  assert.equal(payload.summary.errors, 1);
});

test('progress text never lands on stdout in structured mode', async () => {
  const dir = workspace({ 'm.causal.json': clean });
  const out = join(dir, 'figs');
  const result = await cli('render', join(dir, 'm.causal.json'), '--out', out + '/', '--json');
  assert.equal(result.stdout, '', 'stdout stays parseable');
  assert.match(result.stderr, /wrote /);
});

test('errors exit non-zero', async () => {
  const dir = workspace({ 'm.causal.json': broken });
  assert.equal((await cli('lint', join(dir, 'm.causal.json'))).code, 1);
});

test('warnings alone exit zero', async () => {
  const dir = workspace({ 'm.causal.json': warns });
  const result = await cli('lint', join(dir, 'm.causal.json'));
  assert.equal(result.code, 0);
  assert.match(result.stdout, /assertion-reviewed/);
});

test('warnings escalate on request', async () => {
  const dir = workspace({ 'm.causal.json': warns });
  assert.equal((await cli('lint', join(dir, 'm.causal.json'), '--warnings-as-errors')).code, 1);
});

test('a project config can gate publication on reviewed assertions', async () => {
  const dir = workspace({
    'm.causal.json': warns,
    'causal.config.json': { rules: { 'assertion-reviewed': 'error' } },
  });
  const result = await cli('lint', join(dir, 'm.causal.json'));
  assert.equal(result.code, 1);
});

test('fmt preserves extensions and is idempotent', async () => {
  const source =
    '{"causal":"0.1","profile":"dag","x-tool":{"keep":true},' +
    '"variables":["a",{"id":"b","x-note":"private"}],"relations":["a -> b"],' +
    '"views":[{"id":"fig","x-editor":{"zoom":2}}]}\n';
  const dir = workspace({ 'm.causal.json': source });
  const path = join(dir, 'm.causal.json');

  assert.equal((await cli('fmt', path, '--check')).code, 1, 'unformatted input fails --check');

  assert.equal((await cli('fmt', path, '--write')).code, 0);
  const once = readFileSync(path, 'utf8');
  const parsed = JSON.parse(once);
  assert.deepEqual(parsed['x-tool'], { keep: true });
  assert.deepEqual(parsed.variables[1]['x-note'], 'private');
  assert.deepEqual(parsed.views[0]['x-editor'], { zoom: 2 });
  assert.deepEqual(parsed.relations, ['a -> b'], 'shorthand form is preserved');

  assert.equal((await cli('fmt', path, '--write')).code, 0);
  assert.equal(readFileSync(path, 'utf8'), once, 'formatting is idempotent');
  assert.equal((await cli('fmt', path, '--check')).code, 0);
});

test('lint --fix repairs mechanical problems in place', async () => {
  const dir = workspace({
    'm.causal.json': {
      causal: '0.1',
      profile: 'dag',
      variables: [{ id: 'birth_weight' }, { id: 'b' }],
      relations: [{ from: 'birth_weight', to: 'b' }],
    },
    'causal.config.json': { rules: { 'missing-label': 'warn' } },
  });
  const path = join(dir, 'm.causal.json');
  await cli('lint', path, '--fix');
  assert.equal(JSON.parse(readFileSync(path, 'utf8')).variables[0].label, 'Birth weight');
});

test('summarize compresses a document into re-readable shorthand', async () => {
  const dir = workspace({ 'm.causal.json': clean });
  const result = await cli('summarize', join(dir, 'm.causal.json'));
  assert.equal(result.code, 0);
  assert.match(result.stdout, /profile: dag/);
  assert.match(result.stdout, /a -> b/);
});

test('an unknown view is reported with the views that exist', async () => {
  const dir = workspace({ 'm.causal.json': clean });
  const result = await cli('render', join(dir, 'm.causal.json'), '--view', 'nope');
  assert.equal(result.code, 2);
  assert.match(result.stderr, /`fig`/);
});

test('render refuses a document with errors rather than emitting a wrong figure', async () => {
  const dir = workspace({ 'm.causal.json': broken });
  const result = await cli('render', join(dir, 'm.causal.json'));
  assert.equal(result.code, 1);
  assert.match(result.stderr, /render aborted/);
});

test('an unknown command and a missing command are usage errors', async () => {
  assert.equal((await cli('frobnicate')).code, 2);
  assert.equal((await cli()).code, 2);
  assert.equal((await cli('--version')).code, 0);
});
