import type { CanonicalDocument, CanonicalRelation } from './types.js';

/**
 * Graph queries over a normalized document.
 *
 * This is deliberately the minimum needed by the specified lint rules —
 * reachability, cycles, and collider detection on simple paths. The full
 * analysis engine (d-separation, minimal adjustment sets, testable
 * implications) is a separate package, per the delivery plan.
 */
export class CausalGraph {
  readonly ids: string[];
  readonly relations: CanonicalRelation[];
  private readonly children = new Map<string, string[]>();
  private readonly parents = new Map<string, string[]>();
  /** Adjacency ignoring direction, over directed edges only. */
  private readonly neighbours = new Map<string, string[]>();

  constructor(document: CanonicalDocument) {
    this.ids = document.variables.map((v) => v.id);
    this.relations = document.relations;
    for (const id of this.ids) {
      this.children.set(id, []);
      this.parents.set(id, []);
      this.neighbours.set(id, []);
    }
    for (const relation of document.relations) {
      if (relation.kind !== 'directed') continue;
      this.children.get(relation.from)?.push(relation.to);
      this.parents.get(relation.to)?.push(relation.from);
      this.neighbours.get(relation.from)?.push(relation.to);
      this.neighbours.get(relation.to)?.push(relation.from);
    }
  }

  childrenOf(id: string): string[] {
    return this.children.get(id) ?? [];
  }

  parentsOf(id: string): string[] {
    return this.parents.get(id) ?? [];
  }

  /** Variables reachable from `start` by following directed edges forward. */
  descendants(start: string): Set<string> {
    const seen = new Set<string>();
    const stack = [...this.childrenOf(start)];
    while (stack.length > 0) {
      const next = stack.pop() as string;
      if (seen.has(next)) continue;
      seen.add(next);
      stack.push(...this.childrenOf(next));
    }
    return seen;
  }

  hasDirectedPath(from: string, to: string): boolean {
    return this.descendants(from).has(to);
  }

  /**
   * Directed cycles, each returned as the sequence of variables forming it.
   * Only directed edges participate: a bidirected edge is not a cycle.
   */
  findCycles(limit = 16): string[][] {
    const cycles: string[][] = [];
    const colour = new Map<string, 0 | 1 | 2>();
    const stack: string[] = [];

    const visit = (id: string): void => {
      if (cycles.length >= limit) return;
      colour.set(id, 1);
      stack.push(id);
      for (const child of this.childrenOf(id)) {
        if (cycles.length >= limit) break;
        const mark = colour.get(child) ?? 0;
        if (mark === 1) {
          const start = stack.indexOf(child);
          if (start >= 0) cycles.push([...stack.slice(start), child]);
        } else if (mark === 0) {
          visit(child);
        }
      }
      stack.pop();
      colour.set(id, 2);
    };

    for (const id of this.ids) if ((colour.get(id) ?? 0) === 0) visit(id);
    return cycles;
  }

  /**
   * Simple undirected paths between two variables, over directed edges.
   * Bounded because enumeration is exponential; causal diagrams that exceed
   * the bound are past the point where path-level lints are useful.
   */
  simplePaths(from: string, to: string, maxPaths = 200, maxLength = 12): string[][] {
    const found: string[][] = [];
    const path: string[] = [];
    const onPath = new Set<string>();

    const walk = (current: string): void => {
      if (found.length >= maxPaths || path.length > maxLength) return;
      path.push(current);
      onPath.add(current);
      if (current === to && path.length > 1) {
        found.push([...path]);
      } else {
        for (const next of this.neighbours.get(current) ?? []) {
          if (!onPath.has(next)) walk(next);
        }
      }
      path.pop();
      onPath.delete(current);
    };

    if (this.ids.includes(from) && this.ids.includes(to)) walk(from);
    return found;
  }

  /** True when `middle` is a collider on the path (both neighbours point into it). */
  isColliderOn(path: string[], middle: string): boolean {
    const index = path.indexOf(middle);
    if (index <= 0 || index >= path.length - 1) return false;
    const before = path[index - 1] as string;
    const after = path[index + 1] as string;
    return this.childrenOf(before).includes(middle) && this.childrenOf(after).includes(middle);
  }

  variablesWithRole(document: CanonicalDocument, role: string): string[] {
    return document.variables.filter((v) => v.role === role).map((v) => v.id);
  }
}
