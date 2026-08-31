import { applyEdits, modify } from 'jsonc-parser';
import { analyze, type AnalysisOptions } from './lint.js';
import { deriveRelationId } from './normalize.js';
import { pointerToSegments } from './pointer.js';
import type { Diagnostic } from './types.js';

const FORMATTING = { insertSpaces: true, tabSize: 2, eol: '\n' } as const;

function humanize(id: string): string {
  const words = id.replace(/[-_.]+/g, ' ').trim();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

export interface FixResult {
  text: string;
  applied: Diagnostic[];
  /** Diagnostics that remain, including every non-mechanical one. */
  remaining: Diagnostic[];
}

/**
 * Repair mechanical problems only.
 *
 * Fixes are applied as surgical edits to the JSON text, one at a time, so that
 * formatting, key order, and `x-` members survive. Causal structure, assertion
 * status, and extension members are never touched: only `label` and `id` are
 * ever written, and only where they are absent.
 */
// @lat: [[validation#Validation#Auto-fix Boundaries]]
export function fix(text: string, options: AnalysisOptions = {}): FixResult {
  const applied: Diagnostic[] = [];
  let current = text;

  // Each fix invalidates offsets, so re-analyze after every edit. Bounded by
  // the number of fixable findings, which strictly decreases.
  for (let guard = 0; guard < 500; guard++) {
    const result = analyze(current, options);
    const target = result.diagnostics.find((d) => d.fixable);
    if (!target || !result.document) break;

    const segments = pointerToSegments(target.pointer);
    let path: (string | number)[] | undefined;
    let value: unknown;

    if (target.rule === 'missing-label' && segments[0] === 'variables') {
      const index = segments[1] as number;
      const variable = result.document.variables[index];
      if (!variable) break;
      path = [...segments, 'label'];
      value = humanize(variable.id);
    } else if (target.rule === 'relation-missing-id' && segments[0] === 'relations') {
      const index = segments[1] as number;
      const relation = result.document.relations[index];
      if (!relation) break;
      path = [...segments, 'id'];
      value = deriveRelationId(relation.from, relation.kind, relation.to);
    }

    if (!path) break;
    const edits = modify(current, path, value, { formattingOptions: FORMATTING });
    if (edits.length === 0) break;
    current = applyEdits(current, edits);
    applied.push(target);
  }

  return { text: current, applied, remaining: analyze(current, options).diagnostics };
}
