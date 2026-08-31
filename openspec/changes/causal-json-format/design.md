# Design: CausalJSON format + Causal Canvas foundation

## Context

See `proposal.md` — Why, for the motivation and the market gap.

Three constraints shape everything below.

**The JSON document is the asset, not the diagram.** Every decision that trades away file quality for editor convenience is the wrong trade. The diagram is a projection.

**The immediate consumer is a Quarto/Pandoc book.** Figures must be vector-first (SVG for HTML, PDF for print), deterministic, and regenerable from source in CI.

**Agents are first-class authors.** The format must be terse enough for a model to emit, strict enough that errors are legible, and structured enough that a human can tell an agent's proposal from their own vouched claim.

A landscape survey (recorded in `proposal.md`) established that no existing format meets these constraints, and that no permissively licensed JavaScript or TypeScript causal analysis engine exists at all.

## Goals / Non-Goals

**Goals**

- A format whose normalized form is valid JSON-LD 1.1, so models lift into RDF and knowledge-graph tooling without a bespoke mapping.
- Validation errors precise enough that an LLM can self-correct from them without re-reading the whole document.
- Figures that are versioned data (`views`), not drawings, so a model change propagates to every figure that depends on it.
- A permissive reference implementation, so commercial tools can adopt the format.

**Non-Goals**

- Competing with DAGitty, DoWhy, pgmpy, or GeNIe. The format is a hub that feeds them, not a replacement for their solvers.
- Round-trip fidelity to any foreign format. Export is lossy by construction and documented as such.
- Bayesian-network inference or structural-causal-model simulation in TypeScript. Those are delegated.
- Language bindings beyond TypeScript, until demand is demonstrated.

## Decisions

Sixteen decisions were resolved in a structured design interview, plus one (D17) resolved during capture because deferring it would have left the format specification underdetermined. Each records the alternatives that were rejected, because the rejections carry as much information as the choices.

---

### D1 — The format represents all four causal model kinds

**Decision.** CausalJSON covers Pearl DAGs and ADMGs, PAGs, causal loop diagrams, Bayesian networks, and structural causal models.

**Rationale.** A format scoped to acyclic DAGs alone would need a breaking redesign the first time a systems-thinking model or a parameterized network had to be expressed. The union is affordable because of D3 — three of the four kinds turn out to be layers, not siblings.

**Alternatives considered.** *Pearl DAG + ADMG only* — smallest shippable scope, and the only quadrant where a format is genuinely missing; rejected as too narrow for the intended use. *DAG plus causal loop diagrams* and *DAG plus a quantitative layer* — each covers half the ground and leaves the same redesign risk.

**Consequences.** The validator must dispatch on profile. Cycles are legal in exactly one profile, which means analysis (D9) cannot be profile-agnostic.

---

### D2 — Universal spec, editor, and export; native analysis is acyclic-only

**Decision.** All profiles get schema, validation, canvas editing, rendering, and export. Native causal reasoning (d-separation, backdoor and adjustment sets, collider lints) is implemented for `dag`, `admg`, and `pag` only. Bayesian-network inference and structural-causal-model simulation are delegated to existing libraries via export.

**Rationale.** Schema and validation for all four profiles is a bounded, weeks-scale effort. Junction-tree inference and counterfactual simulation are not format work — they are solver work that `pgmpy`, `GeNIe`, and `DoWhy-GCM` already do well. Rebuilding them would consume the entire budget for no differentiation.

**Alternatives considered.** *Native analysis for all four* — roughly ten additional weeks of solver work with no unique value. *A Python sidecar for analysis* — fast capability with a clean license boundary, rejected because it makes a Python environment a hard dependency of CI and the book build.

**Consequences.** A Bayesian-network document is authorable and renderable but not solvable in-tool. This is only defensible because of D3: the BN is authored on the same variables as its DAG, so the workflow is "structure first, then numbers," not "a worse GeNIe."

---

### D3 — One file; `profile` is the structural class; BN and SCM content are additive layers

