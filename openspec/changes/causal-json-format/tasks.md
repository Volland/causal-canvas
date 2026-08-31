# Tasks

Ordered per design decision D16: the vertical slice validates the riskiest assumption — that this JSON is pleasant to author by hand — before anything expensive is built on it. Group 3 is that test; if it fails, stop and revise the specification before continuing.

## 1. Repository and toolchain

- [x] 1.1 Initialize the pnpm monorepo with `spec/`, `packages/core`, `packages/render`, `packages/cli` workspaces
- [x] 1.2 Configure TypeScript, linting, formatting, and a test runner shared across packages
- [x] 1.3 Add Apache-2.0 license to code packages and CC-BY-4.0 to `spec/`
- [x] 1.4 Set up continuous integration running build, tests, and the conformance suite

## 2. Specification and schema

- [x] 2.1 Write the CausalJSON v0.1 specification document in `spec/` covering identity, profiles, variables, relations, layers, assertions, views, and the extensibility contract
- [x] 2.2 Author the JSON Schema (2020-12) with `additionalProperties: false` plus `patternProperties: {"^x-": true}`
- [x] 2.3 Add pattern constraints to every shorthand string branch so union failures report the expected form rather than a generic union error
- [x] 2.4 Author the JSON-LD `@context`, typing `views` as `@type: @json` and mapping relations as reified entities
- [x] 2.5 Document the profile/edge-kind legality matrix and the version-coherence rule from D17
- [x] 2.6 Publish schema and context as local files bundled into the tooling, with the remote URL structure defined but not yet live

## 3. Dogfooding — the format risk test

- [x] 3.1 Hand-write four real causal models from the book, without tooling assistance, using only the specification
- [x] 3.2 Record every point of friction encountered while authoring
- [x] 3.3 Revise the specification and schema against that friction before proceeding
- [x] 3.4 Confirm a minimal three-variable model is expressible in roughly ten lines

## 4. Core — parse, normalize, validate

- [x] 4.1 Implement the document parser with position tracking sufficient to produce JSON Pointer locations
- [x] 4.2 Implement shorthand normalization for variables and relations, preserving the author's chosen form for round-tripping
- [x] 4.3 Implement deterministic relation identifier derivation from endpoints and kind
- [x] 4.4 Wire JSON Schema validation and map schema errors to located diagnostics
- [x] 4.5 Implement referential integrity checks: dangling endpoints, duplicate identifiers, unknown view targets
- [x] 4.6 Implement structural checks: profile-gated edge-kind legality and profile-gated acyclicity with cycle reporting
- [x] 4.7 Implement version-coherence checking between `causal` and the `$schema` URL
- [x] 4.8 Implement JSON-LD expansion of the normalized document and verify `views` produces no triples

## 5. Core — lint pipeline and configuration

- [x] 5.1 Define the diagnostic shape: rule identifier, severity, message, JSON Pointer
- [x] 5.2 Implement the rule registry with documented default severities
- [x] 5.3 Implement `causal.config.json` resolution and reject attempts to reconfigure core-layer checks
- [x] 5.4 Implement hygiene rules: missing label, relation without rationale, unreviewed assertion, orphan variable, unused view
- [x] 5.5 Implement the mechanical auto-fix mode and prove it never alters causal structure, assertion status, or `x-` members
- [ ] 5.6 Defer causal rules (collider adjustment, unblocked path, invalid instrument) to the analysis change; register them as known-unimplemented so configuration referencing them does not error

  > **Superseded, not done.** This task defers behaviour that
  > `specs/model-validation/spec.md` requires ("Causal rules detect inference
  > errors", with scenarios). The rules were implemented instead:
  > `collider-adjustment`, `no-causal-path`, `invalid-instrument`, and
  > `latent-underdetermined`, backed by a minimal `CausalGraph` in
  > `@causal/core` and gated to acyclic profiles. The full analysis engine
  > (`@causal/analysis`: d-separation API, minimal adjustment sets, testable
  > implications) remains a later change as planned. Awaiting a decision on
  > whether to amend this task's text.

## 6. Render — layout and emitters

- [x] 6.1 Integrate ELK for layout, honouring explicit pins alongside automatic placement
- [x] 6.2 Implement view resolution: element subset, assertion-status filter, explicit highlight lists
- [x] 6.3 Implement the SVG emitter from computed geometry, with stable element identifiers
- [x] 6.4 Implement PDF and PNG emission from the SVG output, with font embedding or text-to-outline conversion
- [x] 6.5 Implement the named theme system with built-ins and project overrides, including a `book-bw` theme
- [x] 6.6 Prove determinism: identical bytes across repeated renders and across machines

## 7. CLI

- [x] 7.1 Implement `causal validate`, `causal lint`, `causal fmt`, `causal render`, `causal summarize`
- [x] 7.2 Implement structured output mode, keeping progress text on standard error
- [x] 7.3 Implement exit-code semantics including the treat-warnings-as-errors flag
- [x] 7.4 Prove `causal fmt` is idempotent and preserves `x-` members, unrecognized blocks, and views

## 8. Conformance suite

- [x] 8.1 Build a corpus of valid documents covering every profile, every edge kind, and every optional layer
- [x] 8.2 Build a corpus of invalid documents with expected diagnostics asserted on exact rule identifier, severity, and pointer
- [x] 8.3 Add round-trip preservation fixtures containing unknown `x-` members and unrecognized reserved blocks, run against every writer
- [x] 8.4 Add rendering fixtures asserting byte-identical output and correct font self-containment
- [x] 8.5 Wire the suite into continuous integration as a release gate

## 9. Book integration

- [x] 9.1 Render one real figure from a hand-written model into the Quarto manuscript
- [x] 9.2 Add a manuscript build step that regenerates every figure from its source document
- [x] 9.3 Add a continuous integration gate running `causal lint` over all manuscript models
- [x] 9.4 Review the rendered figure against the book's typography and adjust the `book-bw` theme

## 10. Publication

- [ ] 10.1 Choose and register the domain, with a ten-year registration horizon
- [ ] 10.2 Publish the versioned schema and context as static files at immutable URLs
- [x] 10.3 Verify documents validate and render offline using the bundled copies, with the remote as fallback only
- [x] 10.4 Write the specification changelog and state the 0.x instability policy alongside the post-1.0 immutability guarantee
