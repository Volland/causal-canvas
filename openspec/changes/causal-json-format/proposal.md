# Proposal: CausalJSON format + Causal Canvas foundation

## Why

There is no JSON-native, schema-validated interchange format for causal models. The de facto semantic standard — DAGitty's model text — is a bespoke DSL with no extension mechanism, no versioning, no per-claim provenance, and no JSON representation. DoWhy, the most widely used causal-inference library, accepts GML and DOT, neither of which carries any causal semantics. Bayesian-network formats (XMLBIF, `.xdsl`, `.net`) carry parameters but no causal role vocabulary. Every JSON graph container (JSON Graph Format, Cytoscape JSON, GraphML) is semantically empty.

The practical consequence is that causal models are authored as pictures, reviewed as pictures, and published as pictures. Nothing is machine-checkable: you cannot lint a model for a collider being adjusted, you cannot tell which edges a human vouched for versus which an agent proposed, and you cannot regenerate a book figure when the model changes. Two adjacent gaps compound this — there is no permissively licensed JavaScript or TypeScript implementation of d-separation and adjustment-set computation (dagitty is GPL-2), and there is no VS Code extension for causal modelling at all.

This change establishes the format and the smallest end-to-end toolchain that proves it: author a model by hand, validate it, and render a publication figure into a Quarto manuscript.

## What Changes

- **New format: CausalJSON** (`.causal.json`) — a JSON-LD-native, JSON Schema-validated document format for causal models. Covers four structural profiles (`dag`, `admg`, `pag`, `cld`) with additive quantitative layers for Bayesian-network and structural-causal-model content.
- **New published artifacts at a permanent namespace** — a versioned JSON Schema and a versioned JSON-LD `@context`, both immutable once published.
- **New package `@causal/core`** — parse, shorthand normalization, JSON-LD expansion, schema validation, referential and structural checks, and a configurable lint pipeline emitting JSON Pointer-located diagnostics.
- **New package `@causal/render`** — deterministic ELK-based layout plus SVG, PDF, and PNG emitters driven by named views declared in the document.
- **New package `@causal/cli`** — `causal validate`, `causal lint`, `causal fmt`, `causal render`, `causal summarize`, with machine-readable output and CI-appropriate exit codes.
- **Conformance test suite** — a corpus of valid and invalid documents with expected diagnostics, so the format is defined by tests and not only by prose.

Not in this change, but decided and recorded in `design.md` so this change does not foreclose them: the causal analysis engine (`@causal/analysis`), the VS Code extension (`apps/vscode`), foreign-format exporters, and the MCP / VS Code Language Model Tools adapters.

## Capabilities

### New Capabilities

- `causal-json-format`: The CausalJSON document format — identity and versioning, structural profiles, variable and relation declarations with shorthand, stable relation identity, additive quantitative layers, assertion provenance, view definitions, the extensibility contract, and the JSON-LD binding.
- `model-validation`: The validation and lint pipeline — the layered severity model, diagnostic shape and location precision, configurable rule severities, causal and hygiene rules, and mechanical auto-fix.
- `figure-rendering`: Deterministic figure production — view resolution, layout with mixed automatic placement and explicit pins, theming, and emission to SVG, PDF, and PNG suitable for print.
- `causal-cli`: The command-line surface — command set, machine-readable output contract, and exit-code semantics for continuous integration.

### Modified Capabilities

None. This is a greenfield project with no existing specs.

## Impact

**New code.** A pnpm monorepo: `spec/` (format specification, JSON Schema, `@context`), `packages/core`, `packages/render`, `packages/cli`. Reserved but not created here: `packages/analysis`, `packages/mcp`, `apps/vscode`.

**New external dependencies.** `ajv` (JSON Schema 2020-12 validation), `jsonld` (expansion), `jsonc-parser` (format-preserving edits), `elkjs` (layout), `@resvg/resvg-wasm` (PNG and PDF rasterization). All permissively licensed.

**Irreversible external commitment.** Publishing the `$schema` and `@context` URLs binds every document ever created to those URLs. They must remain resolvable indefinitely and immutable once published. This requires a registered domain with long-horizon renewal and static hosting.

**Licensing.** Code under Apache-2.0 (patent grant matters for a format seeking adoption); specification text under CC-BY-4.0. Notably, the project must not link dagitty's GPL-2 JavaScript, which is why the analysis engine is scheduled as an original TypeScript implementation in a later change.

**Downstream consumers.** Quarto and Pandoc manuscripts consuming generated SVG and PDF figures; a future book build that gates on `causal lint` in CI.