**Decision.** A document declares one `profile` from `dag | admg | pag | cld`, which selects the validator. Bayesian-network and structural-causal-model content attach as optional blocks on the same variables and relations. Bulky content may be extracted with `$ref`.

**Rationale.** The four kinds are not siblings. A Bayesian network *is* a DAG plus conditional probability tables; an SCM *is* a DAG plus structural equations and noise terms; an ADMG *is* a DAG plus bidirected edges. Only the causal loop diagram is a genuine fork, because it is cyclic. Modelling this correctly collapses "four parallel formats" into one format with an acyclic/cyclic fork — roughly half the schema surface and one validator dispatch instead of four.

**Alternatives considered.** *Exclusive profiles in separate files linked by `extends`* — cleaner separation and smaller files, rejected because renaming a variable becomes a cross-file refactor and the two files drift. *Quantitative content always in a sidecar* — pristine structural diffs, rejected as always paying a two-file cost to solve a problem that only large models have; `$ref` solves it on demand.

**Consequences.** The schema is a union of every layer, so naive consumers must ignore blocks they do not understand. A bare DAG must still be about ten lines, which constrains how much of the layer machinery can be required.

---

### D4 — Shorthand union types, regex-constrained

**Decision.** `variables[]` accepts a bare string (id only) or a full object. `relations[]` accepts an arrow string or a full object. The string branches carry JSON Schema `pattern` constraints. The parser expands shorthand internally; the formatter preserves whichever form the author wrote.

**Rationale.** Every established causal syntax in the world is arrow-based — DAGitty, `dagify`, lavaan, DOT, Mermaid. Nobody hand-writes `{"from": "x", "to": "y"}`. But `oneOf` in JSON Schema produces the error `must match exactly one schema in oneOf`, which is useless to a human and destroys the agent self-correction loop that motivates the whole format. Constraining the string branch with a `pattern` means a malformed arrow reports the pattern it failed, which is legible.

**Alternatives considered.** *Strict object form only* — best possible errors and a trivial schema, rejected as unwritable by hand. *A separate terse DSL compiled to and from JSON* — best ergonomics, rejected for two parsers, two formatters, and an unanswerable "which file is the asset" question. *YAML alongside JSON* — real comments and less punctuation, rejected because the requirement is a JSON-based format and YAML doubles the file-type surface.

**Consequences.** Two code paths in the parser and a canonicalization rule that must be documented. JSON has no comments, so rationale must live in data (`rationale`, `evidence`) rather than in comments — which is better anyway, since comments are invisible to downstream consumers.

---

### D5 — JSON-LD native

**Decision.** The format is JSON-LD from v0.1. Documents carry an `@context`; terms resolve to IRIs; the normalized document lifts to RDF.

**Rationale.** Causal models are knowledge artifacts. Making them RDF-compatible from the start means they compose with knowledge graphs, agent memory stores, and ontology tooling rather than being a terminal leaf format. Retrofitting JSON-LD onto an established plain-JSON format is a breaking change.

**Alternatives considered.** *`x-` namespaced foreign members with `additionalProperties: false`* — the OpenAPI/GeoJSON pattern; catches typos while permitting extension, at the cost of no semantic identity for extension terms. *A fully open schema* — rejected outright: typos pass silently, which breaks agent self-correction.

**Consequences.** A hosted `@context` becomes a permanent obligation (D14). Strict typo-catching must be achieved through the JSON Schema layer rather than through JSON-LD, which ignores unmapped terms by design. The two validation layers are therefore complementary and both required.

---

### D6 — Normalize, then expand; relations are reified entities with stable IDs

**Decision.** Arrow shorthand survives on disk. Tooling normalizes to canonical object form before any RDF lifting. The specification states that *the normalized form* is valid JSON-LD 1.1, not the on-disk form. Relations are reified entities and MUST have stable identifiers, auto-derivable as `<from>--<kind>--<to>` when omitted.

