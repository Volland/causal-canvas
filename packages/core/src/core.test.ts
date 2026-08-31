import test from 'node:test';
import assert from 'node:assert/strict';
import {
  deriveRelationId,
  fix,
  formatDocument,
  lint,
  normalize,
  parseDocument,
  resolveConfig,
  summarize,
  validate,
} from './index.js';
import { expand, toJsonLd } from './ld.js';

const doc = (body: Record<string, unknown>): string =>
  JSON.stringify({ causal: '0.1', profile: 'dag', ...body }, null, 2);

const rules = (text: string, config?: Parameters<typeof lint>[1]) =>
  lint(text, config).diagnostics.map((d) => d.rule);

// ------------------------------------------------------- identity / version

test('version fields that agree are accepted', () => {
  const text = JSON.stringify({
    $schema: 'https://causaljson.org/schema/0.1.json',
    causal: '0.1',
    profile: 'dag',
    variables: ['a'],
  });
  assert.equal(validate(text).diagnostics.filter((d) => d.severity === 'error').length, 0);
});

test('version fields that disagree report both declared versions', () => {
  const text = JSON.stringify({
    $schema: 'https://causaljson.org/schema/0.9.json',
    causal: '0.1',
    profile: 'dag',
    variables: ['a'],
  });
  const hit = validate(text).diagnostics.find((d) => d.rule === 'version-mismatch');
  assert.ok(hit);
  assert.match(hit.message, /0\.1/);
  assert.match(hit.message, /0\.9/);
});

test('an unrecognised version is a diagnostic, not a parse failure', () => {
  const result = validate(doc({ causal: '9.9', variables: ['a'] }));
  assert.ok(result.document, 'the document still parses');
  assert.ok(result.diagnostics.some((d) => d.rule === 'unsupported-version'));
});

// ---------------------------------------------------------------- profiles

test('a directed cycle is rejected in an acyclic profile and names the cycle', () => {
  const hit = validate(
    doc({ variables: ['a', 'b'], relations: ['a -> b', 'b -> a'] }),
  ).diagnostics.find((d) => d.rule === 'directed-cycle');
  assert.ok(hit);
  assert.match(hit.message, /a -> b -> a/);
});

test('a directed cycle is accepted in the cyclic profile', () => {
  const text = JSON.stringify({
    causal: '0.1',
    profile: 'cld',
    variables: ['a', 'b'],
    relations: ['a -> b', 'b -> a'],
  });
  assert.equal(validate(text).diagnostics.filter((d) => d.severity === 'error').length, 0);
});

test('an illegal relation kind names the profiles that permit it', () => {
  const text = doc({
    variables: ['a', 'b'],
    relations: [{ from: 'a', to: 'b', kind: 'bidirected' }],
  });
  const hit = validate(text).diagnostics.find(
    (d) => d.rule === 'relation-kind-illegal-for-profile',
  );
  assert.ok(hit);
  assert.match(hit.message, /`admg`/);
  assert.match(hit.message, /`pag`/);
});

// -------------------------------------------------------------- shorthand

test('shorthand and object forms mix freely', () => {
  const result = validate(
    doc({ variables: ['tar', { id: 'smoking', role: 'exposure' }], relations: ['smoking -> tar'] }),
  );
  assert.deepEqual(
    result.document?.variables.map((v) => v.id),
    ['tar', 'smoking'],
  );
  assert.equal(result.document?.variables[0]?.role, undefined);
});

test('a malformed arrow names the expected form, not a schema union failure', () => {
  const hit = validate(doc({ variables: ['a', 'b'], relations: ['a->b'] })).diagnostics.find(
    (d) => d.rule === 'relation-shorthand-malformed',
  );
  assert.ok(hit);
  assert.match(hit.message, /at least one space/);
  assert.match(hit.message, /o-o/);
  assert.equal(hit.pointer, '/relations/0');
});

test('duplicate identifiers locate the second declaration', () => {
  const hit = validate(doc({ variables: ['a', 'a'] })).diagnostics.find(
    (d) => d.rule === 'duplicate-variable-id',
  );
  assert.equal(hit?.pointer, '/variables/1');
});

test('a dangling endpoint names the missing identifier', () => {
  const hit = validate(doc({ variables: ['a'], relations: ['a -> ghost'] })).diagnostics.find(
    (d) => d.rule === 'relation-dangling-endpoint',
  );
  assert.match(hit!.message, /ghost/);
});

// ------------------------------------------------------- relation identity

