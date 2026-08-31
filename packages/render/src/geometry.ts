import type { LaidOutNode, Point } from './layout.js';

/**
 * Point where the ray from a node's centre toward `toward` crosses its border,
 * pushed out by `gap` so arrowheads do not touch the outline.
 */
export function borderPoint(node: LaidOutNode, toward: Point, gap = 2): Point {
  const dx = toward.x - node.x;
  const dy = toward.y - node.y;
  if (dx === 0 && dy === 0) return { x: node.x, y: node.y };
  const tx = dx === 0 ? Infinity : node.width / 2 / Math.abs(dx);
  const ty = dy === 0 ? Infinity : node.height / 2 / Math.abs(dy);
  const t = Math.min(tx, ty);
  const length = Math.hypot(dx, dy);
  const extra = length > 0 ? gap / length : 0;
  return { x: node.x + dx * (t + extra), y: node.y + dy * (t + extra) };
}

/** Fixed precision so emitted geometry is byte-identical across runs. */
export function n(value: number): string {
  const rounded = Math.round(value * 100) / 100;
  return Object.is(rounded, -0) ? '0' : String(rounded);
}
