import { applyEdits, modify, type JSONPath } from 'jsonc-parser';
import { KIND_ARROWS, type RelationKind } from '@vpavlyshyn/spec';
import { normalize, parseDocument, type CanonicalDocument } from '@vpavlyshyn/core';

/**
 * Surgical edits over CausalJSON document text.
 *
 * Every operation rewrites only the members it targets. Nothing here parses a
 * document into an object and re-serialises it: that would reformat the whole
 * file, reorder keys, and drop the author's shorthand, violating the round-trip
 * preservation MUST in CausalJSON 0.1 §9.1.
 *
 * This lives in its own package rather than in the extension so the guarantee
 * is testable without a running editor.
 */

const FORMATTING = { insertSpaces: true, tabSize: 2, eol: '\n' } as const;

export interface EditResult {
  text: string;
  changed: boolean;
  /** Structural changes the author should be told about, e.g. a created view. */
  notes: string[];
}

export class EditError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'EditError';
  }
}

function unchanged(text: string): EditResult {
  return { text, changed: false, notes: [] };
}

function write(text: string, path: JSONPath, value: unknown): string {
  const edits = modify(text, path, value, { formattingOptions: FORMATTING });
  return edits.length === 0 ? text : applyEdits(text, edits);
}

interface Context {
  raw: Record<string, unknown>;
  document: CanonicalDocument;
}

function read(text: string): Context {
  const parsed = parseDocument(text);
  if (parsed.value === null || typeof parsed.value !== 'object' || Array.isArray(parsed.value)) {
    throw new EditError('document does not parse as a JSON object');
  }
  const normalized = normalize(parsed.value);
  if (!normalized.document) throw new EditError('document could not be normalized');
  return { raw: parsed.value as Record<string, unknown>, document: normalized.document };
}

function variableIndex(context: Context, id: string): number {
  const index = context.document.variables.findIndex((variable) => variable.id === id);
  if (index < 0) throw new EditError(`no variable \`${id}\` in the document`);
  return index;
}

function relationIndex(context: Context, id: string): number {
  const index = context.document.relations.findIndex((relation) => relation.id === id);
  if (index < 0) throw new EditError(`no relation \`${id}\` in the document`);
  return index;
}

/** True when the entry at `index` was written in shorthand. */
function isShorthand(context: Context, member: 'variables' | 'relations', index: number): boolean {
  const array = context.raw[member];
  return Array.isArray(array) && typeof array[index] === 'string';
}

// -------------------------------------------------------------------- pins

export interface PinOptions {
  id: string;
  x: number;
  y: number;
  /** View to pin into. Defaults to the document's first view. */
  viewId?: string;
}

/**
 * Record a variable's position as a pin on a view.
 *
 * Layout may only live in `views[].layout`, so a document declaring no views
 * has nowhere legal to put a coordinate. Rather than refuse the drag or hold
 * the position in invisible editor state, a view is created and the caller is
 * told, through `notes`, that it happened.
 */
// @lat: [[extension#Causal Canvas extension#Surgical Edits]]
export function pinVariable(text: string, options: PinOptions): EditResult {
  const context = read(text);
  variableIndex(context, options.id);
  const notes: string[] = [];

  const views = context.document.views;
  let index = views.findIndex((view) =>
    options.viewId === undefined ? true : view.id === options.viewId,
  );

  let next = text;
  if (index < 0) {
    if (options.viewId !== undefined && views.length > 0) {
      throw new EditError(`no view \`${options.viewId}\` in the document`);
    }
    const id = options.viewId ?? 'default';
    next = write(
      next,
      ['views'],
      [...(Array.isArray(context.raw['views']) ? (context.raw['views'] as unknown[]) : []), { id }],
    );
    index = views.length;
    notes.push(`created view \`${id}\` to hold the layout`);
  }

  next = write(next, ['views', index, 'layout', 'pin', options.id], [options.x, options.y]);
  return { text: next, changed: next !== text, notes };
}

// --------------------------------------------------------------- relations