// @lat: [[tests#Test specifications#Format guarantees#Relation identity is deterministic]]
test('derived relation identifiers are deterministic', () => {
  const text = doc({ variables: ['a', 'b'], relations: ['a -> b'] });
  const first = normalize(JSON.parse(text)).document?.relations[0]?.id;
  const second = normalize(JSON.parse(text)).document?.relations[0]?.id;
  assert.equal(first, second);
  assert.equal(first, deriveRelationId('a', 'directed', 'b'));
});

test('an explicit relation identifier is preserved', () => {
  const text = doc({ variables: ['a', 'b'], relations: [{ id: 'my-edge', from: 'a', to: 'b' }] });
  assert.equal(normalize(JSON.parse(text)).document?.relations[0]?.id, 'my-edge');
});

// ---------------------------------------------------------------- layers

test('a bare structural model needs no quantitative members', () => {
  const result = validate(doc({ variables: ['a', 'b'], relations: ['a -> b'] }));
  assert.equal(result.diagnostics.filter((d) => d.severity === 'error').length, 0);
});

test('adding a quantitative layer leaves the structural interpretation unchanged', () => {
  const structural = validate(doc({ variables: ['a', 'b'], relations: ['a -> b'] })).document;
  const layered = validate(
    doc({
      variables: [{ id: 'a', type: 'binary', states: ['no', 'yes'] }, 'b'],
      relations: ['a -> b'],
    }),
  ).document;
  assert.deepEqual(
    layered?.relations.map((r) => `${r.from}${r.kind}${r.to}`),
    structural?.relations.map((r) => `${r.from}${r.kind}${r.to}`),
  );
});

// ------------------------------------------------------------- assertions

test('an agent-proposed relation is distinguishable from an author-asserted one', () => {
  const result = validate(
    doc({
      variables: ['a', 'b', 'c'],
      relations: [
        { from: 'a', to: 'b', assertion: { status: 'proposed', assertedBy: 'an-agent' } },
        'b -> c',
      ],
    }),
  );
  assert.equal(result.document?.relations[0]?.assertion?.status, 'proposed');
  assert.equal(result.document?.relations[1]?.assertion, undefined);
});

test('an invalid assertion status lists the permitted values', () => {
  const hit = validate(
    doc({
      variables: ['a', 'b'],
      relations: [{ from: 'a', to: 'b', assertion: { status: 'maybe' } }],
    }),
  ).diagnostics.find((d) => d.rule === 'schema-enum');
  assert.ok(hit);
  assert.match(hit.message, /"proposed"/);
  assert.equal(hit.pointer, '/relations/0/assertion/status');
});

// ------------------------------------------------------------------ views

test('views do not alter causal interpretation or validation', () => {
  const without = validate(doc({ variables: ['a', 'b'], relations: ['a -> b'] }));
  const with_ = validate(
    doc({ variables: ['a', 'b'], relations: ['a -> b'], views: [{ id: 'fig', include: ['a'] }] }),
  );
  assert.deepEqual(
    with_.document?.variables.map((v) => v.id),
    without.document?.variables.map((v) => v.id),
  );
  assert.deepEqual(
    with_.diagnostics.filter((d) => d.severity === 'error'),
    without.diagnostics.filter((d) => d.severity === 'error'),
  );
});

test('a view naming an undeclared variable is a referential error', () => {
  const hit = validate(
    doc({ variables: ['a'], views: [{ id: 'fig', include: ['a', 'ghost'] }] }),
  ).diagnostics.find((d) => d.rule === 'view-unknown-variable');
  assert.match(hit!.message, /ghost/);
});

// ------------------------------------------------------------ extensions

test('an unrecognised member is rejected and names the extension convention', () => {
  const hit = validate(doc({ variables: [{ id: 'a', exposre: true }] })).diagnostics.find((d) =>
    d.rule.startsWith('schema-'),
  );
  assert.ok(hit);
  assert.match(hit.message, /exposre/);
  assert.match(hit.message, /x-/);
});

test('an x- member is accepted and survives formatting', () => {
  const text = doc({ variables: [{ id: 'a', 'x-tool': { keep: true } }] });
  assert.equal(validate(text).diagnostics.filter((d) => d.severity === 'error').length, 0);
  const round = JSON.parse(formatDocument(parseDocument(text)));
  assert.deepEqual(round.variables[0]['x-tool'], { keep: true });
});

// --------------------------------------------------------------- JSON-LD

