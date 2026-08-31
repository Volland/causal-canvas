# Validation

Layered checks over a [[format#CausalJSON|CausalJSON]] document, reported as located diagnostics. The design goal is precision: an error must be specific enough that a person or a model can correct it without re-reading the document.

## Check Layers

Seven layers, split into a fixed error core and a configurable remainder. The split is not arbitrary — the first four are facts, the last three are judgements, and shipping judgements as hard errors is how linters get disabled.

```
  1  SYNTAX        document parses                              --+
  2  SCHEMA        types, enums, patterns, unknown members        |  always
  3  REFERENTIAL   dangling endpoints, duplicate ids,             |  errors,
                   unknown view targets                           |  never
  4  STRUCTURAL    profile-gated acyclicity,                      |  config-
                   profile-gated edge-kind legality             --+  urable
  ------------------------------------------------------------
  5  CAUSAL        collider adjustment, no unblocked path,      --+
                   invalid instrument, unidentifiable latent      |  config-
  6  HYGIENE       missing label, no rationale, unreviewed        |  urable
                   assertion, orphan variable, unused view        |  rules
  7  QUANTITATIVE  CPT rows sum to 1, equation vars bound       --+
```

[[packages/core/src/lint.ts#analyze]] runs the pipeline; the rule registry is [[packages/core/src/rules.ts#RULES]].

A document failing layers 1 through 4 is meaningless, so configurable rules are not evaluated against it. Attempting to reconfigure a core-layer check is itself a configuration error.

## Diagnostics

Every diagnostic carries a stable rule identifier, a severity, a human-readable message, and a JSON Pointer locating the offending element.

```
  rule:     assertion-reviewed
  severity: error
  message:  relation is still `proposed` and cannot ship to print
  pointer:  /relations/7/assertion/status
```

Pointer precision is not polish. It is what lets an editor squiggle the exact member and what lets an agent correct one field instead of rewriting the document — the mechanism [[agents#Agent Integration#Self-Correction Loop]] depends on.

## Rule Configuration

Configurable rules take `error`, `warn`, or `off` in a project-level `causal.config.json`, resolved by [[packages/core/src/config.ts#resolveConfig]]. Every rule has a documented default that applies when no configuration exists.

```jsonc
{ "rules": {
    "assertion-reviewed":    "error",   // no proposed edges ship to print
    "relation-has-evidence": "error",   // every claim cited
    "collider-adjustment":   "error",
    "orphan-variable":       "warn",
    "missing-label":         "off"
} }
```

This exists to serve a rule that would be obnoxious as a default but is exactly right for a manuscript: failing the build when any figure contains an unreviewed or uncited edge. Making it universal would make the tool insufferable for someone sketching a model in two minutes.

## Causal Rules

Modelling errors that schema and structural checks cannot see, because detecting them requires reasoning about paths rather than about syntax.

- **Collider adjustment** — a variable declared as adjusted is a collider on a path between exposure and outcome, opening a spurious path.
- **No unblocked causal path** — a declared exposure has no open causal path to the declared outcome.
- **Invalid instrument** — a declared instrument has a directed path to the outcome not passing through the exposure, violating the exclusion restriction.
- **Unidentifiable latent** — a latent variable with fewer than two children.

These are the differentiator: a causal-inference reviewer living in the editor. They depend on the [[decisions#Design Decisions#D9 Original Analysis Engine|analysis engine]] and are skipped rather than failed on profiles that do not support them.

## Auto-fix Boundaries

[[packages/core/src/fix.ts#fix]] repairs mechanical problems only, and the boundary is enforced rather than conventional.

Fixable: deriving absent relation identifiers, deriving absent labels from identifiers, normalizing shorthand to canonical form. Never fixable: causal structure, assertion status, and any `x-` member. A rule that encodes a judgement is never auto-resolved — silently flipping `proposed` to `accepted` would defeat the entire point of [[format#CausalJSON#Assertion Provenance|assertion provenance]].