export interface AddRelationOptions {
  from: string;
  to: string;
  kind?: RelationKind;
}

/**
 * Append a relation, written in arrow shorthand.
 *
 * Shorthand is the terse form the format is designed around, and every kind is
 * expressible as an arrow, so a newly drawn relation reads the way a person
 * would have typed it.
 */
export function addRelation(text: string, options: AddRelationOptions): EditResult {
  const context = read(text);
  variableIndex(context, options.from);
  variableIndex(context, options.to);

  const kind = options.kind ?? 'directed';
  const arrow = KIND_ARROWS[kind];
  if (!arrow) throw new EditError(`unknown relation kind \`${kind}\``);

  const existing = Array.isArray(context.raw['relations'])
    ? (context.raw['relations'] as unknown[])
    : [];
  const next = write(
    text,
    ['relations', existing.length],
    `${options.from} ${arrow} ${options.to}`,
  );
  return { text: next, changed: next !== text, notes: [] };
}

export function deleteRelation(text: string, id: string): EditResult {
  const context = read(text);
  const index = relationIndex(context, id);
  const next = write(text, ['relations', index], undefined);
  return { text: next, changed: next !== text, notes: [] };
}

// --------------------------------------------------------------- variables

export interface AddVariableOptions {
  id: string;
  label?: string;
}

export function addVariable(text: string, options: AddVariableOptions): EditResult {
  const context = read(text);
  if (context.document.variables.some((variable) => variable.id === options.id)) {
    throw new EditError(`variable \`${options.id}\` already exists`);
  }
  const existing = Array.isArray(context.raw['variables'])
    ? (context.raw['variables'] as unknown[])
    : [];
  const value = options.label ? { id: options.id, label: options.label } : options.id;
  const next = write(text, ['variables', existing.length], value);
  return { text: next, changed: next !== text, notes: [] };
}

/**
 * Set a variable's label.
 *
 * A shorthand variable is a bare identifier and cannot carry a label, so it is
 * expanded to object form. Preservation applies to elements the author is not
 * editing; expanding the one being edited is what the edit means.
 */
export function setVariableLabel(text: string, id: string, label: string): EditResult {
  const context = read(text);
  const index = variableIndex(context, id);
  const notes: string[] = [];

  let next = text;
  if (isShorthand(context, 'variables', index)) {
    next = write(next, ['variables', index], { id, label });
    notes.push(`expanded \`${id}\` to object form so it can carry a label`);
  } else {
    next = write(next, ['variables', index, 'label'], label);
  }
  return { text: next, changed: next !== text, notes };
}

/**
 * Remove a variable and every relation naming it.
 *
 * Done as one composite operation so the document is never written in a state
 * with a dangling endpoint, even transiently.
 */
export function deleteVariable(text: string, id: string): EditResult {
  const context = read(text);
  variableIndex(context, id);

  const doomed = context.document.relations
    .map((relation, index) => ({ relation, index }))
    .filter(({ relation }) => relation.from === id || relation.to === id)
    .map(({ index }) => index)
    // Descending, so removing one does not shift the next.
    .sort((a, b) => b - a);

  let next = text;
  for (const index of doomed) next = write(next, ['relations', index], undefined);
  next = write(next, ['variables', variableIndex(read(next), id)], undefined);

  const notes =
    doomed.length > 0
      ? [`removed ${doomed.length} relation${doomed.length === 1 ? '' : 's'} naming \`${id}\``]
      : [];
  return { text: next, changed: next !== text, notes };
}

// ------------------------------------------------------------------- views

export function setViewLayoutMode(
  text: string,
  viewId: string,
  mode: 'auto' | 'manual',
): EditResult {
  const context = read(text);
  const index = context.document.views.findIndex((view) => view.id === viewId);
  if (index < 0) throw new EditError(`no view \`${viewId}\` in the document`);
  const next = write(text, ['views', index, 'layout', 'mode'], mode);
  return { text: next, changed: next !== text, notes: [] };
}

export { unchanged as noEdit };
