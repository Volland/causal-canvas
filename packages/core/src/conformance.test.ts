import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';
import { analyze, formatDocument, parseDocument, validate } from './index.js';
import { conformanceDir, examplesDir } from './testutil.js';

const root = conformanceDir();

function documents(folder: string): string[] {
  return readdirSync(join(root, folder))
    .filter((name) => name.endsWith('.causal.json'))
    .sort();
}

// @lat: [[tests#Test specifications#Conformance corpus#Valid documents pass the core layers]]
test('conformance: every valid document passes the core layers', () => {
  for (const name of documents('valid')) {
    const text = readFileSync(join(root, 'valid', name), 'utf8');
    const errors = validate(text).diagnostics.filter((d) => d.severity === 'error');
    assert.deepEqual(
      errors.map((d) => `${d.rule} ${d.pointer}`),
      [],
      `${name} should have no core errors`,
    );
  }
});

// @lat: [[tests#Test specifications#Conformance corpus#Invalid documents produce their expected diagnostics]]
test('conformance: every invalid document produces its expected diagnostics', () => {
  for (const name of documents('invalid')) {
    const text = readFileSync(join(root, 'invalid', name), 'utf8');
    const expectedPath = join(root, 'invalid', name.replace('.causal.json', '.expected.json'));
    const expected = JSON.parse(readFileSync(expectedPath, 'utf8')) as {
      rule: string;
      severity: string;
      layer: string;
      pointer?: string;
    }[];
    const actual = validate(text).diagnostics;

    for (const want of expected) {
      const hit = actual.find(
        (d) =>
          d.rule === want.rule &&
          d.severity === want.severity &&
          d.layer === want.layer &&
          (want.pointer === undefined || d.pointer === want.pointer),
      );
      assert.ok(
        hit,
        `${name}: expected ${want.rule} at ${want.pointer ?? 'any pointer'}, got ${JSON.stringify(
          actual.map((d) => `${d.rule}@${d.pointer}`),
        )}`,
      );
    }
  }
});

test('conformance: the shipped examples lint clean apart from deliberate findings', () => {
  const deliberate = new Set(['birthweight-paradox.causal.json']);
  for (const name of readdirSync(examplesDir()).filter((n) => n.endsWith('.causal.json'))) {
    const text = readFileSync(join(examplesDir(), name), 'utf8');
    const errors = validate(text).diagnostics.filter((d) => d.severity === 'error');
    assert.deepEqual(
      errors.map((d) => d.rule),
      [],
      `${name} core errors`,
    );
    if (!deliberate.has(name)) {
      const findings = analyze(text).diagnostics.filter((d) => d.severity === 'error');
      assert.deepEqual(
        findings.map((d) => d.rule),
        [],
        `${name} rule errors`,
      );
    }
  }
});

// @lat: [[tests#Test specifications#Conformance corpus#Round-trip preserves extensions]]
test('round-trip preserves x- members, unrecognised blocks, and views', () => {
  const path = join(root, 'preserve', 'extensions.causal.json');
  const original = readFileSync(path, 'utf8');
  const formatted = formatDocument(parseDocument(original));
  const before = JSON.parse(original);
  const after = JSON.parse(formatted);

  assert.deepEqual(after, before, 'formatting must not change any content');
  assert.deepEqual(after['x-tool'], before['x-tool']);
  assert.deepEqual(after.meta['x-internal'], 'keep me');
  assert.deepEqual(after.variables[1]['x-mytool:colour'], '#ff0000');
  assert.deepEqual(after.relations[1]['x-note'], 'private');
  assert.deepEqual(after.views[0]['x-editor'], { zoom: 1.5 });
  assert.equal(
    formatDocument(parseDocument(formatted)),
    formatted,
    'formatting must be idempotent',
  );
});

test('a document carrying only extensions still validates', () => {
  const path = join(root, 'preserve', 'extensions.causal.json');
  const errors = validate(readFileSync(path, 'utf8')).diagnostics.filter(
    (d) => d.severity === 'error',
  );
  assert.deepEqual(
    errors.map((d) => `${d.rule} ${d.pointer}`),
    [],
  );
});