**Rationale.** D4 and D5 collide directly: a bare string in a JSON-LD array is either an IRI reference or a literal, so `"variables": ["tar"]` is fine but `"relations": ["smoking -> tar"]` expands to a meaningless literal. The resolution is that no consumer reads compact JSON-LD as RDF anyway — every consumer runs `jsonld.expand()` first. Shorthand expansion is one more stage in a pipeline that already exists. Trading daily authoring ergonomics for purity at rest benefits nobody.

Reification is forced independently: relations carry properties (`confidence`, `rationale`, `evidence`), and a plain RDF triple has no attributes. The alternatives are RDF-star — still stabilizing, uneven tooling — or reification. Reification is what the natural JSON object shape already is, so no redesign is needed.

Stable IDs follow from reification: without them relations become blank nodes, which are poison for diffing, merging, and letting an agent address a specific edge.

**Alternatives considered.** *Drop arrow shorthand for strict JSON-LD at rest* — reverses D4. *Two artifacts, authoring plus generated canonical* — drift and an ambiguous asset story. *Shorthand for variables only* — a defensible middle path, rejected because relations are where terseness matters most.

**Consequences.** The specification must be precise that expandability is a property of the normalized form. `causal fmt` becomes load-bearing rather than cosmetic.

---

### D7 — Vocabulary reuse and alignment

**Decision.** Mint `cc:` terms for causal structure. Align them to the Relation Ontology (`RO:0002410` *causally related to*, `RO:0002418` *causally upstream of*) via `rdfs:subPropertyOf` in a separate alignment ontology, not in the core context. Reuse DCTERMS for document metadata, SKOS for labels and definitions, CiTO for citations, and PROV-O for the provenance of assertions.

**Rationale.** "As standard as possible" means not minting terms that already exist. But no adequate causal-*structure* vocabulary exists, so `cc:` core terms are justified. Alignment in a side ontology keeps the core context small and lets alignments evolve without touching an immutable published context.

**The PROV-O subtlety, stated explicitly because getting it wrong is a common modelling error.** `prov:wasGeneratedBy` is *wrong* for "smoking causes cancer" — that is not an event that happened to an entity. It is *right* for "this assertion was produced by this extraction run." PROV attaches to the assertion (D10), never to the causal claim.

**Consequences.** An alignment ontology is an additional published artifact, though not on the critical path for v0.1.

---

### D8 — `views[]` are figure definitions carried as opaque JSON

**Decision.** A `views[]` block holds named figures. Each view may subset the graph, mix automatic layout with explicit coordinate pins, declare highlights, and select a theme. `views` is typed `@type: @json` in the context, so it round-trips as an opaque JSON literal and never becomes triples.

**Rationale.** The premise "the diagram is not the main asset" and the requirement "produce a dozen book figures" are only compatible if a figure is a query over the model rather than a drawing. This buys three things inline coordinates cannot: one model with many figures (chapter 3 shows three variables, chapter 7 shows the full model) with no copy-paste and no drift on rename; highlights computed at render time, so changing the graph updates what a figure emphasizes; and clean RDF, because layout is not a causal claim.

Layout cannot be avoided entirely — causal DAGs have strong presentational conventions (exposure left, outcome right, confounders above, mediators between) that ELK and dagre reliably violate, and a book author needs pixel control. Mixing pins with automatic placement is the mode authors actually work in: pin the two variables that carry the figure's argument, let the solver place the rest, so adding a variable does not invalidate every hand-placed coordinate.

**Alternatives considered.** *Inline `x`/`y` on variables* — simplest, rejected because every node drag dirties the semantic diff and only one layout per model is possible. *A sidecar `.layout.json`* — perfect semantic diffs and gitignorable, rejected because figures should be versioned with the model they depict. *No stored layout at all* — cleanest files, rejected for loss of pixel control.

**Consequences.** Churn from dragging is confined to one block rather than eliminated. `@type: @json` requires JSON-LD 1.1.

---