test('a normalized document expands, with relations as identified entities', async () => {
  const result = validate(doc({ variables: ['smoking', 'tar'], relations: ['smoking -> tar'] }));
  const expanded = (await expand(result.document!)) as any[];
  const graph = expanded[0];
  const relations = graph['https://causaljson.org/ns/v1#hasRelation'];
  assert.equal(relations.length, 1);
  assert.match(relations[0]['@id'], /smoking--directed--tar$/);
  assert.equal(
    relations[0]['https://causaljson.org/ns/v1#from'][0]['@id'],
    'https://causaljson.org/model/smoking',
  );
});

// @lat: [[tests#Test specifications#Format guarantees#View contents do not become triples]]
test('view contents do not become triples', async () => {
  const result = validate(
    doc({
      variables: ['a', 'b'],
      relations: ['a -> b'],
      views: [{ id: 'fig-1', include: ['a'], theme: 'book-bw' }],
    }),
  );
  const expanded = (await expand(result.document!)) as any[];
  const views = expanded[0]['https://causaljson.org/ns/v1#views'];
  assert.equal(views.length, 1, 'views is carried as a single JSON literal');
  assert.ok('@value' in views[0], 'the literal is not decomposed');
  const serialized = JSON.stringify(expanded);
  assert.ok(
    !serialized.includes('https://causaljson.org/model/fig-1'),
    'no view identifier appears as a subject',
  );
});

test('x- members are dropped on expansion rather than coined into the namespace', async () => {
  const result = validate(doc({ variables: ['a'], 'x-tool': { secret: 1 } }));
  const serialized = JSON.stringify(await expand(result.document!));
  assert.ok(!serialized.includes('x-tool'));
  assert.ok(!serialized.includes('secret'));
});

test('toJsonLd inlines the context so expansion never needs the network', () => {
  const result = validate(doc({ variables: ['a'] }));
  assert.equal(typeof toJsonLd(result.document!)['@context'], 'object');
});

// ------------------------------------------------------------ validation

test('core-layer checks cannot be reconfigured', () => {
  const resolved = resolveConfig({ rules: { 'directed-cycle': 'off' } as any });
  assert.ok(
    resolved.diagnostics.some(
      (d) => d.rule === 'config-unknown-rule' || d.rule === 'config-core-rule-not-configurable',
    ),
  );
});

test('configurable rules are skipped when the schema layer fails', () => {
  const found = rules(doc({ variables: [{ id: 'a', exposre: true }], relations: [] }));
  assert.ok(found.some((r) => r.startsWith('schema-')));
  assert.ok(!found.includes('orphan-variable'), 'judgement rules do not run on a malformed model');
});

test('a diagnostic locates a nested member, not just its container', () => {
  const hit = validate(
    doc({
      variables: ['a', 'b'],
      relations: [{ from: 'a', to: 'b', assertion: { confidence: 5 } }],
    }),
  ).diagnostics.find((d) => d.pointer.includes('confidence'));
  assert.equal(hit?.pointer, '/relations/0/assertion/confidence');
  assert.ok(hit?.position, 'and carries a line and column');
});

test('rule severities are configurable, including a publication gate', () => {
  const text = doc({
    variables: ['a', 'b'],
    relations: [{ from: 'a', to: 'b', assertion: { status: 'proposed' } }],
  });
  const byDefault = lint(text).diagnostics.find((d) => d.rule === 'assertion-reviewed');
  assert.equal(byDefault?.severity, 'warn');

  const gated = lint(text, { config: resolveConfig({ rules: { 'assertion-reviewed': 'error' } }) });
  assert.equal(gated.diagnostics.find((d) => d.rule === 'assertion-reviewed')?.severity, 'error');

  const off = lint(text, { config: resolveConfig({ rules: { 'assertion-reviewed': 'off' } }) });
  assert.ok(!off.diagnostics.some((d) => d.rule === 'assertion-reviewed'));
});

// ---------------------------------------------------------- causal rules

const colliderModel = doc({
  variables: [
    { id: 'x', role: 'exposure' },
    { id: 'm', role: 'adjusted' },
    { id: 'u' },
    { id: 'y', role: 'outcome' },
  ],
  relations: ['x -> m', 'u -> m', 'u -> y', 'x -> y'],
});

test('adjusting for a collider is reported with the path it opens', () => {
  const hit = lint(colliderModel).diagnostics.find((d) => d.rule === 'collider-adjustment');
  assert.ok(hit);
  assert.equal(hit.severity, 'error');
  assert.match(hit.message, /collider/);
  assert.match(hit.message, /x - m - u - y/);
});

