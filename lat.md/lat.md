# Causal Canvas

A VS Code extension and toolchain for authoring causal models as JSON, validating them, and rendering publication figures. The JSON document is the asset; the diagram is a projection of it.

This directory defines the high-level concepts, business logic, and architecture of this project using markdown. It is managed by [lat.md](https://www.npmjs.com/package/lat.md) — a tool that anchors source code to these definitions. Install the `lat` command with `npm i -g lat.md` and run `lat --help`.

## Map

Entry points into this knowledge graph, one per file.

- [[format]] — the CausalJSON document format: profiles, variables, relations, quantitative layers, assertion provenance, views, extensibility, and the JSON-LD binding.
- [[architecture]] — package topology, the shared data flow, the geometry and preservation invariants, and the delivery phases.
- [[validation]] — the layered check model, diagnostic shape, configurable rules, causal lints, and auto-fix boundaries.
- [[rendering]] — how a named view becomes a publication figure: pipeline, view resolution, layout, output targets, themes, determinism.
- [[cli]] — the command surface, machine-readable output contract, exit codes, and context compression.
- [[agents]] — how language models author and revise models: tool surface, self-correction loop, assertion review workflow.
- [[interop]] — ecosystem position, import and export targets, and the fidelity contract.
- [[extension]] — the VS Code surface: editor architecture, surgical edits, the scene protocol, diagnostics, preview, bundling.
- [[tests]] — the guarantees asserted in tests: the conformance corpus, format guarantees, and figure guarantees.
- [[decisions]] — the seventeen design decisions with rationale and rejected alternatives, plus the open questions.

## Naming

Two names doing two jobs, because the format is expected to outlive the editor.

- **CausalJSON** — the document format. File extension `.causal.json`.
- **Causal Canvas** — the VS Code extension.
- **`@causal-canvas/*`** — the npm packages that implement both.

Naming the format after its canvas would contradict the premise that the diagram is not the asset. See [[decisions#Design Decisions#D14 Identity And Licensing]].