### D9 — The analysis engine is an original TypeScript implementation under Apache-2.0

**Decision.** Implement d-separation, ancestry and path enumeration, the backdoor and frontdoor criteria, minimal and minimum-size adjustment sets, instrument enumeration, and testable implications as an original TypeScript package. Ship it standalone.

**Rationale.** Two verified findings force this. dagitty is GPL-2, so vendoring its JavaScript would make the *reference implementation of the format* GPL — a poor foundation for something seeking standard status, since it discourages exactly the commercial adoption that would establish it. And there is no MIT- or Apache-licensed d-separation and adjustment-set implementation in JavaScript or TypeScript at all; Julia has `CausalInference.jl`, Python has `zEpid` and `pgmpy`, R has `dagitty`, JavaScript has nothing.

The work is bounded and well-specified: d-separation is textbook Bayes-ball in linear time, and van der Zander, Liśkiewicz, and Textor give constructive algorithms for minimal and minimum-size adjustment sets. Test oracles are available and legally clean — cross-validating outputs against dagitty in R creates no derivative work; only linking its code would.

The strategic consequence is worth stating: `@causal/analysis` as the first permissive TypeScript causal engine is a larger open-source gap than the format itself. It is independently useful to anyone building causal tooling in JavaScript, and those users become the format's adopters. Shipping it standalone is a distribution strategy, not merely code organization.

**Alternatives considered.** *Vendor dagitty's JavaScript* — two days instead of two weeks, rejected on license propagation. *Shell out to R or Python* — full capability quickly with a clean boundary, rejected on the CI dependency. *Ship structure-only checks in v1* — lowest risk, rejected because it removes the differentiator and breaks D8's computed highlights.

**Consequences.** The one-to-two week estimate assumes familiarity with the literature; ADMG c-component logic and the generalized adjustment criterion for PAGs are materially harder. Mitigated by tiered delivery — d-separation, backdoor, and minimal adjustment sets cover roughly ninety percent of real use and are the easier sixty percent of the work. PAG analysis is explicitly deferred.

---

### D10 — Relations carry optional first-class assertion provenance

**Decision.** A relation may carry an `assertion` block with `status` (`proposed | accepted | disputed | rejected`), `assertedBy`, `assertedAt`, `confidence`, `rationale`, and `evidence`. Absent, it defaults to "asserted by the document's author." The block maps to PROV-O per D7.

**Rationale.** The intended workflow has an agent read literature and propose sixty edges, of which twenty-two survive review. Without a standing marker the document becomes untrustworthy the moment an agent touches it — there is no way to tell which edges the human vouched for. Because D6 already reified relations, attaching provenance costs nothing structurally.

Three concrete capabilities follow: `causal lint` gains a review gate, so a half-reviewed model cannot silently ship into a book; views can filter by standing, rendering the publication figure from accepted edges while speculative ones remain in the file; and an agent's contribution becomes a reviewable diff that flips `status` on twenty-two edges and deletes thirty-eight, rather than an opaque rewrite.

**Alternatives considered.** *Model-level provenance only* — far less ceremony, rejected because it cannot distinguish agent-proposed from human-vouched edges, which is the entire point. *Provenance via `x-` extensions* — smallest core, rejected because it makes the review workflow permanently second-class. *A full PROV-O activity graph per assertion* — maximum auditability, rejected as disproportionate structure per file; the optional block can grow into it.

**Consequences.** More verbosity per relation, and a status field authors will forget. Mitigated by the default: a simple hand-written model stays ten lines.

---

### D11 — Agents get query, lint, render, and format tools; they edit JSON directly

**Decision.** The tool surface exposes what agents cannot compute — `lint`, `validate`, `dsep`, `backdoor`, `implications`, `render`, `summarize`, `fmt`. There is no mutation API. Agents edit documents with their ordinary file-editing tools.

