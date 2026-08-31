import type { Diagnostic } from '@causal-canvas/core';

export interface FileResult {
  file: string;
  diagnostics: Diagnostic[];
}

export interface Summary {
  files: number;
  errors: number;
  warnings: number;
}

export function summarize(results: FileResult[]): Summary {
  let errors = 0;
  let warnings = 0;
  for (const result of results) {
    for (const diagnostic of result.diagnostics) {
      if (diagnostic.severity === 'error') errors++;
      else warnings++;
    }
  }
  return { files: results.length, errors, warnings };
}

/**
 * Structured output. Written to stdout with nothing interleaved, so a consumer
 * can parse it; progress text goes to stderr.
 */
export function toJson(results: FileResult[]): string {
  return (
    JSON.stringify(
      {
        results: results.map((result) => ({
          file: result.file,
          diagnostics: result.diagnostics.map((diagnostic) => ({
            rule: diagnostic.rule,
            severity: diagnostic.severity,
            layer: diagnostic.layer,
            message: diagnostic.message,
            pointer: diagnostic.pointer,
            line: diagnostic.position?.line ?? null,
            column: diagnostic.position?.column ?? null,
            fixable: diagnostic.fixable ?? false,
          })),
        })),
        summary: summarize(results),
      },
      null,
      2,
    ) + '\n'
  );
}

function pad(value: string, width: number): string {
  return value.length >= width ? value : value + ' '.repeat(width - value.length);
}

export function toText(results: FileResult[]): string {
  const lines: string[] = [];
  for (const result of results) {
    if (result.diagnostics.length === 0) continue;
    lines.push(result.file);
    for (const diagnostic of result.diagnostics) {
      const where = diagnostic.position
        ? `${diagnostic.position.line}:${diagnostic.position.column}`
        : '-';
      lines.push(
        `  ${pad(diagnostic.severity, 5)} ${pad(where, 7)} ${pad(diagnostic.rule, 34)} ${diagnostic.message}`,
      );
      lines.push(
        `  ${' '.repeat(5)} ${' '.repeat(7)} ${pad('', 34)} at ${diagnostic.pointer || '/'}`,
      );
    }
    lines.push('');
  }
  const { errors, warnings } = summarize(results);
  if (errors === 0 && warnings === 0) {
    lines.push(`No problems in ${results.length} document${results.length === 1 ? '' : 's'}.`);
  } else {
    lines.push(
      `${errors + warnings} problem${errors + warnings === 1 ? '' : 's'} (${errors} error${errors === 1 ? '' : 's'}, ${warnings} warning${warnings === 1 ? '' : 's'})`,
    );
  }
  return lines.join('\n') + '\n';
}
