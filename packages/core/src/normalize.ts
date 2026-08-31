import { ARROW_KINDS, ARROW_PATTERN } from '@causal/spec';
import type {
  CanonicalDocument,
  CanonicalRelation,
  CanonicalVariable,
  Diagnostic,
  RelationKind,
  View,
} from './types.js';

export interface NormalizeResult {
  document: CanonicalDocument | undefined;
  diagnostics: Diagnostic[];
  /**
   * Which entries the author wrote in shorthand. Retained so that formatting
   * can preserve the author's chosen form per element (§9.1).
   */
  shorthandVariables: Set<number>;
  shorthandRelations: Set<number>;
}

/**
 * Derive a relation identifier deterministically. Identity is required because
 * relations are reified entities in the JSON-LD binding; without it they become
 * blank nodes, which cannot be diffed, merged, or addressed. See §4.2.
 */
// @lat: [[format#CausalJSON#Relations#Relation Identity]]
export function deriveRelationId(from: string, kind: RelationKind, to: string): string {
  return `${from}--${kind}--${to}`;
}

const ARROW_HINT =
  'expected `<from> <arrow> <to>` with at least one space around the arrow, where <arrow> is one of -> <-> -- o-> o-o';

/**
 * Expand shorthand into canonical object form and derive absent relation
 * identifiers. Normalization MUST NOT change the causal interpretation of the
 * document (§8).
 *
 * Shorthand is expanded before schema validation so that a malformed arrow
 * reports the form it expected, rather than a JSON Schema union failure.
 */
// @lat: [[format#CausalJSON#Relations]]
export function normalize(value: unknown): NormalizeResult {
  const diagnostics: Diagnostic[] = [];
  const shorthandVariables = new Set<number>();
  const shorthandRelations = new Set<number>();

  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    diagnostics.push({
      rule: 'document-not-object',
      severity: 'error',
      layer: 'schema',
      message: 'a CausalJSON document must be a JSON object',
      pointer: '',
    });
    return { document: undefined, diagnostics, shorthandVariables, shorthandRelations };
  }

  const source = value as Record<string, unknown>;
  const document: Record<string, unknown> = { ...source };

  // --- variables -----------------------------------------------------------
  const variables: CanonicalVariable[] = [];
  const rawVariables = source['variables'];
  if (rawVariables !== undefined) {
    if (!Array.isArray(rawVariables)) {
      diagnostics.push({
        rule: 'variables-not-array',
        severity: 'error',
        layer: 'schema',
        message: '`variables` must be an array',
        pointer: '/variables',
      });
    } else {
      rawVariables.forEach((entry, index) => {
        if (typeof entry === 'string') {
          shorthandVariables.add(index);
          variables.push({ id: entry });
        } else if (entry !== null && typeof entry === 'object' && !Array.isArray(entry)) {
          variables.push({ ...(entry as CanonicalVariable) });
        } else {
          diagnostics.push({
            rule: 'variable-not-string-or-object',
            severity: 'error',
            layer: 'schema',
            message: 'a variable must be an identifier string or an object with an `id`',
            pointer: `/variables/${index}`,
          });
        }
      });
    }
  }
  document['variables'] = variables;

  // --- relations -----------------------------------------------------------
  const relations: CanonicalRelation[] = [];
  const rawRelations = source['relations'];
  if (rawRelations !== undefined) {
    if (!Array.isArray(rawRelations)) {
      diagnostics.push({
        rule: 'relations-not-array',
        severity: 'error',
        layer: 'schema',
        message: '`relations` must be an array',
        pointer: '/relations',
      });
    } else {
      rawRelations.forEach((entry, index) => {
        const pointer = `/relations/${index}`;
        if (typeof entry === 'string') {
          shorthandRelations.add(index);
          const match = ARROW_PATTERN.exec(entry);
          if (!match) {
            diagnostics.push({
              rule: 'relation-shorthand-malformed',
              severity: 'error',
              layer: 'schema',
              message: `relation shorthand ${JSON.stringify(entry)} does not parse: ${ARROW_HINT}`,
              pointer,
            });
            return;
          }
          const [, from, token, to] = match as unknown as [string, string, string, string];
          const kind = ARROW_KINDS[token as keyof typeof ARROW_KINDS];
          relations.push({ id: deriveRelationId(from, kind, to), from, to, kind });
        } else if (entry !== null && typeof entry === 'object' && !Array.isArray(entry)) {
          const object = { ...(entry as Record<string, unknown>) };
          const from = object['from'];
          const to = object['to'];
          const kind = (object['kind'] as RelationKind | undefined) ?? 'directed';
          object['kind'] = kind;
          if (typeof from !== 'string' || typeof to !== 'string') {
            diagnostics.push({
              rule: 'relation-missing-endpoint',
              severity: 'error',
              layer: 'schema',
              message: 'a relation object requires string `from` and `to` members',
              pointer,
            });
            return;
          }
          if (typeof object['id'] !== 'string') object['id'] = deriveRelationId(from, kind, to);
          relations.push(object as unknown as CanonicalRelation);
        } else {
          diagnostics.push({
            rule: 'relation-not-string-or-object',
            severity: 'error',
            layer: 'schema',
            message: 'a relation must be an arrow string or an object with `from` and `to`',
            pointer,
          });
        }
      });
    }
  }
  document['relations'] = relations;

  // --- views ---------------------------------------------------------------
  const rawViews = source['views'];
  if (rawViews === undefined) {
    document['views'] = [] as View[];
  } else if (!Array.isArray(rawViews)) {
    diagnostics.push({
      rule: 'views-not-array',
      severity: 'error',
      layer: 'schema',
      message: '`views` must be an array',
      pointer: '/views',
    });
    document['views'] = [] as View[];
  }

  return {
    document: document as unknown as CanonicalDocument,
    diagnostics,
    shorthandVariables,
    shorthandRelations,
  };
}
