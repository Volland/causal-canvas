import { readFileSync } from 'node:fs';
import { dirname, join, parse as parsePath } from 'node:path';
import { CORE_LAYERS, type ConfigurableSeverity, type Diagnostic } from './types.js';
import { RULES } from './rules.js';

export interface CausalConfig {
  rules?: Record<string, ConfigurableSeverity>;
  themes?: Record<string, Record<string, unknown>>;
  [key: string]: unknown;
}

export interface ResolvedConfig {
  path?: string;
  severities: Record<string, ConfigurableSeverity>;
  themes: Record<string, Record<string, unknown>>;
  diagnostics: Diagnostic[];
}

export const CONFIG_FILENAME = 'causal.config.json';

/** Walk up from `startDir` looking for a project configuration file. */
export function findConfig(startDir: string): string | undefined {
  let current = startDir;
  for (;;) {
    const candidate = join(current, CONFIG_FILENAME);
    try {
      readFileSync(candidate, 'utf8');
      return candidate;
    } catch {
      // keep walking
    }
    const parent = dirname(current);
    if (parent === current || parsePath(current).root === current) return undefined;
    current = parent;
  }
}

function defaults(): Record<string, ConfigurableSeverity> {
  const severities: Record<string, ConfigurableSeverity> = {};
  for (const rule of RULES) severities[rule.id] = rule.defaultSeverity;
  return severities;
}

/**
 * Resolve rule severities.
 *
 * Core-layer checks (syntax, schema, referential, structural) are facts, not
 * judgements: attempting to reconfigure one is itself a configuration error.
 */
// @lat: [[validation#Validation#Rule Configuration]]
export function resolveConfig(config: CausalConfig | undefined, path?: string): ResolvedConfig {
  const severities = defaults();
  const diagnostics: Diagnostic[] = [];
  const known = new Map(RULES.map((rule) => [rule.id, rule]));

  for (const [id, severity] of Object.entries(config?.rules ?? {})) {
    const rule = known.get(id);
    if (!rule) {
      diagnostics.push({
        rule: 'config-unknown-rule',
        severity: 'warn',
        layer: 'hygiene',
        message: `configuration names unknown rule \`${id}\``,
        pointer: `/rules/${id}`,
      });
      continue;
    }
    if ((CORE_LAYERS as readonly string[]).includes(rule.layer)) {
      diagnostics.push({
        rule: 'config-core-rule-not-configurable',
        severity: 'error',
        layer: 'hygiene',
        message: `rule \`${id}\` is a ${rule.layer} check and may not be reconfigured`,
        pointer: `/rules/${id}`,
      });
      continue;
    }
    if (severity !== 'error' && severity !== 'warn' && severity !== 'off') {
      diagnostics.push({
        rule: 'config-invalid-severity',
        severity: 'error',
        layer: 'hygiene',
        message: `severity for \`${id}\` must be "error", "warn", or "off"`,
        pointer: `/rules/${id}`,
      });
      continue;
    }
    severities[id] = severity;
  }

  return { path, severities, themes: (config?.themes as any) ?? {}, diagnostics };
}

/** Load and resolve configuration for a document path. */
export function loadConfig(documentPath: string): ResolvedConfig {
  const path = findConfig(dirname(documentPath));
  if (!path) return resolveConfig(undefined);
  try {
    return resolveConfig(JSON.parse(readFileSync(path, 'utf8')) as CausalConfig, path);
  } catch (cause) {
    const resolved = resolveConfig(undefined, path);
    resolved.diagnostics.push({
      rule: 'config-unreadable',
      severity: 'error',
      layer: 'hygiene',
      message: `could not read ${CONFIG_FILENAME}: ${cause instanceof Error ? cause.message : String(cause)}`,
      pointer: '',
    });
    return resolved;
  }
}