**Rationale.** Modern coding agents are excellent at editing JSON and poor at remembering bespoke mutation APIs. A `causal_add_relation` tool competes with a capability they already have and prefer. They are, by contrast, structurally incapable of computing d-separation or minimal adjustment sets by reasoning — that is the real gap a tool fills.

`causal fmt` is how the D12 round-trip preservation guarantee is delivered *without* a mutation API: the agent edits freely, normalization restores canonical form, and unknown extension fields and `views` survive by construction.

`causal summarize` addresses context budget. A two-hundred-node model is thousands of JSON lines and will drown an agent. Emitting the D4 arrow shorthand turns a three-thousand-line document into two hundred lines that fit in context. The format's terse surface doubles as its compression format — a designed-in property rather than a bolt-on.

**Alternatives considered.** *Query tools plus a structured mutation API* — atomic edits with guaranteed preservation, rejected as surface agents will bypass. *A full mutation API with the document treated as opaque* — strongest integrity, rejected because it contradicts the "JSON is the human-editable asset" premise the whole design rests on. *CLI only, no MCP or Language Model Tools* — simplest, rejected for loss of native discoverability; the adapters are thin once the CLI exists.

**Consequences.** Document integrity depends on validation catching bad edits rather than on preventing them. This is acceptable precisely because D15 makes diagnostics precise.

---

### D12 — Extensibility contract and round-trip preservation

**Decision.** The core JSON Schema is `additionalProperties: false` with `patternProperties: {"^x-": true}`, so typos are rejected while namespaced extensions are accepted. A `packages` keyword is reserved in v0.1 for domain extensions with their own schemas, specified but not implemented until a second domain needs it. Round-trip preservation is a specification MUST: any tool that reads and writes a document preserves every unknown `x-` member and every unrecognized block byte-identically.

**Rationale.** Strict validation and open extension pull against each other, and the OpenAPI/GeoJSON `x-` pattern resolves the tension inside JSON Schema itself, so VS Code's built-in `$schema` support enforces it with no custom code. The preservation MUST is what makes extensibility *real* rather than nominal — it is where most editors quietly fail and why people stop trusting a format.

**Consequences.** Every writer in the toolchain, including the future canvas, must use format-preserving edits (D13).

---

### D13 — VS Code editor architecture

**Decision.** A Custom Text Editor whose document is the `.causal.json` text. The interactive canvas uses React Flow (`@xyflow/react`, MIT), consuming ELK geometry shared with the export emitter. A live preview pane renders the actual publication SVG beside the canvas. Canvas edits are applied as surgical text edits via `jsonc-parser`'s `modify` and `applyEdits`.

**Rationale.** Making the text document the source keeps the JSON the asset, gives free undo/redo, allows text and canvas side by side on one file, and keeps git working normally.

Sharing *layout* rather than *renderer* is the key move: ELK computes positions once, React Flow draws interactive nodes at those positions, and the emitter draws publication SVG at the same positions. Geometry therefore never drifts between editor and figure; only styling differs, which theming and the preview pane close.

The `jsonc-parser` constraint is not an optimization. `JSON.parse` then mutate then `JSON.stringify` reformats the entire file on every node drag, destroying diffs and silently reordering keys — the single most common way custom JSON editors become unusable in git, and a direct violation of D12.

**Alternatives considered.** *The emitter SVG as the canvas* — byte-identical WYSIWYG, ideal for pixel-tuning print figures, rejected at several weeks to hand-roll drag, marquee selection, edge drawing, and snapping. *Sprotty* — SVG-native and purpose-built for VS Code diagram extensions with good fidelity, rejected on a steep learning curve and its own model layer to map onto. *Cytoscape.js* — mature, but canvas-based rather than SVG, so export fidelity is poor and interactive edge drawing is awkward.

**Consequences.** The editor will not be pixel-identical to the exported figure. Accepted, and mitigated by the preview pane.

---

### D14 — Identity, namespace, and licensing

