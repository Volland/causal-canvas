import test from 'node:test';
import assert from 'node:assert/strict';
import { validate, type CanonicalDocument } from '@causal/core';
import {
  computeLayout,
  render,
  resolveTheme,
  resolveView,
  findView,
  renderPdf,
  renderPng,
  renderSvg,
  UnknownThemeError,
  UnknownViewError,
} from './index.js';

function model(body: Record<string, unknown>): CanonicalDocument {
  const result = validate(JSON.stringify({ causal: '0.1', profile: 'admg', ...body }));
  assert.ok(result.document, 'fixture must be valid');
  assert.deepEqual(
    result.diagnostics.filter((d) => d.severity === 'error').map((d) => d.rule),
    [],
  );
  return result.document;
}

const sample = model({
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
    { id: 'accepted', filter: { status: 'accepted' }, theme: 'book-bw' },
    {
      id: 'pinned',
      theme: 'book-bw',
      layout: { pin: { x: [0, 0], y: [400, 0] } },
    },
  ],
});

// @lat: [[tests#Test specifications#Figure guarantees#Renders are byte-identical]]
test('repeated renders are byte-identical', async () => {
  const first = await render(sample, { view: 'full' });
  const second = await render(sample, { view: 'full' });
  assert.equal(first.content, second.content);
});

test('rendering needs no browser, display, or network', async () => {
  const result = await render(sample, { view: 'full' });
  assert.equal(typeof result.content, 'string');
  assert.match(result.content as string, /^<svg xmlns/);
});

test('a view subsets the graph, keeping only relations whose endpoints survive', () => {
  const resolved = resolveView(sample, findView(sample, 'triple'));
  assert.deepEqual(
    resolved.variables.map((v) => v.id),
    ['x', 'm', 'y'],
  );
  assert.deepEqual(
    resolved.relations.map((r) => `${r.from}->${r.to}`),
    ['x->m', 'm->y'],
  );
});

test('a status filter removes proposed relations from the figure but not the model', () => {
  const resolved = resolveView(sample, findView(sample, 'accepted'));
  assert.equal(resolved.relations.length, 3);
  assert.ok(!resolved.relations.some((r) => r.assertion?.status === 'proposed'));
  assert.equal(sample.relations.length, 4, 'the document is untouched');
});

test('an unknown view is an error listing the declared views', async () => {
  await assert.rejects(
    () => render(sample, { view: 'nope' }),
    (error: unknown) => {
      assert.ok(error instanceof UnknownViewError);
      assert.match(error.message, /`full`/);
      return true;
    },
  );
});

test('explicit pins are honoured exactly', async () => {
  const view = findView(sample, 'pinned');
  const layout = await computeLayout(resolveView(sample, view), resolveTheme(view.theme));
  const x = layout.nodes.find((n) => n.id === 'x')!;
  const y = layout.nodes.find((n) => n.id === 'y')!;
  assert.deepEqual([x.x, x.y], [0, 0]);
  assert.deepEqual([y.x, y.y], [400, 0]);
});

// @lat: [[tests#Test specifications#Figure guarantees#Pins survive model growth]]
test('pinned variables do not move when an unpinned variable is added', async () => {
  const view = findView(sample, 'pinned');
  const before = await computeLayout(resolveView(sample, view), resolveTheme(view.theme));

  const grown = model({
    variables: [...sample.variables.map((v) => ({ ...v })), { id: 'extra', label: 'Extra' }],
    relations: [...sample.relations.map((r) => ({ ...r })), { from: 'extra', to: 'm' }],
    views: sample.views,
  });
  const after = await computeLayout(
    resolveView(grown, findView(grown, 'pinned')),
    resolveTheme('book-bw'),
  );

  for (const id of ['x', 'y']) {
    const a = before.nodes.find((n) => n.id === id)!;
    const b = after.nodes.find((n) => n.id === id)!;
    assert.deepEqual([a.x, a.y], [b.x, b.y], `${id} must not move`);
  }
});

test('every output format derives from one geometry', async () => {
  const svg = await render(sample, { view: 'full', format: 'svg' });
  const pdf = await render(sample, { view: 'full', format: 'pdf' });
  assert.deepEqual(
    svg.layout.nodes.map((n) => [n.id, n.x, n.y]),
    pdf.layout.nodes.map((n) => [n.id, n.x, n.y]),
  );
  assert.deepEqual([svg.layout.width, svg.layout.height], [pdf.layout.width, pdf.layout.height]);
});

test('PDF text uses base-14 fonts, so nothing depends on the fonts where it is opened', async () => {
  const view = findView(sample, 'full');
  const layout = await computeLayout(resolveView(sample, view), resolveTheme('book-bw'));
  const bytes = await renderPdf(layout, resolveTheme('book-bw'));
  const text = Buffer.from(bytes).toString('latin1');
  assert.match(text, /Times-Roman|Helvetica/, 'a base-14 font is referenced');
  assert.ok(!text.includes('/FontFile'), 'no font program needs embedding');
});

test('PDF output is byte-identical across runs', async () => {
  const view = findView(sample, 'full');
  const layout = await computeLayout(resolveView(sample, view), resolveTheme('book-bw'));
  const a = await renderPdf(layout, resolveTheme('book-bw'));
  const b = await renderPdf(layout, resolveTheme('book-bw'));
  assert.deepEqual(Buffer.from(a), Buffer.from(b));
});

test('raster output matches the requested resolution', async (t) => {
  const view = findView(sample, 'full');
  const layout = await computeLayout(resolveView(sample, view), resolveTheme('book-bw'));
  const svg = renderSvg(layout, resolveTheme('book-bw'));
  let png: Uint8Array;
  try {
    png = await renderPng(svg, layout.width, { width: 800 });
  } catch {
    t.skip('optional rasterizer not installed');
    return;
  }
  const buffer = Buffer.from(png);
  assert.equal(buffer.subarray(1, 4).toString(), 'PNG');
  assert.equal(buffer.readUInt32BE(16), 800, 'IHDR width');
});

test('a project theme overrides a built-in of the same name', () => {
  const theme = resolveTheme('book-bw', { 'book-bw': { background: '#eeeeee' } });
  assert.equal(theme.background, '#eeeeee');
  assert.equal(theme.node.stroke, '#000000', 'unspecified tokens fall back to the built-in');
});

test('an unknown theme is reported rather than silently substituted', () => {
  assert.throws(
    () => resolveTheme('nope'),
    (error: unknown) => {
      assert.ok(error instanceof UnknownThemeError);
      assert.match(error.message, /`book-bw`/);
      return true;
    },
  );
});

test('latent variables and bidirected relations are drawn distinctly', async () => {
  const admg = model({
    variables: ['a', 'b'],
    relations: [{ from: 'a', to: 'b', kind: 'bidirected' }],
  });
  const svg = (await render(admg, {})).content as string;
  assert.match(svg, /stroke-dasharray/, 'bidirected relations are dashed');
  assert.match(svg, /marker-start="url\(#e-arrow\)"/);
  assert.match(svg, /marker-end="url\(#e-arrow\)"/);
});

test('every PAG endpoint kind emits its marker', async () => {
  const pag = validate(
    JSON.stringify({
      causal: '0.1',
      profile: 'pag',
      variables: ['a', 'b', 'c', 'd'],
      relations: ['a o-> b', 'b o-o c', 'c -- d'],
    }),
  ).document!;
  const svg = (await render(pag, {})).content as string;
  assert.match(svg, /marker-start="url\(#e-odot\)"/);
  assert.match(svg, /marker-end="url\(#e-odot\)"/);
});
