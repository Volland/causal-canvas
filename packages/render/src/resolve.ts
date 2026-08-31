import { DEFAULT_ASSERTION_STATUS } from '@vpavlyshyn/spec';
import type {
  CanonicalDocument,
  CanonicalRelation,
  CanonicalVariable,
  View,
} from '@vpavlyshyn/core';

export class UnknownViewError extends Error {
  constructor(
    readonly requested: string,
    readonly available: string[],
  ) {
    super(
      available.length === 0
        ? `document declares no views, so \`${requested}\` cannot be rendered`
        : `unknown view \`${requested}\`; the document declares ${available.map((n) => `\`${n}\``).join(', ')}`,
    );
    this.name = 'UnknownViewError';
  }
}

export interface ResolvedView {
  view: View;
  variables: CanonicalVariable[];
  relations: CanonicalRelation[];
  highlightedVariables: Set<string>;
  highlightedRelations: Set<string>;
}

/** The implicit whole-model view, used when a document declares none. */
export const DEFAULT_VIEW: View = { id: 'default' };

export function findView(document: CanonicalDocument, id?: string): View {
  if (id === undefined) return document.views[0] ?? DEFAULT_VIEW;
  const found = document.views.find((view) => view.id === id);
  if (!found)
    throw new UnknownViewError(
      id,
      document.views.map((v) => v.id),
    );
  return found;
}

/**
 * Apply a view in fixed order: subset, then assertion-status filter, then
 * highlights. A relation survives only when both of its endpoints do.
 *
 * Views never affect causal interpretation — this only selects what is drawn.
 */
// @lat: [[rendering#Figure Rendering#View Resolution]]
export function resolveView(document: CanonicalDocument, view: View): ResolvedView {
  const included = new Set(
    Array.isArray(view.include) ? view.include : document.variables.map((v) => v.id),
  );
  for (const id of view.exclude ?? []) included.delete(id);

  const variables = document.variables.filter((variable) => included.has(variable.id));

  const wanted = view.filter?.status;
  const statuses =
    wanted === undefined ? undefined : new Set(Array.isArray(wanted) ? wanted : [wanted]);

  const relations = document.relations.filter((relation) => {
    if (!included.has(relation.from) || !included.has(relation.to)) return false;
    if (!statuses) return true;
    return statuses.has(relation.assertion?.status ?? DEFAULT_ASSERTION_STATUS);
  });

  return {
    view,
    variables,
    relations,
    highlightedVariables: new Set(view.highlight?.variables ?? []),
    highlightedRelations: new Set(view.highlight?.relations ?? []),
  };
}
