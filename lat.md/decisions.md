# Design Decisions

The seventeen decisions that produced this architecture, each with the alternative that was rejected. The rejections carry as much information as the choices, because they record constraints that would otherwise be rediscovered the expensive way.

The full narrative, with consequences and risk analysis, lives in the change proposal at `openspec/changes/causal-json-format/design.md`. This section is the durable record.

## D1 Universal Model Coverage

The format covers Pearl DAGs and ADMGs, PAGs, causal loop diagrams, Bayesian networks, and structural causal models.

**Why:** a format scoped to acyclic DAGs alone would need a breaking redesign the first time a systems-thinking or parameterized model had to be expressed. The union is affordable because of [[decisions#Design Decisions#D3 Layers Not Profiles]].

**Rejected:** DAG plus ADMG only — the smallest shippable scope and the only quadrant where a format was genuinely missing, but too narrow for the intended use.

## D2 Analysis Is Acyclic-Only

All profiles get schema, validation, editing, rendering, and export. Native causal reasoning covers `dag`, `admg`, and `pag` only; Bayesian-network inference and SCM simulation are delegated.

**Why:** junction-tree inference and counterfactual simulation are solver work, not format work, and `pgmpy`, `GeNIe`, and `DoWhy-GCM` already do them well. Rebuilding them would consume the whole budget for no differentiation.

**Rejected:** native analysis for all four profiles, roughly ten additional weeks with no unique value; and a Python sidecar, which would make a Python environment a hard dependency of CI and the manuscript build.

## D3 Layers Not Profiles

`profile` names only the structural class. Bayesian-network and SCM content attach as additive layers on the same variables, in one document.

**Why:** the four kinds are not siblings. A Bayes net *is* a DAG plus CPTs; an SCM *is* a DAG plus equations; an ADMG *is* a DAG plus bidirected edges. Only the causal loop diagram is a genuine fork, because it is cyclic. See [[format#CausalJSON#Structural Profiles]].

**Rejected:** exclusive profiles in separate files linked by `extends` — cleaner separation, but renaming a variable becomes a cross-file refactor and the files drift.

## D4 Shorthand With Pattern Constraints

Variables accept bare strings, relations accept arrow strings, and both accept full objects. String branches carry regex patterns in the schema.

**Why:** every established causal syntax is arrow-based — DAGitty, `dagify`, lavaan, DOT, Mermaid — and nobody hand-writes endpoint objects. Patterns keep errors legible where a schema union would not. See [[format#CausalJSON#Relations]].

**Rejected:** strict object form only, unwritable by hand; a separate compiled DSL, which raises an unanswerable "which file is the asset"; and YAML, which doubles the file-type surface.

## D5 JSON-LD Native

The format is JSON-LD from v0.1: documents carry an `@context`, terms resolve to IRIs, and the normalized document lifts to RDF.

**Why:** causal models are knowledge artifacts, and making them RDF-compatible from the start means they compose with knowledge graphs and agent memory rather than being a terminal leaf format. Retrofitting JSON-LD later is a breaking change.

**Rejected:** plain JSON with `x-` foreign members only — simpler, but extension terms would carry no semantic identity; and a fully open schema, which lets typos pass silently.

## D6 Normalize Then Expand

Arrow shorthand survives on disk. Tooling normalizes before RDF lifting, so the specification claims expandability of the *normalized* form, not the on-disk form.

**Why:** [[decisions#Design Decisions#D4 Shorthand With Pattern Constraints]] and [[decisions#Design Decisions#D5 JSON-LD Native]] collide — a bare string in a JSON-LD array is an IRI or a literal, so an arrow string would expand to nonsense. No consumer reads compact JSON-LD as RDF anyway. See [[format#CausalJSON#JSON-LD Binding]].

**Rejected:** dropping shorthand for purity at rest, which reverses D4; and two artifacts, authoring plus generated canonical, which drift.

## D7 Vocabulary Alignment

Mint `cc:` terms for causal structure; borrow RO, DCTERMS, SKOS, CiTO, and PROV-O for everything else. Alignment lives in a separate ontology, not the core context.

**Why:** no adequate causal-structure vocabulary exists, so minting is justified; a side ontology keeps the published context small and lets alignments evolve without touching an immutable artifact. See [[format#CausalJSON#JSON-LD Binding#Vocabulary Alignment]].

## D8 Views As Figure Definitions

A `views` block holds named figures — subset, status filter, layout, highlights, theme — carried as an opaque JSON literal so presentation never enters the RDF graph.

**Why:** "the diagram is not the asset" and "the book needs a dozen figures" only coexist if a figure is a query over the model rather than a drawing of it. See [[rendering#Figure Rendering#View Resolution]].

**Rejected:** inline coordinates on variables, where every drag dirties the semantic diff and only one layout is possible; a gitignorable sidecar, which stops figures being versioned with the model; and no stored layout at all, which loses pixel control.

## D9 Original Analysis Engine

d-separation, backdoor and frontdoor criteria, adjustment sets, instruments, and testable implications are implemented in TypeScript under Apache-2.0 and shipped standalone.

**Why:** dagitty is GPL-2, so vendoring it would make the format's reference implementation GPL and discourage the commercial adoption that establishes a standard. And no permissive JavaScript or TypeScript causal engine exists at all — Julia, Python, and R have one; JavaScript has none.

**Rejected:** vendoring dagitty's JavaScript, two days instead of two weeks but fatal to licensing; and shelling out to R or Python, which adds a CI dependency.

**Note:** cross-validating outputs against dagitty in R is legally clean. Only linking its code would create a derivative work.

## D10 Assertion Provenance

Relations may record status, asserter, timestamp, confidence, rationale, and evidence. Absent, a relation is author-asserted and accepted.

**Why:** without a standing marker, a document becomes untrustworthy the moment an agent touches it. Because [[decisions#Design Decisions#D6 Normalize Then Expand]] already reified relations, attaching provenance costs nothing structurally. See [[agents#Agent Integration#Assertion Review Workflow]].

**Rejected:** model-level provenance only, which cannot distinguish agent-proposed from human-vouched edges; and provenance via `x-` extensions, which makes review permanently second-class.

## D11 No Mutation API

Agents get query, lint, render, and format tools. They edit documents with ordinary file editing.

**Why:** coding agents edit JSON well and remember bespoke APIs poorly, so a mutation tool competes with a capability they already prefer. They cannot compute d-separation by reasoning — that is the real gap. See [[agents#Agent Integration#Tool Surface]].

**Rejected:** a structured mutation API, which agents would bypass; and treating the document as opaque behind an API, which contradicts the human-editable premise the design rests on.

## D12 Closed Schema With Namespaced Extensions

`additionalProperties: false` plus `patternProperties: {"^x-": true}`, with `packages` reserved for validated domain extensions. Round-trip preservation is a normative MUST.

**Why:** this resolves strict-versus-extensible entirely inside JSON Schema, so an editor's built-in `$schema` support enforces it with no bespoke code. Preservation is what makes extensibility real. See [[format#CausalJSON#Extensibility]].

## D13 Custom Text Editor With Shared Geometry

A VS Code Custom Text Editor over the JSON document, with React Flow for interaction, consuming the same layout geometry as the export emitters.

**Why:** the text document being the source keeps the JSON the asset and makes undo, side-by-side views, and version control work normally. Sharing layout rather than renderer is what stops the editor and the figure disagreeing. See [[architecture#Architecture#Shared Geometry Invariant]].

**Rejected:** using the emitter SVG as the canvas — byte-identical fidelity, but several weeks to hand-roll drag, marquee selection, edge drawing, and snapping; Sprotty, for a steep curve and its own model layer; and Cytoscape.js, canvas-based so export fidelity suffers.

**Constraint:** edits are applied as surgical text edits, never by reserialising. See [[architecture#Architecture#Preservation Invariant]].

## D14 Identity And Licensing

Format is CausalJSON with extension `.causal.json`; product is Causal Canvas; packages are `@vpavlyshyn/*`. Schema and context are hosted on a registered domain. Code is Apache-2.0, specification CC-BY-4.0.

**Why:** the format outlives the editor, so they take separate names. Apache-2.0 over MIT for the explicit patent grant, which is what makes legal departments comfortable adopting a format.

**Rejected:** a w3id.org permanent identifier — free and purpose-built, and still available as a redirect in front of the domain later; and GitHub Pages URLs, which break on a rename or transfer.

**Mitigation:** ten-year registration and static hosting, with schema and context bundled locally so nothing touches the network in CI.

## D15 Layered Severity Model

Four layers are fixed errors; causal, hygiene, and quantitative rules are configurable. Every diagnostic carries a JSON Pointer.

**Why:** the first four layers are facts and the rest are judgements, and shipping judgements as hard errors is how linters get disabled. Configurability enables a manuscript gate that would be obnoxious as a default. See [[validation#Validation#Check Layers]].

**Rejected:** one fixed rule set, which cannot express publication standards; and full configurability including structural checks, which would let meaningless documents pass.

## D16 Vertical Slice First

Build spec, schema, four hand-written models, core, layout, and one figure in the manuscript — before any canvas, analysis engine, exporter, or agent adapter.

**Why:** the most load-bearing unvalidated assumption is that this JSON is pleasant to author by hand. Everything else sits downstream of it, and it is the cheapest to falsify. See [[architecture#Architecture#Delivery Phases]].

**Rejected:** format-first without rendering, where feedback arrives late; analysis-first, which validates nothing about the format; and editor-first, which builds weeks of UI on an unproven schema.

## D17 Version Coherence

The `causal` member is authoritative; `$schema` embeds the full version; `@context` embeds the major version only.

**Why:** three independent version numbers with no stated relationship would leave the format underdetermined and permit documents whose declared version disagrees with the schema validating them. The context versions on major only because term IRIs are stable across additive revisions. See [[format#CausalJSON#Document Identity#Version Coherence]].

## Extension Decisions

Decisions specific to the VS Code surface, taken once the editor was actually written. They implement [[decisions#Design Decisions#D13 Custom Text Editor With Shared Geometry]] rather than revisiting it.

### E1 Edits Live In Their Own Package

Canvas actions become `jsonc-parser` edits applied as workspace edits, and that translation lives in `@vpavlyshyn/edits`, not in the extension.

**Why:** it is the most breakable guarantee in the product, and inside the extension it would be testable only by hand in a running editor. See [[extension#Causal Canvas extension#Surgical Edits]].

### E2 A Drag Writes A Pin, Creating A View If Needed

Dragging writes `views[active].layout.pin`. A document with no views gets one created, and the author is told.

**Why:** [[decisions#Design Decisions#D8 Views As Figure Definitions]] leaves nowhere else a coordinate may legally go, and the common case — a six-line sketch — has no views. Silent structural mutation would surprise; refusing the drag would be worse.

### E3 The Canvas Is Fed Resolved Geometry

The host resolves the view and computes layout; the webview draws what it is given.

**Why:** the canvas cannot drift from the figure if it never computes its own positions. It also keeps the schema, the layout engine, and every heavy dependency out of the webview bundle.

### E4 The Protocol Carries Intent, Not Documents

A closed union of intent messages, validated at the boundary.

**Why:** a webview that could propose document content would be a second writer, putting the preservation guarantee inside the one layer that cannot be tested headlessly.

### E5 Diagnostics Reuse The CLI's Location Machinery

Linting on change, published per document, positioned from JSON Pointers.

**Why:** the editor and the terminal must agree about where a problem is, which is the whole reason diagnostics carry pointers.

### E6 The Preview Renders The Real Emitter Output

The preview calls the same renderer the CLI does, and refuses on errors.

**Why:** D13 accepted that the canvas will not look identical to the figure and named the preview as the mitigation. That only works if the preview is the genuine artifact.

### E7 Two Bundles, CommonJS Host And Browser Webview

esbuild produces both; the webview bundle is self-contained.

**Why:** a webview has no module resolution and no network, and bundling is what lets the extension ship without runtime dependencies. See [[extension#Causal Canvas extension#Bundling]].

### E8 Schema Association Is Contributed

The extension registers the bundled schema for `**/*.causal.json`.

**Why:** a sketch that omits `$schema` should still get completion and validation.

## Open Questions

Deferred deliberately. None of these changes the architecture, so each can be answered when real use reveals the answer.

- **Domain name.** Not chosen. Blocks publishing the namespace, not building against a local schema — which is why publication is the last step of [[decisions#Design Decisions#D16 Vertical Slice First]].
- **Causal loop semantics.** `sign` and `delay` are specified; explicit loop identification, polarity computation, and any stock-and-flow distinction wait for the change that implements `cld` analysis.
- **CPT representation.** The attachment point is fixed; the internal shape — dense arrays, sparse rows, or factor tables — waits for real Bayesian-network use, since it drives file size in ways only that use reveals.
- **PAG analysis depth.** PAGs parse and render, but the generalized adjustment criterion is unimplemented. Whether renderable-but-unanalyzable PAGs help or mislead should be decided when the engine lands.
- **Model composition.** Whether one document can import another's variables, relevant if the manuscript uses a running example that grows across chapters. Additive whenever it is added.
- **Theme tokens.** The mechanism is fixed; the concrete vocabulary should be settled against real figures rather than in advance.
