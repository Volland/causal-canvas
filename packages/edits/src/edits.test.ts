import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import assert from 'node:assert/strict';
import { validate } from '@causal/core';
import {
  addRelation,
  addVariable,
  deleteRelation,
  deleteVariable,
  EditError,
  pinVariable,
  setVariableLabel,
} from './index.js';

function repoRoot(): string {
  let current = dirname(fileURLToPath(import.meta.url));
  for (let i = 0; i < 10; i++) {
    if (existsSync(join(current, 'pnpm-workspace.yaml'))) return current;
    current = dirname(current);
  }
  throw new Error('workspace root not found');
}

/** The same fixture the format's preservation conformance test uses. */
const fixture = readFileSync(
  join(repoRoot(), 'conformance', 'preserve', 'extensions.causal.json'),
  'utf8',
);

const noViews = JSON.stringify(
  {
    causal: '0.1',
    profile: 'dag',
    'x-tool': { keep: true },
    variables: ['a', { id: 'b', label: 'B' }],
    relations: ['a -> b'],
  },
  null,
  2,
);

/** Everything the edit did not target must survive byte-identically. */
function assertPreserved(before: string, after: string, ...touched: string[]): void {
  const b = JSON.parse(before);
  const a = JSON.parse(after);
  assert.deepEqual(a['x-tool'], b['x-tool'], 'root x- member');
  if (b.meta) assert.deepEqual(a.meta, b.meta, 'meta block including its x- member');
  for (const key of Object.keys(b)) {
    if (touched.includes(key)) continue;
    assert.deepEqual(a[key], b[key], `untouched member \`${key}\``);
  }
  assert.deepEqual(Object.keys(a), Object.keys(b), 'key order');
}

function assertStillValid(text: string): void {
  const result = validate(text);
  assert.ok(result.document, 'edited document parses');
  assert.deepEqual(
    result.diagnostics.filter((d) => d.severity === 'error').map((d) => `${d.rule}@${d.pointer}`),
    [],
    'edited document has no core errors',
  );
}

// ------------------------------------------------------------------- pins

test('pinning writes into the view layout and nowhere else', () => {
  const result = pinVariable(fixture, { id: 'plain', x: 120, y: 40 });
  assert.ok(result.changed);
  const after = JSON.parse(result.text);
  assert.deepEqual(after.views[0].layout.pin.plain, [120, 40]);
  assert.equal(after.variables[0], 'plain', 'no coordinate is written onto the variable');
  assertPreserved(fixture, result.text, 'views');
  assertStillValid(result.text);
});

test('pinning a document with no views creates one and says so', () => {
  const result = pinVariable(noViews, { id: 'a', x: 10, y: 20 });
  const after = JSON.parse(result.text);
  assert.equal(after.views.length, 1);
  assert.equal(after.views[0].id, 'default');
  assert.deepEqual(after.views[0].layout.pin.a, [10, 20]);
  assert.match(result.notes.join(' '), /created view `default`/);
  assertStillValid(result.text);
});

test('pinning one variable leaves another variable pinned where it was', () => {
  const first = pinVariable(fixture, { id: 'plain', x: 10, y: 10 }).text;
  const second = pinVariable(first, { id: 'annotated', x: 200, y: 90 }).text;
  const after = JSON.parse(second);
  assert.deepEqual(after.views[0].layout.pin.plain, [10, 10], 'the earlier pin is untouched');
  assert.deepEqual(after.views[0].layout.pin.annotated, [200, 90]);
});

test('pinning an unknown variable or view is refused', () => {
  assert.throws(() => pinVariable(fixture, { id: 'ghost', x: 0, y: 0 }), EditError);
  assert.throws(
    () => pinVariable(fixture, { id: 'plain', x: 0, y: 0, viewId: 'ghost' }),
    EditError,
  );
});

// -------------------------------------------------------------- relations

test('a drawn relation is appended in arrow shorthand', () => {
  const withThird = addVariable(fixture, { id: 'third' }).text;
  const result = addRelation(withThird, { from: 'plain', to: 'third' });
  const after = JSON.parse(result.text);
  assert.equal(after.relations.at(-1), 'plain -> third');
  assert.equal(after.relations[0], 'plain -> annotated', 'existing shorthand is untouched');
  assertStillValid(result.text);
});

test('each relation kind round-trips through its arrow token', () => {
  const admg = JSON.stringify(
    { causal: '0.1', profile: 'admg', variables: ['a', 'b'], relations: [] },
    null,
    2,
  );
  const result = addRelation(admg, { from: 'a', to: 'b', kind: 'bidirected' });
  assert.equal(JSON.parse(result.text).relations[0], 'a <-> b');
  assert.equal(validate(result.text).document?.relations[0]?.kind, 'bidirected');
});

