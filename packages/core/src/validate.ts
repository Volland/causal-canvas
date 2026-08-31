import Ajv2020Module, { type ErrorObject, type ValidateFunction } from 'ajv/dist/2020.js';
import { FORMAT_VERSION, PROFILES, schema, type ProfileName } from '@causal-canvas/spec';
import { CausalGraph } from './graph.js';
import { resolvePointer, toSourcePointer } from './pointer.js';
import type { CanonicalDocument, Diagnostic } from './types.js';

const Ajv2020: any = (Ajv2020Module as any).default ?? Ajv2020Module;

let compiled: ValidateFunction | undefined;

function validator(): ValidateFunction {
  if (compiled) return compiled;
  const ajv = new Ajv2020({ allErrors: true, strict: false, allowUnionTypes: true });
  const fn = ajv.compile(schema) as ValidateFunction;
  compiled = fn;
  return fn;
}

function describe(error: ErrorObject): string {
  const member =
    (error.params as any)?.additionalProperty ?? (error.params as any)?.unevaluatedProperty;
  switch (error.keyword) {
    case 'unevaluatedProperties':
    case 'additionalProperties':
      return `unrecognized member \`${member}\`; extension members must be prefixed \`x-\``;
    case 'required':
      return `missing required member \`${(error.params as any).missingProperty}\``;
    case 'enum':
      return `must be one of ${((error.params as any).allowedValues as unknown[])
        .map((v) => JSON.stringify(v))
        .join(', ')}`;
    case 'pattern':
      return `does not match the required pattern ${(error.params as any).pattern}`;
    default:
      return error.message ?? error.keyword;
  }
}

/**
 * Reduce Ajv's union noise. Validation runs against the normalized document,
 * where every shorthand has already been expanded, so a failing string branch
 * of `anyOf` is never the real problem.
 */
function prune(errors: ErrorObject[], document: unknown): ErrorObject[] {
  const specific = new Set(errors.filter((e) => e.keyword !== 'anyOf').map((e) => e.instancePath));
  return errors.filter((error) => {
    if (error.keyword === 'anyOf' && specific.has(error.instancePath)) return false;
    if (error.keyword === 'type' && (error.params as any)?.type === 'string') {
      const { value } = resolvePointer(document, error.instancePath);
      if (value !== null && typeof value === 'object') return false;
    }
    return true;
  });
}

/** JSON Schema conformance. Layer 2 — always an error. */
export function validateSchema(document: CanonicalDocument, source: unknown): Diagnostic[] {
  const validate = validator();
  if (validate(document)) return [];
  return prune(validate.errors ?? [], document).map((error) => ({
    rule: `schema-${error.keyword}`,
    severity: 'error' as const,
    layer: 'schema' as const,
    message: describe(error),
    pointer: toSourcePointer(source, error.instancePath),
  }));
}

const SCHEMA_URL_VERSION = /\/schema\/(\d+\.\d+)\.json$/;
const KNOWN_VERSIONS = new Set<string>([FORMAT_VERSION]);

/**
 * Version coherence. `causal` is authoritative; `$schema` embeds the full
 * version and `@context` the major version only. See §1.1.
 */
// @lat: [[format#CausalJSON#Document Identity#Version Coherence]]
export function validateVersion(document: CanonicalDocument, source: unknown): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  const declared = document.causal;

  if (typeof declared === 'string' && !KNOWN_VERSIONS.has(declared)) {
    diagnostics.push({
      rule: 'unsupported-version',
      severity: 'error',
      layer: 'schema',
      message: `unsupported CausalJSON version \`${declared}\`; this tool implements ${[...KNOWN_VERSIONS].join(', ')}`,
      pointer: toSourcePointer(source, '/causal'),
    });
  }

  const schemaUrl = document.$schema;
  if (typeof schemaUrl === 'string' && typeof declared === 'string') {
    const match = SCHEMA_URL_VERSION.exec(schemaUrl);
    if (match && match[1] !== declared) {
      diagnostics.push({
        rule: 'version-mismatch',
        severity: 'error',
        layer: 'schema',
        message: `\`causal\` declares ${declared} but \`$schema\` embeds ${match[1]}; \`causal\` is authoritative`,
        pointer: toSourcePointer(source, '/$schema'),
      });
    }
  }
  return diagnostics;
}