**Decision.** The format is **CausalJSON**, file extension `.causal.json`. The VS Code product is **Causal Canvas**. Packages are `@causal/core`, `@causal/analysis`, `@causal/render`, `@causal/cli`. The `$schema` and `@context` URLs are hosted on a registered domain. Code is Apache-2.0; specification text is CC-BY-4.0.

**Rationale.** Two names doing two jobs: the format outlives the editor, and naming the format after its canvas would contradict the premise that the diagram is not the asset. The descriptive-name pattern (GeoJSON, JSON-LD, JSON Schema) makes the file extension the brand.

Apache-2.0 over MIT for near-identical permissiveness plus an explicit patent grant, which is what makes corporate legal departments comfortable adopting a format.

**Alternatives considered.** *w3id.org permanent identifier* — free, community-run, purpose-built for exactly this, and a redirect layer that permits moving hosting without invalidating files; recommended but not chosen. *Versioned GitHub Pages URLs* — rejected because a username change, repo rename, or org transfer breaks every existing file. *Inline context with no hosted namespace* — self-contained, rejected for roughly forty lines of boilerplate per file and no shared vocabulary identity.

**Consequences.** Every file ever created depends on indefinite DNS renewal. Two mitigations are adopted: register for ten years up front, and serve schema and context as static files (GitHub Pages behind a CNAME costs nothing). A `w3id` redirect can be placed in front of the domain later without breaking anything.

**Publication rules, normative.** Published URLs are immutable — a given version URL never changes meaning. Additive changes ship as revisions of the same major version; breaking changes mint a new major. Old URLs remain live indefinitely. The context and schema are bundled in the tooling with the remote as fallback, so documents validate and render offline and in CI.

---

### D15 — Layered validation with a configurable severity model

**Decision.** Four layers are always errors — syntax, schema, referential integrity, and structural legality (acyclicity where the profile requires it, edge-kind legality per profile). Three layers are configurable rules with defaults — causal, hygiene, and quantitative. Configuration lives in a repo-level `causal.config.json`. Every diagnostic carries a JSON Pointer. `causal lint --fix` handles the mechanical subset.

**Rationale.** The first four layers are facts; a document failing them is meaningless. The last three are judgements, and shipping judgements as hard errors is how linters get disabled. Configurability enables a rule that would be obnoxious as a default but is exactly right for a manuscript — failing CI when any figure contains an unreviewed or uncited edge — without inflicting it on someone sketching a DAG in two minutes.

JSON Pointers are not polish. They are what lets VS Code squiggle the precise location *and* lets an agent self-correct surgically instead of rewriting the document, which is the mechanism D11 depends on.

**Alternatives considered.** *One fixed rule set* — consistent and configuration-free, rejected because it cannot express book-publication standards. *Fully configurable including structural layers* — rejected because documents would pass linting while being semantically meaningless. *Defer causal lints entirely* — lowest risk, rejected as removing the differentiator.

**Consequences.** A configuration file format, its resolution order, and its defaults must themselves be specified.

---

### D16 — Build order: a vertical slice to a real book figure

**Decision.** Build the thinnest path touching every layer: draft specification, JSON Schema, four hand-written real models, core parse/normalize/validate, ELK layout plus SVG emitter, one figure landed in the Quarto manuscript. No canvas, no analysis engine, no exporters, no MCP. Then analysis, then canvas, then exporters, then agent adapters.

**Rationale.** The most load-bearing unvalidated assumption in the entire design is that *this JSON is pleasant to author and read by hand*. Every other decision sits downstream of it, and it is the cheapest to test — hand-write four real models and notice whether it hurts. The vertical slice also produces something immediately used, which means the format is pressure-tested by its most demanding user before anything expensive is built on it.

Analysis comes second because it unblocks both the lint differentiator and D8's computed highlights.

**Alternatives considered.** *Format-first with no rendering* — most rigorous foundation, rejected because format feedback arrives late. *Analysis engine first* — de-risks the hardest estimate and builds an audience, rejected because it validates nothing about the format; retained as a deliberate distribution play once the engine is solid. *Editor-first* — rejected as highest risk, since weeks of UI would rest on an unproven schema.

