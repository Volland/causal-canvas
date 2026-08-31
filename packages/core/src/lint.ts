import { CausalGraph } from './graph.js';
import { parseDocument, type ParsedDocument } from './parse.js';
import { normalize } from './normalize.js';
import { positionFor } from './pointer.js';
import { RULES } from './rules.js';
import { resolveConfig, type ResolvedConfig } from './config.js';
import {
  validateReferences,
  validateSchema,
  validateStructure,
  validateVersion,
} from './validate.js';
import type { CanonicalDocument, Diagnostic } from './types.js';

export interface AnalysisOptions {
  config?: ResolvedConfig;
  /** Evaluate the configurable rule layers. `validate` sets this false. */
  rules?: boolean;
}

export interface AnalysisResult {
  parsed: ParsedDocument;
  /** Undefined when the document does not parse. */
  document?: CanonicalDocument;
  diagnostics: Diagnostic[];
  config: ResolvedConfig;
  shorthandVariables: Set<number>;
  shorthandRelations: Set<number>;
}

const SEVERITY_ORDER: Record<string, number> = { error: 0, warn: 1 };

function order(a: Diagnostic, b: Diagnostic): number {
  const bySeverity = (SEVERITY_ORDER[a.severity] ?? 9) - (SEVERITY_ORDER[b.severity] ?? 9);
  if (bySeverity !== 0) return bySeverity;
  const byLine = (a.position?.offset ?? 0) - (b.position?.offset ?? 0);
  if (byLine !== 0) return byLine;
  return a.rule.localeCompare(b.rule);
}

/**
 * Run the check pipeline.
 *
 * Layers 1-4 are facts and always error. Layers 5-7 are judgements and are
 * skipped entirely when the document does not parse or fails its schema,
 * because evaluating judgements against a malformed model produces noise.
 */
// @lat: [[validation#Validation#Check Layers]]
export function analyze(text: string, options: AnalysisOptions = {}): AnalysisResult {
  const config = options.config ?? resolveConfig(undefined);
  const parsed = parseDocument(text);
  const diagnostics: Diagnostic[] = [...parsed.diagnostics, ...config.diagnostics];

  const empty: AnalysisResult = {
    parsed,
    diagnostics,
    config,
    shorthandVariables: new Set(),
    shorthandRelations: new Set(),
  };
  if (parsed.value === undefined) return finish(empty);

  const normalized = normalize(parsed.value);
  diagnostics.push(...normalized.diagnostics);
  const document = normalized.document;
  if (!document) return finish({ ...empty, diagnostics });

  diagnostics.push(...validateSchema(document, parsed.value));
  diagnostics.push(...validateVersion(document, parsed.value));

  const blocked = diagnostics.some(
    (d) => d.severity === 'error' && (d.layer === 'syntax' || d.layer === 'schema'),
  );

  if (!blocked) {
    diagnostics.push(...validateReferences(document, parsed.value));
    diagnostics.push(...validateStructure(document, parsed.value));
  }

  const result: AnalysisResult = {
    parsed,
    document,
    diagnostics,
    config,
    shorthandVariables: normalized.shorthandVariables,
    shorthandRelations: normalized.shorthandRelations,
  };

  if (options.rules !== false && !blocked) {
    const context = {
      document,
      source: parsed.value,
      graph: new CausalGraph(document),
      shorthandVariables: result.shorthandVariables,
      shorthandRelations: result.shorthandRelations,
    };
    for (const rule of RULES) {
      const severity = config.severities[rule.id] ?? rule.defaultSeverity;
      if (severity === 'off') continue;
      // Rules that reason about paths are skipped on profiles whose structure
      // does not support it, rather than reported as failures.
      if (rule.profiles && !rule.profiles.includes(document.profile)) continue;
      for (const finding of rule.run(context)) {
        diagnostics.push({ ...finding, severity });
      }
    }
  }

  return finish(result);
}

function finish(result: AnalysisResult): AnalysisResult {
  for (const diagnostic of result.diagnostics) {
    if (diagnostic.position) continue;
    const position = positionFor(result.parsed.tree, result.parsed.text, diagnostic.pointer);
    if (position) diagnostic.position = position;
  }
  result.diagnostics.sort(order);
  return result;
}

/** Core layers only: no configurable rules. */
export function validate(text: string, options: AnalysisOptions = {}): AnalysisResult {
  return analyze(text, { ...options, rules: false });
}

/** Core layers plus the configurable rule layers. */
export function lint(text: string, options: AnalysisOptions = {}): AnalysisResult {
  return analyze(text, { ...options, rules: true });
}

export function hasErrors(diagnostics: Diagnostic[]): boolean {
  return diagnostics.some((d) => d.severity === 'error');
}
