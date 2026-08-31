import ElkConstructor from 'elkjs/lib/elk.bundled.js';
import type { CanonicalRelation, CanonicalVariable } from '@vpavlyshyn/core';
import type { ResolvedView } from './resolve.js';
import type { Theme } from './theme.js';

const ELK: any = (ElkConstructor as any).default ?? ElkConstructor;

export interface Point {
  x: number;
  y: number;
}

export interface LaidOutNode extends Point {
  id: string;
  width: number;
  height: number;
  /** Label split into rendered lines. Long labels wrap rather than widening. */
  lines: string[];
  variable: CanonicalVariable;
  pinned: boolean;
  highlighted: boolean;
}

export interface LaidOutEdge {
  id: string;
  relation: CanonicalRelation;
  /** Centre-to-centre route including any bend points. Clipped at draw time. */
  points: Point[];
  highlighted: boolean;
}

export interface Layout {
  nodes: LaidOutNode[];
  edges: LaidOutEdge[];
  /** viewBox origin. Content is never translated, so explicit pins keep the
   *  exact coordinates the author gave them. */
  x: number;
  y: number;
  width: number;
  height: number;
}

const DIRECTIONS: Record<string, string> = { LR: 'RIGHT', RL: 'LEFT', TB: 'DOWN', BT: 'UP' };

/**
 * Greedy word wrap. Long labels are wrapped rather than allowed to widen the
 * figure, because a figure that is wide relative to its text shrinks to an
 * unreadable size when placed in a book column.
 */
export function wrapLabel(label: string, maxChars: number): string[] {
  const words = label.split(/\s+/).filter(Boolean);
  if (words.length === 0) return [label];
  const lines: string[] = [];
  let current = '';
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (candidate.length <= maxChars || current === '') current = candidate;
    else {
      lines.push(current);
      current = word;
    }
  }
  if (current) lines.push(current);
  return lines;
}

/** Deterministic label measurement. No font metrics are loaded, by design. */
function measure(label: string, theme: Theme): { width: number; height: number; lines: string[] } {
  const lines = wrapLabel(label, theme.node.maxLabelChars);
  const longest = Math.max(...lines.map((line) => line.length));
  const lineHeight = theme.node.fontSize * theme.node.lineHeight;
  const width = Math.max(
    theme.node.minWidth,
    longest * theme.node.fontSize * 0.56 + theme.node.paddingX * 2,
  );
  const height = Math.max(
    theme.node.minHeight,
    lines.length * lineHeight + theme.node.paddingY * 2,
  );
  return { width: Math.round(width), height: Math.round(height), lines };
}

/**
 * Fit `scale * source + offset` mapping the automatic layout onto the pins.
 *
 * Scaling is only attempted when both the observed and the target coordinates
 * actually vary along the axis. Pins that share a coordinate — two variables
 * pinned to the same row, which is the common case — would otherwise collapse
 * every unpinned variable onto that row.
 */
function fitAxis(observed: number[], target: number[]): { scale: number; offset: number } {
  const n = observed.length;
  if (n === 0) return { scale: 1, offset: 0 };
  const meanObserved = observed.reduce((a, b) => a + b, 0) / n;
  const meanTarget = target.reduce((a, b) => a + b, 0) / n;

  let covariance = 0;
  let observedVariance = 0;
  let targetVariance = 0;
  for (let i = 0; i < n; i++) {
    const dObserved = (observed[i] as number) - meanObserved;
    const dTarget = (target[i] as number) - meanTarget;
    covariance += dObserved * dTarget;
    observedVariance += dObserved * dObserved;
    targetVariance += dTarget * dTarget;
  }

  if (observedVariance <= 1e-9 || targetVariance <= 1e-9) {
    return { scale: 1, offset: meanTarget - meanObserved };
  }

  // Clamped so an extreme pin spread cannot make the rest of the figure
  // unreadable. Pinned variables are set exactly afterwards regardless.
  const scale = Math.min(4, Math.max(0.25, covariance / observedVariance));
  return { scale, offset: meanTarget - scale * meanObserved };
}

/**
 * Compute geometry for a resolved view.
 *
 * Layout runs once here and is consumed by every emitter, which is what stops
 * the editor and the published figure disagreeing about placement.
 *
 * Explicit pins are honoured exactly. When two or more variables are pinned, the
 * automatic layout is fitted onto them by an affine transform so the unpinned
 * remainder keeps its relative structure. Pinned variables are then set to their
 * exact coordinates, so adding an unpinned variable never moves a pinned one.
 */