---

### D17 — Version coherence across three identifiers

**Decision.** A document carries three version-bearing fields: `causal` (the format version), the `$schema` URL, and the `@context` URL. The `causal` field is authoritative. The `$schema` URL embeds the full format version. The `@context` URL versions on major only.

**Rationale.** This was left open by the interview but had to be resolved here, because three independent version numbers with no stated relationship would leave the format specification underdetermined and would produce documents whose declared version disagrees with the schema validating them. Making one field authoritative and deriving the others removes the ambiguity. The context versions on major only because term IRIs are stable across additive revisions — minting a new context for every patch would churn every document for no semantic change.

**Consequences.** Tooling MUST verify that `causal` and the `$schema` URL agree and report a diagnostic when they do not.

---

## Format reference (v0.1 shape)

Illustrative rather than normative; the normative contract is `specs/causal-json-format/spec.md` and the published JSON Schema.

```json
{
  "$schema": "https://<domain>/schema/0.1.json",
  "@context": "https://<domain>/ns/v1",
  "causal": "0.1",
  "profile": "admg",
  "id": "smoking-cancer",

  "meta": {
    "title": "Smoking and lung cancer",
    "created": "2026-08-31",
    "license": "CC-BY-4.0"
  },

  "variables": [
    "tar",
    { "id": "smoking", "label": "Smoking", "role": "exposure",
      "type": "ordinal", "unit": "cigarettes/day" },
    { "id": "cancer", "label": "Lung cancer", "role": "outcome" },
    { "id": "genotype", "label": "Genotype", "latent": true }
  ],

  "relations": [
    "smoking -> tar",
    "tar -> cancer",
    "genotype -> smoking",
    { "id": "genotype--bidirected--cancer",
      "from": "genotype", "to": "cancer", "kind": "bidirected",
      "assertion": {
        "status": "proposed",
        "assertedBy": "claude-opus-5",
        "assertedAt": "2026-08-31",
        "confidence": 0.6,
        "rationale": "Shared susceptibility locus at 15q25",
        "evidence": ["doi:10.1038/ng.3260"]
      } }
  ],

  "views": [
    { "id": "fig-3-1",
      "include": ["smoking", "tar", "cancer"],
      "layout": { "mode": "auto", "rank": "exposure-to-outcome" },
      "theme": "book-bw" },
    { "id": "fig-3-2",
      "include": "*",
      "filter": { "assertion.status": "accepted" },
      "layout": { "mode": "auto",
                  "pin": { "smoking": [0, 0], "cancer": [400, 0] } },
      "theme": "book-bw" }
  ]
}
```

Edge kinds by profile:

| Kind | Token | `dag` | `admg` | `pag` | `cld` |
|---|---|:--:|:--:|:--:|:--:|
| directed | `->` | ✅ | ✅ | ✅ | ✅ |
| bidirected (latent confounder) | `<->` | — | ✅ | ✅ | — |
| undirected (skeleton) | `--` | — | — | ✅ | — |
| partially directed | `o->` | — | — | ✅ | — |
| nondirected | `o-o` | — | — | ✅ | — |
| cycles permitted | | ✗ | ✗ | ✗ | ✅ |

## Architecture

```
              spec/  — CausalJSON specification, JSON Schema, @context   CC-BY-4.0
                  |
   +--------------+---------------+--------------+
   |              |               |              |
 core/         analysis/       render/         cli/                     Apache-2.0
 parse         d-separation    elk layout      causal validate
 normalize     backdoor        svg / pdf       causal lint
 validate      adjustment sets png (resvg)     causal fmt
 lint          implications        |           causal render
   |                               |           causal summarize
   |                               |               |
   +---------------- one core, thin adapters ------+---> mcp/
                                                   +---> apps/vscode
                                     React Flow custom text editor
```

Layout geometry is computed once by ELK and consumed by both the interactive canvas and the export emitters, which is what guarantees that editor and figure never disagree on placement.

