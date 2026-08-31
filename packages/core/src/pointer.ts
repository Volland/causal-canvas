import { findNodeAtLocation, type Node } from 'jsonc-parser';
import type { Position } from './types.js';

/** Split a JSON Pointer (RFC 6901) into path segments. */
export function pointerToSegments(pointer: string): (string | number)[] {
  if (pointer === '') return [];
  if (!pointer.startsWith('/')) throw new Error(`not a JSON Pointer: ${pointer}`);
  return pointer
    .slice(1)
    .split('/')
    .map((raw) => {
      const token = raw.replace(/~1/g, '/').replace(/~0/g, '~');
      return /^(0|[1-9][0-9]*)$/.test(token) ? Number(token) : token;
    });
}

/** Join path segments into a JSON Pointer. */
export function toPointer(segments: (string | number)[]): string {
  if (segments.length === 0) return '';
  return '/' + segments.map((s) => String(s).replace(/~/g, '~0').replace(/\//g, '~1')).join('/');
}

/** Resolve a pointer against a parsed value. */
export function resolvePointer(
  value: unknown,
  pointer: string,
): { found: boolean; value: unknown } {
  let current: any = value;
  for (const segment of pointerToSegments(pointer)) {
    if (current === null || typeof current !== 'object') return { found: false, value: undefined };
    if (Array.isArray(current)) {
      if (typeof segment !== 'number' || segment >= current.length) {
        return { found: false, value: undefined };
      }
    } else if (!Object.prototype.hasOwnProperty.call(current, String(segment))) {
      return { found: false, value: undefined };
    }
    current = current[segment as any];
  }
  return { found: true, value: current };
}

/**
 * Map a pointer produced against the normalized document back onto the source
 * document, by trimming to the deepest prefix that still resolves.
 *
 * Normalization expands shorthand in place, so array indices always correspond;
 * only members introduced by normalization (a derived `kind`, say) are absent
 * from the source, and those resolve to their containing element instead.
 */
export function toSourcePointer(sourceValue: unknown, normalizedPointer: string): string {
  const segments = pointerToSegments(normalizedPointer);
  for (let i = segments.length; i >= 0; i--) {
    const candidate = toPointer(segments.slice(0, i));
    if (resolvePointer(sourceValue, candidate).found) return candidate;
  }
  return '';
}

function lineColumn(text: string, offset: number): { line: number; column: number } {
  let line = 1;
  let lastNewline = -1;
  for (let i = 0; i < offset && i < text.length; i++) {
    if (text.charCodeAt(i) === 10) {
      line++;
      lastNewline = i;
    }
  }
  return { line, column: offset - lastNewline };
}

/** Locate a pointer in the source text, for editor squiggles and CLI output. */
export function positionFor(
  tree: Node | undefined,
  text: string,
  pointer: string,
): Position | undefined {
  if (!tree) return undefined;
  const node = findNodeAtLocation(tree, pointerToSegments(pointer) as any);
  if (!node) return undefined;
  const { line, column } = lineColumn(text, node.offset);
  return { line, column, offset: node.offset, length: node.length };
}
