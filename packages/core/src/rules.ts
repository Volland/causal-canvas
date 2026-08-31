import { DEFAULT_ASSERTION_STATUS } from '@causal/spec';
import { CausalGraph } from './graph.js';
import { toSourcePointer } from './pointer.js';
import type {
  CanonicalDocument,
  ConfigurableSeverity,
  Diagnostic,
  Layer,
  ProfileName,
} from './types.js';

/** Profiles whose structure supports path-level causal reasoning. */
const ACYCLIC: readonly ProfileName[] = ['dag', 'admg', 'pag'];

export interface RuleContext {
  document: CanonicalDocument;
  source: unknown;
  graph: CausalGraph;
  /** Indices of entries the author wrote in shorthand. */
  shorthandVariables: Set<number>;
  shorthandRelations: Set<number>;
}

export type RuleFinding = Omit<Diagnostic, 'severity'>;

export interface Rule {
  id: string;
  layer: Layer;
  defaultSeverity: ConfigurableSeverity;
  description: string;
  /** Profiles this rule applies to. Omitted means every profile. */
  profiles?: readonly ProfileName[];
  run(context: RuleContext): RuleFinding[];
}

const pointer = (context: RuleContext, path: string): string =>
  toSourcePointer(context.source, path);

// ---------------------------------------------------------------- causal ---

const colliderAdjustment: Rule = {
  id: 'collider-adjustment',
  layer: 'causal',
  profiles: ACYCLIC,
  defaultSeverity: 'error',
  description:
    'A variable declared `adjusted` is a collider, or a descendant of a collider, on a path between the exposure and the outcome. Conditioning on it opens a spurious path.',
  run({ document, graph, ...rest }) {
    const context = { document, graph, ...rest } as RuleContext;
    const exposures = graph.variablesWithRole(document, 'exposure');
    const outcomes = graph.variablesWithRole(document, 'outcome');
    if (exposures.length === 0 || outcomes.length === 0) return [];

    const findings: RuleFinding[] = [];
    document.variables.forEach((variable, index) => {
      if (variable.role !== 'adjusted') return;
      for (const exposure of exposures) {
        for (const outcome of outcomes) {
          for (const path of graph.simplePaths(exposure, outcome)) {
            for (const node of path) {
              if (!graph.isColliderOn(path, node)) continue;
              const opensDirectly = node === variable.id;
              const opensViaDescendant = !opensDirectly && graph.descendants(node).has(variable.id);
              if (!opensDirectly && !opensViaDescendant) continue;
              findings.push({
                rule: colliderAdjustment.id,
                layer: 'causal',
                message: opensDirectly
                  ? `adjusting for \`${variable.id}\` conditions on a collider on the path ${path.join(' - ')}, which opens it`
                  : `adjusting for \`${variable.id}\` conditions on a descendant of the collider \`${node}\` on the path ${path.join(' - ')}, which opens it`,
                pointer: pointer(context, `/variables/${index}`),
              });
              return;
            }
          }
        }
      }
    });
    return findings;
  },
};

const noUnblockedPath: Rule = {
  id: 'no-causal-path',
  layer: 'causal',
  profiles: ACYCLIC,
  defaultSeverity: 'warn',
  description:
    'The declared exposure has no directed path to the declared outcome, so there is no causal effect to identify.',
  run(context) {
    const { document, graph } = context;
    const exposures = graph.variablesWithRole(document, 'exposure');
    const outcomes = graph.variablesWithRole(document, 'outcome');
    const findings: RuleFinding[] = [];
    for (const exposure of exposures) {
      for (const outcome of outcomes) {
        if (graph.hasDirectedPath(exposure, outcome)) continue;
        const index = document.variables.findIndex((v) => v.id === exposure);
        findings.push({
          rule: noUnblockedPath.id,
          layer: 'causal',
          message: `no directed path from exposure \`${exposure}\` to outcome \`${outcome}\``,
          pointer: pointer(context, `/variables/${index}`),
        });
      }
    }
    return findings;
  },
};

const invalidInstrument: Rule = {
  id: 'invalid-instrument',
  layer: 'causal',
  profiles: ACYCLIC,
  defaultSeverity: 'error',
  description:
    'A variable declared `instrument` has a directed path to the outcome that does not pass through the exposure, violating the exclusion restriction.',
  run(context) {
    const { document, graph } = context;
    const exposures = new Set(graph.variablesWithRole(document, 'exposure'));
    const outcomes = graph.variablesWithRole(document, 'outcome');
    if (exposures.size === 0 || outcomes.length === 0) return [];

    const findings: RuleFinding[] = [];
    document.variables.forEach((variable, index) => {
      if (variable.role !== 'instrument') return;
      // Reachability with every exposure removed: anything still reachable is
      // a path that bypasses the exposure.
      const reachable = new Set<string>();
      const stack = graph.childrenOf(variable.id).filter((id) => !exposures.has(id));
      while (stack.length > 0) {
        const next = stack.pop() as string;
        if (reachable.has(next)) continue;
        reachable.add(next);
        stack.push(...graph.childrenOf(next).filter((id) => !exposures.has(id)));
      }
      for (const outcome of outcomes) {
        if (!reachable.has(outcome)) continue;
        findings.push({
          rule: invalidInstrument.id,
          layer: 'causal',
          message: `instrument \`${variable.id}\` has a directed path to outcome \`${outcome}\` that bypasses the exposure, violating the exclusion restriction`,
          pointer: pointer(context, `/variables/${index}`),
        });
      }
    });
    return findings;
  },
};