/** Referential integrity. Layer 3 — always an error. */
export function validateReferences(document: CanonicalDocument, source: unknown): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  const declared = new Set<string>();

  document.variables.forEach((variable, index) => {
    if (declared.has(variable.id)) {
      diagnostics.push({
        rule: 'duplicate-variable-id',
        severity: 'error',
        layer: 'referential',
        message: `duplicate variable identifier \`${variable.id}\``,
        pointer: toSourcePointer(source, `/variables/${index}`),
      });
    }
    declared.add(variable.id);
  });

  const relationIds = new Set<string>();
  document.relations.forEach((relation, index) => {
    for (const [member, id] of [
      ['from', relation.from],
      ['to', relation.to],
    ] as const) {
      if (!declared.has(id)) {
        diagnostics.push({
          rule: 'relation-dangling-endpoint',
          severity: 'error',
          layer: 'referential',
          message: `relation \`${member}\` names \`${id}\`, which is not declared in \`variables\``,
          pointer: toSourcePointer(source, `/relations/${index}`),
        });
      }
    }
    if (relationIds.has(relation.id)) {
      diagnostics.push({
        rule: 'duplicate-relation-id',
        severity: 'error',
        layer: 'referential',
        message: `duplicate relation identifier \`${relation.id}\``,
        pointer: toSourcePointer(source, `/relations/${index}`),
      });
    }
    relationIds.add(relation.id);
  });

  const viewIds = new Set<string>();
  document.views.forEach((view, index) => {
    const base = `/views/${index}`;
    if (viewIds.has(view.id)) {
      diagnostics.push({
        rule: 'duplicate-view-id',
        severity: 'error',
        layer: 'referential',
        message: `duplicate view identifier \`${view.id}\``,
        pointer: toSourcePointer(source, base),
      });
    }
    viewIds.add(view.id);

    const check = (ids: string[] | undefined, where: string): void => {
      for (const id of ids ?? []) {
        if (!declared.has(id)) {
          diagnostics.push({
            rule: 'view-unknown-variable',
            severity: 'error',
            layer: 'referential',
            message: `view \`${view.id}\` ${where} names \`${id}\`, which is not declared in \`variables\``,
            pointer: toSourcePointer(source, base),
          });
        }
      }
    };
    if (Array.isArray(view.include)) check(view.include, '`include`');
    check(view.exclude, '`exclude`');
    check(view.highlight?.variables, '`highlight.variables`');
    check(view.layout?.pin ? Object.keys(view.layout.pin) : undefined, '`layout.pin`');

    for (const id of view.highlight?.relations ?? []) {
      if (!relationIds.has(id)) {
        diagnostics.push({
          rule: 'view-unknown-relation',
          severity: 'error',
          layer: 'referential',
          message: `view \`${view.id}\` \`highlight.relations\` names \`${id}\`, which is not a relation identifier`,
          pointer: toSourcePointer(source, base),
        });
      }
    }
  });

  return diagnostics;
}

/** Profile-gated structural legality. Layer 4 — always an error. */
// @lat: [[format#CausalJSON#Structural Profiles]]
export function validateStructure(document: CanonicalDocument, source: unknown): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  const profile = document.profile as ProfileName;
  const definition = PROFILES[profile];
  if (!definition) return diagnostics;

  const legal: readonly string[] = definition.kinds;
  document.relations.forEach((relation, index) => {
    if (!legal.includes(relation.kind)) {
      const permitted = (Object.keys(PROFILES) as ProfileName[]).filter((name) =>
        (PROFILES[name].kinds as readonly string[]).includes(relation.kind),
      );
      diagnostics.push({
        rule: 'relation-kind-illegal-for-profile',
        severity: 'error',
        layer: 'structural',
        message:
          `relation kind \`${relation.kind}\` is not permitted in profile \`${profile}\`; ` +
          `permitted in ${permitted.map((p) => `\`${p}\``).join(', ') || 'no profile'}`,
        pointer: toSourcePointer(source, `/relations/${index}`),
      });
    }
  });

  if (!definition.cycles) {
    const graph = new CausalGraph(document);
    for (const cycle of graph.findCycles()) {
      const index = document.relations.findIndex(
        (r) => r.kind === 'directed' && r.from === cycle[0] && r.to === cycle[1],
      );
      diagnostics.push({
        rule: 'directed-cycle',
        severity: 'error',
        layer: 'structural',
        message: `profile \`${profile}\` forbids directed cycles; found ${cycle.join(' -> ')}`,
        pointer: toSourcePointer(source, index >= 0 ? `/relations/${index}` : ''),
      });
    }
  }

  return diagnostics;
}
