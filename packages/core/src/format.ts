import type { ParsedDocument } from './parse.js';

/**
 * Canonical formatting.
 *
 * The source value is re-emitted, not the normalized document, so the author's
 * choice of shorthand or object form survives per element. Object key order is
 * preserved by JSON parsing, which carries `x-` members and unrecognised blocks
 * through untouched, satisfying the round-trip preservation MUST in §9.1.
 *
 * Formatting is idempotent: formatting a formatted document is a no-op.
 */
// @lat: [[cli#Command Line#Formatting Guarantees]]
export function formatDocument(parsed: ParsedDocument): string {
  if (parsed.value === undefined) return parsed.text;
  return JSON.stringify(parsed.value, null, 2) + '\n';
}