test('a relation is deleted by its identifier', () => {
  const result = deleteRelation(fixture, 'plain--directed--annotated');
  const after = JSON.parse(result.text);
  assert.equal(after.relations.length, 1);
  assert.equal(after.relations[0].kind, 'bidirected');
  assert.deepEqual(after.relations[0]['x-note'], 'private', 'the survivor keeps its x- member');
  assertPreserved(fixture, result.text, 'relations');
});

test('deleting an unknown relation is refused rather than silently ignored', () => {
  assert.throws(() => deleteRelation(fixture, 'nope'), EditError);
});

// -------------------------------------------------------------- variables

test('a new variable is appended, in object form only when it has a label', () => {
  assert.equal(JSON.parse(addVariable(fixture, { id: 'bare' }).text).variables.at(-1), 'bare');
  assert.deepEqual(
    JSON.parse(addVariable(fixture, { id: 'named', label: 'Named' }).text).variables.at(-1),
    {
      id: 'named',
      label: 'Named',
    },
  );
});

test('adding a duplicate variable is refused', () => {
  assert.throws(() => addVariable(fixture, { id: 'plain' }), EditError);
});

test('labelling a shorthand variable expands only that variable, and says so', () => {
  const result = setVariableLabel(fixture, 'plain', 'Plain');
  const after = JSON.parse(result.text);
  assert.deepEqual(after.variables[0], { id: 'plain', label: 'Plain' });
  assert.deepEqual(
    after.variables[1]['x-mytool:colour'],
    '#ff0000',
    'the other variable keeps its x- member',
  );
  assert.match(result.notes.join(' '), /expanded `plain`/);
  assertStillValid(result.text);
});

test('labelling an object variable does not disturb its other members', () => {
  const result = setVariableLabel(fixture, 'annotated', 'Renamed');
  const after = JSON.parse(result.text);
  assert.equal(after.variables[1].label, 'Renamed');
  assert.equal(after.variables[1].id, 'annotated', 'the identifier is unchanged');
  assert.deepEqual(after.variables[1]['x-mytool:colour'], '#ff0000');
  assert.equal(result.notes.length, 0);
});

test('deleting a variable removes every relation naming it, leaving nothing dangling', () => {
  const result = deleteVariable(fixture, 'annotated');
  const after = JSON.parse(result.text);
  assert.ok(!after.variables.some((v: any) => (typeof v === 'string' ? v : v.id) === 'annotated'));
  assert.equal(after.relations.length, 0, 'both relations named it');
  assert.match(result.notes.join(' '), /removed 2 relations/);
  assertPreserved(fixture, result.text, 'variables', 'relations');
  assertStillValid(result.text);
});

test('deleting an isolated variable removes no relations', () => {
  const withExtra = addVariable(fixture, { id: 'lonely' }).text;
  const result = deleteVariable(withExtra, 'lonely');
  assert.equal(JSON.parse(result.text).relations.length, 2);
  assert.equal(result.notes.length, 0);
});

// ------------------------------------------------------------- properties

test('an edit session leaves every extension member intact', () => {
  let text = fixture;
  text = pinVariable(text, { id: 'plain', x: 5, y: 5 }).text;
  text = addVariable(text, { id: 'extra', label: 'Extra' }).text;
  text = addRelation(text, { from: 'plain', to: 'extra' }).text;
  text = setVariableLabel(text, 'plain', 'Plain').text;
  text = pinVariable(text, { id: 'extra', x: 90, y: 5 }).text;
  text = deleteRelation(text, 'annotated--bidirected--plain').text;

  const after = JSON.parse(text);
  assert.deepEqual(after['x-tool'], { collapsed: true, nested: { deep: [1, 2, 3] } });
  assert.equal(after.meta['x-internal'], 'keep me');
  assert.deepEqual(after.views[0]['x-editor'], { zoom: 1.5 });
  assert.equal(after.views[0].theme, 'book-bw');
  assert.deepEqual(after.variables[1]['x-mytool:colour'], '#ff0000');
  assertStillValid(text);
});

test('every operation leaves a document that still parses and validates', () => {
  const operations: ((text: string) => string)[] = [
    (t) => pinVariable(t, { id: 'plain', x: 1, y: 2 }).text,
    (t) => addVariable(t, { id: 'zz' }).text,
    (t) => addRelation(t, { from: 'plain', to: 'annotated', kind: 'bidirected' }).text,
    (t) => setVariableLabel(t, 'annotated', 'X').text,
    (t) => deleteRelation(t, 'plain--directed--annotated').text,
    (t) => deleteVariable(t, 'plain').text,
  ];
  for (const operation of operations) assertStillValid(operation(fixture));
});
