import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from 'pdf-lib';
import type { LaidOutEdge, Layout, Point } from './layout.js';
import { borderPoint, n } from './geometry.js';
import type { Theme } from './theme.js';

/** Fixed timestamp: a varying creation date would break byte-identical output. */
const EPOCH = new Date(0);

function colour(hex: string): ReturnType<typeof rgb> {
  const match = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!match) return rgb(0, 0, 0);
  const value = parseInt(match[1] as string, 16);
  return rgb(((value >> 16) & 255) / 255, ((value >> 8) & 255) / 255, (value & 255) / 255);
}

function dashArray(pattern: string): number[] {
  return pattern
    .split(/[\s,]+/)
    .map(Number)
    .filter((v) => Number.isFinite(v) && v > 0);
}

function arrowHead(tip: Point, from: Point, size = 7): string {
  const angle = Math.atan2(tip.y - from.y, tip.x - from.x);
  const spread = Math.PI / 7;
  const a = {
    x: tip.x - size * Math.cos(angle - spread),
    y: tip.y - size * Math.sin(angle - spread),
  };
  const b = {
    x: tip.x - size * Math.cos(angle + spread),
    y: tip.y - size * Math.sin(angle + spread),
  };
  return `M${n(tip.x)},${n(tip.y)} L${n(a.x)},${n(a.y)} L${n(b.x)},${n(b.y)} Z`;
}

function endpoints(edge: LaidOutEdge, layout: Layout): Point[] {
  const source = layout.nodes.find((node) => node.id === edge.relation.from);
  const target = layout.nodes.find((node) => node.id === edge.relation.to);
  const points = [...edge.points];
  if (source && points[1]) points[0] = borderPoint(source, points[1]);
  const penultimate = points[points.length - 2];
  if (target && penultimate) points[points.length - 1] = borderPoint(target, penultimate);
  return points;
}

function centred(
  page: PDFPage,
  text: string,
  font: PDFFont,
  size: number,
  x: number,
  baselineY: number,
  fill: ReturnType<typeof rgb>,
  height: number,
): void {
  const width = font.widthOfTextAtSize(text, size);
  page.drawText(text, { x: x - width / 2, y: height - baselineY, size, font, color: fill });
}

export interface PdfOptions {
  title?: string;
}

/**
 * Emit vector PDF for the print path.
 *
 * Text uses the PDF base-14 fonts, which every conforming reader is required to
 * provide. Nothing therefore depends on the fonts installed where the file is
 * opened, and no font has to be embedded.
 */
// @lat: [[rendering#Figure Rendering#Output Targets]]
export async function renderPdf(
  layout: Layout,
  theme: Theme,
  options: PdfOptions = {},
): Promise<Uint8Array> {
  const document = await PDFDocument.create();
  document.setCreationDate(EPOCH);
  document.setModificationDate(EPOCH);
  document.setProducer('@vpavlyshyn/render');
  document.setCreator('@vpavlyshyn/render');
  if (options.title) document.setTitle(options.title);

  const serif = /times|serif|georgia/i.test(theme.node.fontFamily);
  const nodeFont = await document.embedFont(
    serif ? StandardFonts.TimesRoman : StandardFonts.Helvetica,
  );
  const edgeSerif = /times|serif|georgia/i.test(theme.edge.fontFamily);
  const edgeFont = await document.embedFont(
    edgeSerif ? StandardFonts.TimesRoman : StandardFonts.Helvetica,
  );

  const page = document.addPage([layout.width, layout.height]);
  const top = layout.height;
  // The viewBox may start away from the origin; shift content into page space.
  const shift = (point: Point): Point => ({ x: point.x - layout.x, y: point.y - layout.y });

  page.drawRectangle({
    x: 0,
    y: 0,
    width: layout.width,
    height: layout.height,
    color: colour(theme.background),
  });

  for (const edge of layout.edges) {
    const points = endpoints(edge, layout).map(shift);
    const stroke = colour(edge.highlighted ? theme.highlight.edgeStroke : theme.edge.stroke);
    const thickness = edge.highlighted ? theme.highlight.edgeStrokeWidth : theme.edge.strokeWidth;
    const path = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${n(p.x)},${n(p.y)}`).join(' ');
    page.drawSvgPath(path, {
      x: 0,
      y: top,
      borderColor: stroke,
      borderWidth: thickness,
      borderDashArray:
        edge.relation.kind === 'bidirected' ? dashArray(theme.edge.bidirectedDash) : undefined,
    });

    const kind = edge.relation.kind;
    const first = points[0]!;
    const second = points[1] ?? first;
    const last = points[points.length - 1]!;
    const penultimate = points[points.length - 2] ?? last;
    if (kind === 'directed' || kind === 'bidirected' || kind === 'partially-directed') {
      page.drawSvgPath(arrowHead(last, penultimate), {
        x: 0,
        y: top,
        color: stroke,
        borderWidth: 0,
      });
    }
    if (kind === 'bidirected') {
      page.drawSvgPath(arrowHead(first, second), { x: 0, y: top, color: stroke, borderWidth: 0 });
    }
    if (kind === 'partially-directed' || kind === 'nondirected') {
      page.drawCircle({
        x: first.x,
        y: top - first.y,
        size: 3.2,
        borderColor: stroke,
        borderWidth: 1.4,
        color: colour(theme.background),
      });
    }
    if (kind === 'nondirected') {
      page.drawCircle({
        x: last.x,
        y: top - last.y,
        size: 3.2,
        borderColor: stroke,
        borderWidth: 1.4,
        color: colour(theme.background),
      });
    }

    if (typeof edge.relation.label === 'string' && edge.relation.label.length > 0) {
      const mid = shift(edge.points[Math.floor(edge.points.length / 2)] ?? first);
      centred(
        page,
        edge.relation.label,
        edgeFont,
        theme.edge.fontSize,
        mid.x,
        mid.y - 5,
        colour(theme.edge.labelColor),
        top,
      );
    }
  }

  for (const node of layout.nodes) {
    const centre = shift(node);
    page.drawRectangle({
      x: centre.x - node.width / 2,
      y: top - centre.y - node.height / 2,
      width: node.width,
      height: node.height,
      color: colour(node.highlighted ? theme.highlight.nodeFill : theme.node.fill),
      borderColor: colour(node.highlighted ? theme.highlight.nodeStroke : theme.node.stroke),
      borderWidth: node.highlighted ? theme.highlight.nodeStrokeWidth : theme.node.strokeWidth,
      borderDashArray: node.variable.latent ? dashArray(theme.node.latentDash) : undefined,
    });
    const lineHeight = theme.node.fontSize * theme.node.lineHeight;
    const firstBaseline =
      centre.y - ((node.lines.length - 1) * lineHeight) / 2 + theme.node.fontSize * 0.35;
    node.lines.forEach((line, index) => {
      centred(
        page,
        line,
        nodeFont,
        theme.node.fontSize,
        centre.x,
        firstBaseline + index * lineHeight,
        colour(theme.node.textColor),
        top,
      );
    });
  }

  return document.save({ useObjectStreams: false });
}
