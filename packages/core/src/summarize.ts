import { KIND_ARROWS } from '@vpavlyshyn/spec';
import type { CanonicalDocument } from './types.js';

export interface SummarizeOptions {
  /** Include role, latency, and assertion annotations. Defaults to true. */
  annotations?: boolean;
}

/**
 * Emit a document's structure in the format's own arrow shorthand.
 *
 * A large model is thousands of JSON lines and will exhaust an agent's context;
 * the terse authoring surface therefore doubles as the compression format. The
 * output re-parses as a valid model with the same variables and relations.
 */
// @lat: [[cli#Command Line#Context Compression]]
export function summarize(document: CanonicalDocument, options: SummarizeOptions = {}): string {
  const annotate = options.annotations !== false;
  const lines: string[] = [];
  lines.push(`profile: ${document.profile}`);
  if (document.meta?.title) lines.push(`title: ${document.meta.title}`);
  lines.push('');

  const annotations = new Map<string, string[]>();
  if (annotate) {
    for (const variable of document.variables) {
      const marks: string[] = [];
      if (variable.role) marks.push(variable.role);
      if (variable.latent) marks.push('latent');
      if (marks.length > 0) annotations.set(variable.id, marks);
    }
  }

  const decorate = (id: string): string => {
    const marks = annotations.get(id);
    return marks ? `${id} [${marks.join(',')}]` : id;
  };

  const connected = new Set<string>();
  for (const relation of document.relations) {
    connected.add(relation.from);
    connected.add(relation.to);
    const arrow = KIND_ARROWS[relation.kind] ?? '->';
    let line = `${decorate(relation.from)} ${arrow} ${decorate(relation.to)}`;
    if (annotate) {
      const status = relation.assertion?.status;
      const extras: string[] = [];
      if (status && status !== 'accepted') extras.push(status);
      if (typeof relation.assertion?.confidence === 'number') {
        extras.push(`confidence ${relation.assertion.confidence}`);
      }
      if (relation.sign) extras.push(`sign ${relation.sign}`);
      if (extras.length > 0) line += `  # ${extras.join(', ')}`;
    }
    lines.push(line);
  }

  const isolated = document.variables.filter((v) => !connected.has(v.id));
  if (isolated.length > 0) {
    lines.push('');
    for (const variable of isolated) lines.push(decorate(variable.id));
  }

  return lines.join('\n') + '\n';
}
