import type { AssertionStatus, ProfileName, RelationKind } from '@causal-canvas/spec';

export type { AssertionStatus, ProfileName, RelationKind };

export type Severity = 'error' | 'warn';
export type ConfigurableSeverity = Severity | 'off';

/**
 * Check layers. The first four are always errors and are not configurable;
 * the last three are configurable rules. See CausalJSON 0.1 and the
 * validation capability spec.
 */
export type Layer =
  'syntax' | 'schema' | 'referential' | 'structural' | 'causal' | 'hygiene' | 'quantitative';

export const CORE_LAYERS: readonly Layer[] = ['syntax', 'schema', 'referential', 'structural'];
export const CONFIGURABLE_LAYERS: readonly Layer[] = ['causal', 'hygiene', 'quantitative'];

export interface Position {
  /** 1-based line of the located element. */
  line: number;
  /** 1-based column of the located element. */
  column: number;
  offset: number;
  length: number;
}

export interface Diagnostic {
  /** Stable rule identifier, e.g. `relation-dangling-endpoint`. */
  rule: string;
  severity: Severity;
  layer: Layer;
  message: string;
  /** JSON Pointer into the source document. */
  pointer: string;
  position?: Position;
  /** True when `causalc lint --fix` can repair this mechanically. */
  fixable?: boolean;
}

export interface Assertion {
  status?: AssertionStatus;
  assertedBy?: string;
  assertedAt?: string;
  confidence?: number;
  rationale?: string;
  evidence?: string[];
  [key: string]: unknown;
}

export type VariableRole = 'exposure' | 'outcome' | 'adjusted' | 'instrument' | 'selected';
export type VariableType = 'binary' | 'categorical' | 'ordinal' | 'continuous' | 'count' | 'time';

export interface CanonicalVariable {
  id: string;
  label?: string;
  description?: string;
  role?: VariableRole;
  latent?: boolean;
  type?: VariableType;
  unit?: string;
  states?: string[];
  cpt?: unknown;
  equation?: string;
  noise?: unknown;
  [key: string]: unknown;
}

export interface CanonicalRelation {
  id: string;
  from: string;
  to: string;
  kind: RelationKind;
  label?: string;
  sign?: '+' | '-' | 'unknown';
  delay?: string | number;
  coefficient?: number;
  assertion?: Assertion;
  [key: string]: unknown;
}

export interface ViewLayout {
  mode?: 'auto' | 'manual';
  direction?: 'LR' | 'RL' | 'TB' | 'BT';
  rank?: 'none' | 'exposure-to-outcome';
  pin?: Record<string, [number, number]>;
  spacing?: { node?: number; layer?: number };
  [key: string]: unknown;
}

export interface View {
  id: string;
  title?: string;
  include?: '*' | string[];
  exclude?: string[];
  filter?: { status?: AssertionStatus | AssertionStatus[]; [key: string]: unknown };
  layout?: ViewLayout;
  highlight?: { variables?: string[]; relations?: string[]; [key: string]: unknown };
  theme?: string;
  [key: string]: unknown;
}

export interface DocumentMeta {
  title?: string;
  description?: string;
  authors?: string[];
  created?: string;
  modified?: string;
  license?: string;
  source?: string;
  [key: string]: unknown;
}

/**
 * A document after normalization: shorthand expanded, relation identifiers
 * derived. Normalization never changes causal interpretation.
 */
export interface CanonicalDocument {
  $schema?: string;
  '@context'?: unknown;
  causal: string;
  profile: ProfileName;
  id?: string;
  meta?: DocumentMeta;
  packages?: Record<string, string>;
  variables: CanonicalVariable[];
  relations: CanonicalRelation[];
  views: View[];
  [key: string]: unknown;
}