// @lat: [[rendering#Figure Rendering#Layout Model]]
export async function computeLayout(resolved: ResolvedView, theme: Theme): Promise<Layout> {
  const layoutSpec = resolved.view.layout ?? {};
  const direction = DIRECTIONS[layoutSpec.direction ?? 'LR'] ?? 'RIGHT';
  const spacingNode = layoutSpec.spacing?.node ?? 40;
  const spacingLayer = layoutSpec.spacing?.layer ?? 70;

  const sizes = new Map<string, { width: number; height: number; lines: string[] }>();
  for (const variable of resolved.variables) {
    sizes.set(variable.id, measure(variable.label ?? variable.id, theme));
  }

  const rankByRole = layoutSpec.rank === 'exposure-to-outcome';
  const elkGraph = {
    id: 'root',
    layoutOptions: {
      'elk.algorithm': 'layered',
      'elk.direction': direction,
      'elk.spacing.nodeNode': String(spacingNode),
      'elk.layered.spacing.nodeNodeBetweenLayers': String(spacingLayer),
      'elk.edgeRouting': 'POLYLINE',
      'elk.layered.considerModelOrder.strategy': 'NODES_AND_EDGES',
    },
    children: resolved.variables.map((variable) => {
      const size = sizes.get(variable.id)!;
      const options: Record<string, string> = {};
      // Only the outcome is constrained. Pinning the exposure to the first
      // layer would push its own ancestors — an instrument, a confounder —
      // into later layers and route their arrows backwards.
      if (rankByRole && variable.role === 'outcome') {
        options['elk.layered.layering.layerConstraint'] = 'LAST';
      }
      return { id: variable.id, width: size.width, height: size.height, layoutOptions: options };
    }),
    edges: resolved.relations.map((relation, index) => ({
      id: `e${index}`,
      sources: [relation.from],
      targets: [relation.to],
    })),
  };

  const laid = await new ELK().layout(elkGraph);

  const positions = new Map<string, Point>();
  for (const child of laid.children ?? []) {
    const size = sizes.get(child.id)!;
    positions.set(child.id, {
      x: (child.x ?? 0) + size.width / 2,
      y: (child.y ?? 0) + size.height / 2,
    });
  }

  const bends = new Map<string, Point[]>();
  for (const edge of laid.edges ?? []) {
    const section = edge.sections?.[0];
    bends.set(
      edge.id,
      (section?.bendPoints ?? []).map((p: Point) => ({ x: p.x, y: p.y })),
    );
  }

  // --- pin anchoring -------------------------------------------------------
  const pins = layoutSpec.pin ?? {};
  const pinned = Object.entries(pins).filter(([id]) => positions.has(id));
  let transform = (p: Point): Point => p;
  if (pinned.length === 1) {
    const [id, target] = pinned[0] as [string, [number, number]];
    const observed = positions.get(id)!;
    const dx = target[0] - observed.x;
    const dy = target[1] - observed.y;
    transform = (p) => ({ x: p.x + dx, y: p.y + dy });
  } else if (pinned.length >= 2) {
    const observed = pinned.map(([id]) => positions.get(id)!);
    const targets = pinned.map(([, xy]) => xy as [number, number]);
    const fx = fitAxis(
      observed.map((p) => p.x),
      targets.map((t) => t[0]),
    );
    const fy = fitAxis(
      observed.map((p) => p.y),
      targets.map((t) => t[1]),
    );
    transform = (p) => ({ x: p.x * fx.scale + fx.offset, y: p.y * fy.scale + fy.offset });
  }

  for (const [id, point] of positions) positions.set(id, transform(point));
  for (const [id, target] of pinned) positions.set(id, { x: target[0], y: target[1] });

  const nodes: LaidOutNode[] = resolved.variables.map((variable) => {
    const size = sizes.get(variable.id)!;
    const point = positions.get(variable.id) ?? { x: 0, y: 0 };
    return {
      id: variable.id,
      x: point.x,
      y: point.y,
      width: size.width,
      height: size.height,
      lines: size.lines,
      variable,
      pinned: Object.prototype.hasOwnProperty.call(pins, variable.id),
      highlighted: resolved.highlightedVariables.has(variable.id),
    };
  });

  const edges: LaidOutEdge[] = resolved.relations.map((relation, index) => ({
    id: relation.id,
    relation,
    points: [
      positions.get(relation.from) ?? { x: 0, y: 0 },
      ...(bends.get(`e${index}`) ?? []).map(transform),
      positions.get(relation.to) ?? { x: 0, y: 0 },
    ],
    highlighted: resolved.highlightedRelations.has(relation.id),
  }));

  // --- bounds --------------------------------------------------------------
  // Content is never shifted: the viewBox is grown to cover it. Pinned
  // variables therefore appear at exactly the coordinates the author gave.
  const xs = nodes.flatMap((node) => [node.x - node.width / 2, node.x + node.width / 2]);
  const ys = nodes.flatMap((node) => [node.y - node.height / 2, node.y + node.height / 2]);
  for (const edge of edges) {
    for (const point of edge.points) {
      xs.push(point.x);
      ys.push(point.y);
    }
  }

  for (const node of nodes) {
    node.x = round(node.x);
    node.y = round(node.y);
  }
  for (const edge of edges) {
    edge.points = edge.points.map((point) => ({ x: round(point.x), y: round(point.y) }));
  }

  const minX = xs.length > 0 ? Math.min(...xs) : 0;
  const minY = ys.length > 0 ? Math.min(...ys) : 0;
  const maxX = xs.length > 0 ? Math.max(...xs) : 0;
  const maxY = ys.length > 0 ? Math.max(...ys) : 0;

  return {
    nodes,
    edges,
    x: round(minX - theme.padding),
    y: round(minY - theme.padding),
    width: round(Math.max(maxX - minX + theme.padding * 2, theme.padding * 2)),
    height: round(Math.max(maxY - minY + theme.padding * 2, theme.padding * 2)),
  };
}

/** Fixed-precision rounding keeps emitted output byte-identical across runs. */
function round(value: number): number {
  return Math.round(value * 100) / 100;
}
