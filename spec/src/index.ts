/**
 * Bundled CausalJSON artifacts.
 *
 * The schema and context are bundled rather than fetched so that documents
 * validate and render offline and in CI. The remote URLs are a fallback only.
 * See CausalJSON 0.1 §1.2.
 */
import schemaJson from './artifacts/schema-0.1.json' with { type: 'json' };
import contextJson from './artifacts/context-v1.json' with { type: 'json' };

export const FORMAT_VERSION = '0.1' as const;
export const SCHEMA_URL = 'https://causalcanvas.org/schema/0.1.json' as const;
export const CONTEXT_URL = 'https://causalcanvas.org/ns/v1' as const;
export const NAMESPACE = 'https://causalcanvas.org/ns/v1#' as const;
export const BASE_IRI = 'https://causalcanvas.org/model/' as const;

export const schema: Record<string, unknown> = schemaJson as Record<string, unknown>;
export const context: Record<string, unknown> = contextJson as Record<string, unknown>;

/** Profiles, and whether each permits directed cycles. */
export const PROFILES = {
  dag: { cycles: false, kinds: ['directed'] },
  admg: { cycles: false, kinds: ['directed', 'bidirected'] },
  pag: {
    cycles: false,
    kinds: ['directed', 'bidirected', 'undirected', 'partially-directed', 'nondirected'],
  },
  cld: { cycles: true, kinds: ['directed'] },
} as const;

export type ProfileName = keyof typeof PROFILES;

/** Shorthand arrow token -> canonical relation kind. */
export const ARROW_KINDS = {
  '->': 'directed',
  '<->': 'bidirected',
  '--': 'undirected',
  'o->': 'partially-directed',
  'o-o': 'nondirected',
} as const;

export type RelationKind = (typeof ARROW_KINDS)[keyof typeof ARROW_KINDS];

/** Canonical relation kind -> shorthand arrow token. */
export const KIND_ARROWS: Record<RelationKind, string> = {
  directed: '->',
  bidirected: '<->',
  undirected: '--',
  'partially-directed': 'o->',
  nondirected: 'o-o',
};

/**
 * Arrow shorthand pattern. Endpoints must be separated from the token by at
 * least one space, which is what lets identifiers contain hyphens without
 * ambiguity. See CausalJSON 0.1 §4.1.
 */
export const ARROW_PATTERN =
  /^([A-Za-z_][A-Za-z0-9_.-]*) +(<->|o->|o-o|->|--) +([A-Za-z_][A-Za-z0-9_.-]*)$/;

export const SLUG_PATTERN = /^[A-Za-z_][A-Za-z0-9_.-]*$/;

export const ASSERTION_STATUSES = ['proposed', 'accepted', 'disputed', 'rejected'] as const;
export type AssertionStatus = (typeof ASSERTION_STATUSES)[number];

/** Standing of a relation carrying no explicit assertion. See §6. */
export const DEFAULT_ASSERTION_STATUS: AssertionStatus = 'accepted';
