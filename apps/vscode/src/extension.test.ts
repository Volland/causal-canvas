import test from 'node:test';
import assert from 'node:assert/strict';
import { minimalEdit } from './diff.js';
import { parseIntent } from './protocol.js';
import { buildScene } from './scene.js';

const model = JSON.stringify(
  {
    causal: '0.1',
    profile: 'admg',
    variables: [
      { id: 'x', label: 'Exposure', role: 'exposure' },
      { id: 'm', label: 'Mediator' },
      { id: 'y', label: 'Outcome', role: 'outcome' },
      { id: 'u', label: 'Unmeasured', latent: true },
    ],
    relations: [
      'x -> m',
      'm -> y',
      { from: 'u', to: 'x' },
      { from: 'u', to: 'y', assertion: { status: 'proposed' } },
    ],
    views: [
      { id: 'full', theme: 'book-bw' },
      { id: 'triple', include: ['x', 'm', 'y'], theme: 'book-bw' },
    ],
  },
  null,
  2,
);

// ------------------------------------------------------------- the protocol

test('well-formed intents parse', () => {
  assert.deepEqual(parseIntent({ type: 'ready' }), { type: 'ready' });
  assert.deepEqual(parseIntent({ type: 'moveNode', id: 'x', x: 10, y: 20 }), {
    type: 'moveNode',
    id: 'x',
    x: 10,
    y: 20,
  });
  assert.deepEqual(parseIntent({ type: 'addRelation', from: 'x', to: 'y', kind: 'directed' }), {
    type: 'addRelation',
    from: 'x',
    to: 'y',
    kind: 'directed',
  });
  assert.deepEqual(parseIntent({ type: 'setLabel', id: 'x', label: '' }), {
    type: 'setLabel',
    id: 'x',
    label: '',
  });
});

test('malformed messages are rejected rather than becoming edits', () => {
  for (const message of [
    undefined,
    null,
    'moveNode',
    {},
    { type: 'nope' },
    { type: 'moveNode', id: 'x' },
    { type: 'moveNode', id: 'x', x: 'left', y: 0 },
    { type: 'moveNode', id: '', x: 0, y: 0 },
    { type: 'moveNode', id: 'x', x: Number.NaN, y: 0 },
    { type: 'addRelation', from: 'x' },
    { type: 'deleteVariable' },
    { type: 'setActiveView', viewId: 42 },
  ]) {
    assert.equal(parseIntent(message), undefined, `should reject ${JSON.stringify(message)}`);
  }
});

// ----------------------------------------------------------- minimal edits

test('a minimal edit covers only the changed span', () => {
  const change = minimalEdit('{"a":1,"b":2}', '{"a":9,"b":2}');
  assert.ok(change);
  assert.equal(change.replacement, '9');
  assert.equal('{"a":1,"b":2}'.slice(change.start, change.end), '1');
});

test('identical text produces no edit', () => {
  assert.equal(minimalEdit('same', 'same'), undefined);
});

test('insertions and deletions round-trip through the edit', () => {
  for (const [before, after] of [
    ['abc', 'abXc'],
    ['abXc', 'abc'],
    ['', 'new'],
    ['old', ''],
    ['aaa', 'aaaa'],
  ] as const) {
    const change = minimalEdit(before, after);
    assert.ok(change, `${before} -> ${after}`);
    const applied = before.slice(0, change.start) + change.replacement + before.slice(change.end);
    assert.equal(applied, after);
  }
});

// ----------------------------------------------------------------- scenes

test('a scene carries positioned nodes and host-computed edge routes', async () => {
  const build = await buildScene(model, 'full');
  assert.ok(build.scene);
  assert.equal(build.scene.activeView, 'full');
  assert.equal(build.scene.nodes.length, 4);
  assert.equal(build.scene.edges.length, 4);
  for (const node of build.scene.nodes) {
    assert.equal(typeof node.x, 'number');
    assert.ok(node.width > 0 && node.height > 0);
    assert.ok(node.lines.length >= 1);
  }
  assert.ok(build.scene.edges.every((edge) => edge.points.length >= 2));
  assert.ok(build.scene.nodes.find((node) => node.id === 'u')?.latent);
  assert.equal(build.scene.nodes.find((node) => node.id === 'x')?.role, 'exposure');
});

test('a scene respects the active view subset', async () => {
  const build = await buildScene(model, 'triple');
  assert.deepEqual(build.scene?.nodes.map((node) => node.id).sort(), ['m', 'x', 'y']);
  assert.equal(build.scene?.edges.length, 2);
});

test('a scene lists the views the author can switch to', async () => {
  const build = await buildScene(model, 'full');
  assert.deepEqual(
    build.scene?.views.map((view) => view.id),
    ['full', 'triple'],
  );
});

test('assertion standing reaches the canvas', async () => {
  const build = await buildScene(model, 'full');
  const proposed = build.scene?.edges.find((edge) => edge.from === 'u' && edge.to === 'y');
  assert.equal(proposed?.status, 'proposed');
});

test('an unparseable document yields a problem, not a scene', async () => {
  const build = await buildScene('{ not json', undefined);
  assert.equal(build.scene, undefined);
  assert.ok(build.problem);
});

test('an unknown view is reported with the views that exist', async () => {
  const build = await buildScene(model, 'ghost');
  assert.equal(build.scene, undefined);
  assert.match(build.problem ?? '', /`full`/);
});

test('diagnostics are attached to the elements they name', async () => {
  const collider = JSON.stringify({
    causal: '0.1',
    profile: 'dag',
    variables: [
      { id: 'x', role: 'exposure' },
      { id: 'c', role: 'adjusted' },
      { id: 'u' },
      { id: 'y', role: 'outcome' },
    ],
    relations: ['x -> c', 'u -> c', 'u -> y', 'x -> y'],
  });
  const build = await buildScene(collider, undefined);
  const node = build.scene?.nodes.find((candidate) => candidate.id === 'c');
  assert.ok(node?.problems.some((problem) => problem.startsWith('collider-adjustment')));
  assert.ok(build.scene?.problems.some((problem) => problem.rule === 'collider-adjustment'));
});
