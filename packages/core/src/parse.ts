import { parseTree, printParseErrorCode, type Node, type ParseError } from 'jsonc-parser';
import type { Diagnostic } from './types.js';

export interface ParsedDocument {
  text: string;
  /** Syntax tree, retained so writers can make surgical edits (§9.1). */
  tree: Node | undefined;
  /** The parsed JSON value, or undefined when the text does not parse. */
  value: unknown;
  diagnostics: Diagnostic[];
}

function lineOf(text: string, offset: number): { line: number; column: number } {
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

/**
 * Parse a CausalJSON document.
 *
 * CausalJSON is strict JSON: comments and trailing commas are syntax errors,
 * because a document must be readable by any JSON parser in any language.
 * Rationale for keeping prose in data rather than comments is in §4/§6.
 */
export function parseDocument(text: string): ParsedDocument {
  const errors: ParseError[] = [];
  const tree = parseTree(text, errors, {
    disallowComments: true,
    allowTrailingComma: false,
    allowEmptyContent: false,
  });

  const diagnostics: Diagnostic[] = errors.map((error) => {
    const { line, column } = lineOf(text, error.offset);
    return {
      rule: 'json-syntax',
      severity: 'error' as const,
      layer: 'syntax' as const,
      message: `${printParseErrorCode(error.error)} at line ${line}, column ${column}`,
      pointer: '',
      position: { line, column, offset: error.offset, length: error.length },
    };
  });

  let value: unknown;
  if (diagnostics.length === 0 && tree) {
    try {
      value = JSON.parse(text);
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : String(cause);
      diagnostics.push({
        rule: 'json-syntax',
        severity: 'error',
        layer: 'syntax',
        message,
        pointer: '',
      });
    }
  }

  return { text, tree, value, diagnostics };
}