const latentUnderdetermined: Rule = {
  id: 'latent-underdetermined',
  layer: 'causal',
  profiles: ACYCLIC,
  defaultSeverity: 'warn',
  description:
    'A latent variable with fewer than two children cannot be identified from observed data.',
  run(context) {
    const { document, graph } = context;
    const findings: RuleFinding[] = [];
    document.variables.forEach((variable, index) => {
      if (!variable.latent) return;
      const children = graph.childrenOf(variable.id).length;
      if (children >= 2) return;
      findings.push({
        rule: latentUnderdetermined.id,
        layer: 'causal',
        message: `latent variable \`${variable.id}\` has ${children} ${children === 1 ? 'child' : 'children'}; at least two are needed for it to be identifiable`,
        pointer: pointer(context, `/variables/${index}`),
      });
    });
    return findings;
  },
};

// --------------------------------------------------------------- hygiene ---

const missingLabel: Rule = {
  id: 'missing-label',
  layer: 'hygiene',
  defaultSeverity: 'off',
  description: 'A variable has no display label, so figures fall back to its identifier.',
  run(context) {
    const findings: RuleFinding[] = [];
    context.document.variables.forEach((variable, index) => {
      if (typeof variable.label === 'string' && variable.label.length > 0) return;
      findings.push({
        rule: missingLabel.id,
        layer: 'hygiene',
        message: `variable \`${variable.id}\` has no \`label\``,
        pointer: pointer(context, `/variables/${index}`),
        fixable: !context.shorthandVariables.has(index),
      });
    });
    return findings;
  },
};

const relationMissingId: Rule = {
  id: 'relation-missing-id',
  layer: 'hygiene',
  defaultSeverity: 'off',
  description:
    'A relation has no explicit `id`. Derived identifiers are deterministic, so this is optional; enable it when identifiers must stay stable across endpoint renames.',
  run(context) {
    const findings: RuleFinding[] = [];
    const raw = (context.source as any)?.relations;
    context.document.relations.forEach((relation, index) => {
      const entry = Array.isArray(raw) ? raw[index] : undefined;
      const hasExplicit =
        entry !== null && typeof entry === 'object' && typeof entry.id === 'string';
      if (hasExplicit) return;
      findings.push({
        rule: relationMissingId.id,
        layer: 'hygiene',
        message: `relation \`${relation.id}\` has no explicit \`id\``,
        pointer: pointer(context, `/relations/${index}`),
        fixable: !context.shorthandRelations.has(index),
      });
    });
    return findings;
  },
};

const assertionReviewed: Rule = {
  id: 'assertion-reviewed',
  layer: 'hygiene',
  defaultSeverity: 'warn',
  description:
    'A relation is still `proposed` or `disputed`. Set this to `error` to keep unreviewed claims out of published figures.',
  run(context) {
    const findings: RuleFinding[] = [];
    context.document.relations.forEach((relation, index) => {
      const status = relation.assertion?.status ?? DEFAULT_ASSERTION_STATUS;
      if (status === 'accepted' || status === 'rejected') return;
      findings.push({
        rule: assertionReviewed.id,
        layer: 'hygiene',
        message: `relation \`${relation.id}\` is \`${status}\` and has not been reviewed`,
        pointer: pointer(context, `/relations/${index}`),
      });
    });
    return findings;
  },
};

const relationHasRationale: Rule = {
  id: 'relation-has-rationale',
  layer: 'hygiene',
  defaultSeverity: 'off',
  description: 'A relation asserts a causal claim without recording why.',
  run(context) {
    const findings: RuleFinding[] = [];
    context.document.relations.forEach((relation, index) => {
      if (typeof relation.assertion?.rationale === 'string') return;
      findings.push({
        rule: relationHasRationale.id,
        layer: 'hygiene',
        message: `relation \`${relation.id}\` has no \`assertion.rationale\``,
        pointer: pointer(context, `/relations/${index}`),
      });
    });
    return findings;
  },
};

const relationHasEvidence: Rule = {
  id: 'relation-has-evidence',
  layer: 'hygiene',
  defaultSeverity: 'off',
  description:
    'A relation cites no evidence. Set this to `error` for a manuscript where every claim must be cited.',
  run(context) {
    const findings: RuleFinding[] = [];
    context.document.relations.forEach((relation, index) => {
      if ((relation.assertion?.evidence ?? []).length > 0) return;
      findings.push({
        rule: relationHasEvidence.id,
        layer: 'hygiene',
        message: `relation \`${relation.id}\` cites no \`assertion.evidence\``,
        pointer: pointer(context, `/relations/${index}`),
      });
    });
    return findings;
  },
};

