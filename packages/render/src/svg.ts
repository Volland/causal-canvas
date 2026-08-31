import type { LaidOutEdge, Layout } from './layout.js';
import { borderPoint, n } from './geometry.js';
import type { Theme } from './theme.js';

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function markerNames(kind: string): { start?: string; end?: string } {
  switch (kind) {
    case 'directed':
      return { end: 'arrow' };
    case 'bidirected':
      return { start: 'arrow', end: 'arrow' };
    case 'partially-directed':
      return { start: 'odot', end: 'arrow' };
    case 'nondirected':
      return { start: 'odot', end: 'odot' };
    default:
      return {};
  }
}

function nodeLabel(node: Layout['nodes'][number], theme: Theme): string {
  const lineHeight = theme.node.fontSize * theme.node.lineHeight;
  const first = node.y - ((node.lines.length - 1) * lineHeight) / 2 + theme.node.fontSize * 0.35;
  const spans = node.lines
    .map(
      (line, index) =>
        `<tspan x="${n(node.x)}" y="${n(first + index * lineHeight)}">${escapeXml(line)}</tspan>`,
    )
    .join('');
  return `<text text-anchor="middle" font-family="${escapeXml(theme.node.fontFamily)}" font-size="${n(theme.node.fontSize)}" fill="${theme.node.textColor}">${spans}</text>`;
}

function edgePath(edge: LaidOutEdge, layout: Layout): string {
  const source = layout.nodes.find((node) => node.id === edge.relation.from);
  const target = layout.nodes.find((node) => node.id === edge.relation.to);
  const points = [...edge.points];
  if (source && points[1]) points[0] = borderPoint(source, points[1]);
  const last = points[points.length - 2];
  if (target && last) points[points.length - 1] = borderPoint(target, last);
  return points.map((p, index) => `${index === 0 ? 'M' : 'L'}${n(p.x)},${n(p.y)}`).join(' ');
}

/**
 * Emit publication SVG from computed geometry.
 *
 * Output is a pure function of the layout and the theme: no DOM, no browser,
 * no display, no network. That is what makes repeated renders byte-identical
 * and figures reviewable in a diff.
 */
// @lat: [[rendering#Figure Rendering#Render Pipeline]]
export function renderSvg(layout: Layout, theme: Theme): string {
  const lines: string[] = [];
  lines.push(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${n(layout.width)}" height="${n(layout.height)}" viewBox="${n(layout.x)} ${n(layout.y)} ${n(layout.width)} ${n(layout.height)}">`,
  );

  const marker = (id: string, stroke: string) =>
    [
      `<marker id="${id}-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">`,
      `<path d="M0,0 L10,5 L0,10 z" fill="${stroke}"/>`,
      `</marker>`,
      `<marker id="${id}-odot" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="6" markerHeight="6" orient="auto">`,
      `<circle cx="5" cy="5" r="3.2" fill="${theme.background}" stroke="${stroke}" stroke-width="1.4"/>`,
      `</marker>`,
    ].join('');

  lines.push('<defs>');
  lines.push(marker('e', theme.edge.stroke));
  lines.push(marker('h', theme.highlight.edgeStroke));
  lines.push('</defs>');

  lines.push(
    `<rect x="${n(layout.x)}" y="${n(layout.y)}" width="${n(layout.width)}" height="${n(layout.height)}" fill="${theme.background}"/>`,
  );

  lines.push('<g class="relations">');
  for (const edge of layout.edges) {
    const prefix = edge.highlighted ? 'h' : 'e';
    const stroke = edge.highlighted ? theme.highlight.edgeStroke : theme.edge.stroke;
    const width = edge.highlighted ? theme.highlight.edgeStrokeWidth : theme.edge.strokeWidth;
    const { start, end } = markerNames(edge.relation.kind);
    const dash =
      edge.relation.kind === 'bidirected' ? ` stroke-dasharray="${theme.edge.bidirectedDash}"` : '';
    const attributes = [
      `d="${edgePath(edge, layout)}"`,
      `fill="none"`,
      `stroke="${stroke}"`,
      `stroke-width="${n(width)}"`,
      start ? `marker-start="url(#${prefix}-${start})"` : '',
      end ? `marker-end="url(#${prefix}-${end})"` : '',
    ]
      .filter(Boolean)
      .join(' ');
    lines.push(`<path id="${escapeXml(edge.id)}" ${attributes}${dash}/>`);

    const label = edge.relation.label;
    if (typeof label === 'string' && label.length > 0) {
      const mid = edge.points[Math.floor(edge.points.length / 2)] ?? edge.points[0]!;
      lines.push(
        `<text x="${n(mid.x)}" y="${n(mid.y - 5)}" text-anchor="middle" font-family="${escapeXml(theme.edge.fontFamily)}" font-size="${n(theme.edge.fontSize)}" fill="${theme.edge.labelColor}">${escapeXml(label)}</text>`,
      );
    }
  }
  lines.push('</g>');

  lines.push('<g class="variables">');
  for (const node of layout.nodes) {
    const fill = node.highlighted ? theme.highlight.nodeFill : theme.node.fill;
    const stroke = node.highlighted ? theme.highlight.nodeStroke : theme.node.stroke;
    const width = node.highlighted ? theme.highlight.nodeStrokeWidth : theme.node.strokeWidth;
    const dash = node.variable.latent ? ` stroke-dasharray="${theme.node.latentDash}"` : '';
    lines.push(
      `<g id="${escapeXml(node.id)}">` +
        `<rect x="${n(node.x - node.width / 2)}" y="${n(node.y - node.height / 2)}" width="${n(node.width)}" height="${n(node.height)}" rx="${n(theme.node.radius)}" fill="${fill}" stroke="${stroke}" stroke-width="${n(width)}"${dash}/>` +
        nodeLabel(node, theme) +
        `</g>`,
    );
  }
  lines.push('</g>');

  lines.push('</svg>');
  return lines.join('\n') + '\n';
}
