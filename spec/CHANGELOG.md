# CausalJSON changelog

## Versioning policy

**During 0.x the format is unstable.** Breaking changes are permitted and are
recorded here. Do not treat a 0.x `$schema` or `@context` URL as permanent.

**From 1.0 onward, published URLs are immutable.** A given version URL never
changes meaning. Additive changes revise the same major version; breaking
changes mint a new major version; superseded URLs stay resolvable indefinitely.
Both guarantees exist because every document ever written carries those URLs.

`causal` is the authoritative version. `$schema` embeds the full version;
`@context` embeds the major version only, because term IRIs are stable across
additive revisions.

## 0.1 — unreleased

First specification. Nothing is published at a permanent URL yet: the schema and
context are bundled with the tooling and the remote URLs are not live.

- Document identity, version coherence, and URL stability rules.
- Four structural profiles: `dag`, `admg`, `pag`, `cld`. Cycles are legal only
  in `cld`; relation-kind legality is profile-gated.
- Variables and relations in shorthand or object form. Arrow shorthand is
  pattern-constrained so a malformed arrow reports the form it expected.
- Deterministic relation identity, derived as `<from>--<kind>--<to>`.
- Additive Bayesian-network and structural-causal-model layers. The internal
  shape of `cpt` is reserved.
- Optional assertion provenance with `status`, `assertedBy`, `confidence`,
  `rationale`, and `evidence`.
- Views as figure definitions, carried as an opaque JSON literal.
- Closed schema with `x-` namespaced extensions and a normative round-trip
  preservation requirement. `packages` reserved.
- JSON-LD binding: relations are reified entities; the normalized document is
  valid JSON-LD 1.1.

### Added during authoring review

Three changes came out of writing four real models by hand against the draft:

- `meta.question` — models had no place to record the estimand.
- `states-match-type` — a `binary` variable with three states validated.
- Guidance on latent variables versus bidirected relations (§3.1).