## Risks / Trade-offs

**Analysis engine effort is underestimated** → The one-to-two week figure assumes literature familiarity; ADMG c-component logic is materially harder. Mitigate by tiered delivery — d-separation, backdoor, and minimal adjustment sets first — and by deferring PAG analysis entirely. The vertical slice (D16) does not depend on the engine, so slippage does not block the book figure.

**A published namespace URL breaks** → Every document ever written becomes unvalidatable and un-liftable. Mitigate with ten-year registration, static hosting, bundled local copies of schema and context so offline and CI paths never touch the network, and the option of fronting the domain with a `w3id` redirect later.

**Shorthand unions degrade validation errors** → Mitigate with `pattern` constraints on every string branch and a conformance corpus that asserts on exact diagnostic text, so error quality is a tested property rather than an aspiration.

**The universal schema becomes a union of everything and hard to read** → Mitigate by keeping the core minimal and profile-gating everything else, and by publishing per-profile documentation views alongside the single schema.

**The canvas and the exported figure look different** → Accepted trade-off from D13. Mitigate by sharing ELK geometry (so layout is identical and only styling differs) and by the live preview pane.

**Round-trip preservation silently regresses** → This is the promise most likely to erode. Mitigate by making it a conformance test with fixtures containing unknown `x-` members and unrecognized blocks, run against every writer including the canvas.

**Bayesian-network authoring without inference is a worse GeNIe** → Genuinely a bet (D2). It pays off only if the network is authored on the same variables as its DAG, which D3 enables. If it does not pay off, the layer costs nothing to leave unpopulated.

**Fonts differ between the authoring machine and the print pipeline** → Any raster or PDF output destined for print must embed fonts or convert text to paths, or figures render with fallback fonts elsewhere. Configure once in the resvg pipeline and cover it with a rendering fixture.

## Migration Plan

Greenfield; no data migration. The relevant plan is the versioning discipline established in D14 and D17.

- v0.1 is published as explicitly unstable. Breaking changes are permitted within 0.x and announced in the specification changelog.
- On reaching 1.0, published `$schema` and `@context` URLs become immutable forever. Additive changes revise the same major; breaking changes mint a new major and both remain live.
- Tooling reads any `causal` version it recognizes and reports a clear diagnostic — never a parse failure — for a version it does not.
- Rollback for the vertical slice is deleting the packages; nothing external depends on them until the namespace is published, which is deliberately the last step of D16.

## Open Questions

These are deferrable: none changes the specs, the approach, or the task breakdown for this change.

1. **Domain name.** Not chosen. Blocks publishing the namespace, not building against a local schema. Task order in D16 puts publication last for exactly this reason.
2. **Causal loop diagram semantics.** `sign` and `delay` on relations are specified; explicit loop identification, loop polarity computation, and any stock-and-flow distinction are deferred to the change that implements `cld` analysis.
3. **Conditional probability table representation.** v0.1 reserves `states`, `cpt`, `equation`, and `noise` and fixes their attachment point; the internal shape (dense nested arrays versus sparse rows versus factor tables) is deferred, since it is additive and drives file size in ways only real Bayesian-network use will reveal.
4. **PAG analysis depth.** The format defines PAG edge kinds and they render, but the generalized adjustment criterion is not implemented. Whether shipping renderable-but-unanalyzable PAGs is helpful or misleading should be decided when the analysis engine lands.
5. **Model composition.** Whether one document can import another's variables — relevant if the book uses a running example that grows chapter by chapter. No v0.1 impact; adding it later is additive.
6. **Theme token set.** D8 and the rendering spec fix the *mechanism* (named themes, built-ins plus project overrides in `causal.config.json`). The concrete token vocabulary should be settled against real book figures rather than in advance.

Free consequence worth recording: because the format is JSON-LD, SKOS labels accept `@language`, so multilingual figure labels cost nothing extra if they are ever wanted.
