---
lat:
  require-code-mention: true
---

# Test specifications

The guarantees this project asserts in tests rather than in prose. Each section below is covered by exactly one test; the conformance corpus is normative for diagnostic rule identifiers and locations.

## Conformance corpus

A corpus of documents under `conformance/` that defines the format by example. Documents under `valid/` must pass the core layers; each under `invalid/` has a sibling `.expected.json` naming the diagnostics a conforming implementation must produce.

### Valid documents pass the core layers

Every document under `conformance/valid/` produces no error-severity diagnostic from syntax, schema, referential, or structural checking. The corpus covers every profile, every relation kind, and every optional layer.

### Invalid documents produce their expected diagnostics

Every document under `conformance/invalid/` produces the exact rule, severity, layer, and JSON Pointer its expectation file names.

This makes diagnostics a tested contract rather than incidental output, which matters because agents correct from them.

### Round-trip preserves extensions

Reading and writing a document returns every `x-` member, every unrecognised block, and every view unchanged, and formatting is idempotent. See [[format#CausalJSON#Extensibility]] — this is the promise most likely to erode silently.

## Format guarantees

Properties of the format itself, independent of any figure or command.

### Relation identity is deterministic

The same relation yields the same derived identifier across tools and runs. Without this, relations become blank nodes on lifting to RDF and cannot be diffed, merged, or addressed. See [[format#CausalJSON#Relations#Relation Identity]].

### View contents do not become triples

Expanding a document to RDF carries `views` as a single opaque JSON literal and produces no triple from its contents, so presentation never pollutes the graph. See [[format#CausalJSON#Views]].

## Figure guarantees

Properties that make figures usable as build artifacts of a manuscript.

### Renders are byte-identical

Rendering the same document and view twice produces identical bytes, so figures are reviewable in a diff and a manuscript build produces no spurious changes. See [[rendering#Figure Rendering#Determinism]].

### Pins survive model growth

Adding an unpinned variable never moves a pinned one, so growing a model does not invalidate hand-placed coordinates. See [[rendering#Figure Rendering#Layout Model]].