const orphanVariable: Rule = {
  id: 'orphan-variable',
  layer: 'hygiene',
  defaultSeverity: 'warn',
  description: 'A variable participates in no relation, so it says nothing about the model.',
  run(context) {
    const used = new Set<string>();
    for (const relation of context.document.relations) {
      used.add(relation.from);
      used.add(relation.to);
    }
    const findings: RuleFinding[] = [];
    context.document.variables.forEach((variable, index) => {
      if (used.has(variable.id)) return;
      findings.push({
        rule: orphanVariable.id,
        layer: 'hygiene',
        message: `variable \`${variable.id}\` participates in no relation`,
        pointer: pointer(context, `/variables/${index}`),
      });
    });
    return findings;
  },
};

const unusedView: Rule = {
  id: 'unused-view',
  layer: 'hygiene',
  defaultSeverity: 'off',
  description: 'A view resolves to an empty figure.',
  run(context) {
    const findings: RuleFinding[] = [];
    context.document.views.forEach((view, index) => {
      const included = Array.isArray(view.include)
        ? view.include.length
        : context.document.variables.length;
      if (included > 0) return;
      findings.push({
        rule: unusedView.id,
        layer: 'hygiene',
        message: `view \`${view.id}\` resolves to an empty figure`,
        pointer: pointer(context, `/views/${index}`),
      });
    });
    return findings;
  },
};

// ---------------------------------------------------------- quantitative ---

const cptRequiresStates: Rule = {
  id: 'cpt-requires-states',
  layer: 'quantitative',
  defaultSeverity: 'warn',
  description:
    'A variable carries a conditional probability table but declares no `states`, so the table has no index.',
  run(context) {
    const findings: RuleFinding[] = [];
    context.document.variables.forEach((variable, index) => {
      if (variable.cpt === undefined || Array.isArray(variable.states)) return;
      findings.push({
        rule: cptRequiresStates.id,
        layer: 'quantitative',
        message: `variable \`${variable.id}\` has a \`cpt\` but no \`states\``,
        pointer: pointer(context, `/variables/${index}`),
      });
    });
    return findings;
  },
};

const IDENTIFIER = /[A-Za-z_][A-Za-z0-9_.-]*/g;
const EQUATION_BUILTINS = new Set([
  'exp',
  'log',
  'sqrt',
  'abs',
  'min',
  'max',
  'sin',
  'cos',
  'tan',
  'pow',
  'e',
  'pi',
]);

const equationVariablesBound: Rule = {
  id: 'equation-variables-bound',
  layer: 'quantitative',
  defaultSeverity: 'warn',
  description:
    'A structural equation names an identifier that is neither a declared variable, the noise term, nor a known function.',
  run(context) {
    const declared = new Set(context.document.variables.map((v) => v.id));
    const findings: RuleFinding[] = [];
    context.document.variables.forEach((variable, index) => {
      if (typeof variable.equation !== 'string') return;
      const noise = typeof variable.noise === 'string' ? variable.noise : 'eps';
      for (const token of variable.equation.match(IDENTIFIER) ?? []) {
        if (declared.has(token) || EQUATION_BUILTINS.has(token) || token === noise) continue;
        findings.push({
          rule: equationVariablesBound.id,
          layer: 'quantitative',
          message: `equation for \`${variable.id}\` names \`${token}\`, which is not a declared variable`,
          pointer: pointer(context, `/variables/${index}`),
        });
      }
    });
    return findings;
  },
};

const statesMatchType: Rule = {
  id: 'states-match-type',
  layer: 'quantitative',
  defaultSeverity: 'warn',
  description:
    'A variable declares a state space inconsistent with its declared type, for example a `binary` variable with three states.',
  run(context) {
    const findings: RuleFinding[] = [];
    context.document.variables.forEach((variable, index) => {
      const states = variable.states;
      if (!Array.isArray(states)) return;
      if (variable.type === 'binary' && states.length !== 2) {
        findings.push({
          rule: statesMatchType.id,
          layer: 'quantitative',
          message: `variable \`${variable.id}\` is typed \`binary\` but declares ${states.length} states`,
          pointer: pointer(context, `/variables/${index}`),
        });
      }
      if (variable.type === 'continuous' || variable.type === 'time') {
        findings.push({
          rule: statesMatchType.id,
          layer: 'quantitative',
          message: `variable \`${variable.id}\` is typed \`${variable.type}\` and cannot have a discrete state space`,
          pointer: pointer(context, `/variables/${index}`),
        });
      }
      if (new Set(states).size !== states.length) {
        findings.push({
          rule: statesMatchType.id,
          layer: 'quantitative',
          message: `variable \`${variable.id}\` declares duplicate states`,
          pointer: pointer(context, `/variables/${index}`),
        });
      }
    });
    return findings;
  },
};

export const RULES: readonly Rule[] = [
  colliderAdjustment,
  noUnblockedPath,
  invalidInstrument,
  latentUnderdetermined,
  missingLabel,
  relationMissingId,
  assertionReviewed,
  relationHasRationale,
  relationHasEvidence,
  orphanVariable,
  unusedView,
  cptRequiresStates,
  equationVariablesBound,
  statesMatchType,
];