test('an instrument with a path to the outcome that bypasses the exposure is reported', () => {
  const text = doc({
    variables: [
      { id: 'z', role: 'instrument' },
      { id: 'x', role: 'exposure' },
      { id: 'y', role: 'outcome' },
    ],
    relations: ['z -> x', 'x -> y', 'z -> y'],
  });
  const hit = lint(text).diagnostics.find((d) => d.rule === 'invalid-instrument');
  assert.ok(hit);
  assert.match(hit.message, /exclusion restriction/);
});

test('a valid instrument is not reported', () => {
  const text = doc({
    variables: [
      { id: 'z', role: 'instrument' },
      { id: 'x', role: 'exposure' },
      { id: 'y', role: 'outcome' },
    ],
    relations: ['z -> x', 'x -> y'],
  });
  assert.ok(!rules(text).includes('invalid-instrument'));
});

test('an exposure with no directed path to the outcome is reported', () => {
  const text = doc({
    variables: [{ id: 'x', role: 'exposure' }, { id: 'y', role: 'outcome' }, 'z'],
    relations: ['x -> z'],
  });
  assert.ok(rules(text).includes('no-causal-path'));
});

test('path-level rules are skipped on profiles that do not support them', () => {
  const cyclic = JSON.stringify({
    causal: '0.1',
    profile: 'cld',
    variables: [
      { id: 'x', role: 'exposure' },
      { id: 'y', role: 'outcome' },
    ],
    relations: ['x -> y', 'y -> x'],
  });
  assert.ok(!rules(cyclic).includes('no-causal-path'));
  assert.ok(!rules(cyclic).includes('collider-adjustment'));
});

test('a latent variable with fewer than two children is reported', () => {
  const text = doc({ variables: [{ id: 'u', latent: true }, 'a'], relations: ['u -> a'] });
  assert.ok(rules(text).includes('latent-underdetermined'));
});

// ------------------------------------------------------------------- fix

test('mechanical fixes are applied and nothing else changes', () => {
  const text = doc({
    variables: [{ id: 'birth_weight' }, { id: 'b' }],
    relations: [{ from: 'birth_weight', to: 'b', assertion: { status: 'proposed' } }],
  });
  const config = resolveConfig({
    rules: { 'missing-label': 'warn', 'relation-missing-id': 'warn' },
  });
  const result = fix(text, { config });
  const after = JSON.parse(result.text);

  assert.equal(after.variables[0].label, 'Birth weight');
  assert.equal(after.relations[0].id, 'birth_weight--directed--b');
  assert.equal(after.relations[0].assertion.status, 'proposed', 'status is never touched');
  assert.deepEqual(
    after.relations.map((r: any) => [r.from, r.to]),
    [['birth_weight', 'b']],
    'causal structure is never touched',
  );
});

test('judgement rules are never auto-fixed', () => {
  const text = doc({
    variables: ['a', 'b'],
    relations: [{ from: 'a', to: 'b', assertion: { status: 'proposed' } }],
  });
  const result = fix(text);
  assert.equal(JSON.parse(result.text).relations[0].assertion.status, 'proposed');
  assert.ok(result.remaining.some((d) => d.rule === 'assertion-reviewed'));
});

test('fixing never touches x- members', () => {
  const text = doc({
    variables: [{ id: 'a', 'x-tool': { keep: 1 } }],
    relations: [],
  });
  const config = resolveConfig({ rules: { 'missing-label': 'warn' } });
  const after = JSON.parse(fix(text, { config }).text);
  assert.deepEqual(after.variables[0]['x-tool'], { keep: 1 });
});

// ------------------------------------------------------------- summarize

test('summarize compresses a model and re-reads as the same structure', () => {
  const big = doc({
    variables: Array.from({ length: 40 }, (_, i) => `v${i}`),
    relations: Array.from({ length: 39 }, (_, i) => `v${i} -> v${i + 1}`),
  });
  const document = validate(big).document!;
  const summary = summarize(document);
  assert.ok(summary.length < big.length / 2, 'the summary is substantially smaller');

  const rebuilt = validate(
    JSON.stringify({
      causal: '0.1',
      profile: 'dag',
      variables: document.variables.map((v) => v.id),
      relations: summary
        .split('\n')
        .filter((line) => line.includes(' -> '))
        .map((line) =>
          line
            .split('#')[0]!
            .trim()
            .replace(/ \[[^\]]*\]/g, ''),
        ),
    }),
  );
  assert.deepEqual(
    rebuilt.document?.relations.map((r) => `${r.from}->${r.to}`),
    document.relations.map((r) => `${r.from}->${r.to}`),
  );
});
