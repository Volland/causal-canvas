# CausalJSON

A JSON-LD-native, schema-validated document format for causal models. One document holds one model: its variables, its relations, optional quantitative content, and the figure definitions that render it.

The format exists because no JSON-native causal format did. DAGitty's model text is the de facto semantic standard but is a bespoke DSL; DoWhy consumes GML and DOT, which carry no causal semantics; every JSON graph container is semantically empty. See [[interop#Interoperability#Ecosystem Position]].

```
{
  "$schema":  "https://<domain>/schema/0.1.json",
  "@context": "https://<domain>/ns/v1",
  "causal":   "0.1",
  "profile":  "admg",

  "variables": [ ... ]   <- who the actors are
  "relations": [ ... ]   <- what causes what, and who says so
  "views":     [ ... ]   <- how to draw it, for which figure
}
```

## Document Identity

Every document declares its format version and may reference the published schema and JSON-LD context. Those URLs are immutable once published, because every document ever written depends on them resolving.

Publication rules are normative: a given version URL never changes meaning, additive changes revise the same major version, breaking changes mint a new major, and old URLs stay live indefinitely. Schema and context are bundled into the tooling with the remote as fallback, so documents validate and render offline and in CI.

### Version Coherence

Three version-bearing fields exist, so exactly one is authoritative: the `causal` member. Everything else derives from it.

- `causal` — authoritative format version.
- `$schema` — embeds the **full** format version.
- `@context` — embeds the **major** version only, because term IRIs are stable across additive revisions.

Tools MUST report a diagnostic when `causal` and the `$schema` URL disagree, and MUST report a clear diagnostic rather than a parse failure for a version they do not recognise. See [[decisions#Design Decisions#D17 Version Coherence]].

## Structural Profiles

A document declares exactly one `profile`, which selects the validator. The profile decides which relation kinds are legal and whether directed cycles are permitted.

The four kinds of causal model are not siblings. Three are additive layers on one acyclic core; only the causal loop diagram is a genuine fork, because it is cyclic. Modelling this correctly halves the schema surface.

```
                    variables + relations
                          (the core)
                              |
        +---------------------+----------------------+
        |                                            |
   ===============                            ===============
    ACYCLIC branch                              CYCLIC branch
   ===============                            ===============
        |                                            |
  kinds: -> <-> o-> o-o --                     kinds: -> only
  validator: no directed cycles                validator: cycles legal
        |                                            |
  +-----+------+--------------+                +-----------+
  |            |              |                |  sign +/- |
+roles      +states        +equations          |  delay    |
exposure/   +cpt           +noise              +-----------+
outcome/    --------       ---------                = cld
adjusted/   = Bayes net    = SCM
latent
--------
= causal-Q ready
```

### Edge Kinds

Five relation kinds exist across the profiles. Legality is profile-gated, so a `bidirected` relation in a `dag` document is a structural error naming the profiles that permit it.

| Kind | Token | `dag` | `admg` | `pag` | `cld` |
|---|---|:--:|:--:|:--:|:--:|
| directed | `->` | yes | yes | yes | yes |
| bidirected — latent confounder | `<->` | — | yes | yes | — |
| undirected — skeleton | `--` | — | — | yes | — |
| partially directed | `o->` | — | — | yes | — |
| nondirected | `o-o` | — | — | yes | — |
| directed cycles permitted | | no | no | no | yes |

## Variables

The actors in a model. A variable is either a bare string naming it, or an object carrying an identifier plus descriptive members such as label, causal role, data type, unit, and latency.

```json
"variables": [
  "tar",
  { "id": "smoking", "label": "Smoking", "role": "exposure",
    "type": "ordinal", "unit": "cigarettes/day" },
  { "id": "genotype", "latent": true }
]
```

Identifiers are human-readable slugs rather than opaque IDs, so that a person or a model can say "add `stress -> smoking`" and be understood. Duplicate identifiers are a referential error.

## Relations

What causes what. A relation is either an arrow string or an object carrying endpoints, kind, and optional annotation including [[format#CausalJSON#Assertion Provenance|provenance]].

```json
"relations": [
  "smoking -> tar",
  "tar -> cancer",
  { "from": "genotype", "to": "cancer", "kind": "bidirected",
    "assertion": { "status": "proposed", "confidence": 0.6 } }
]
```

Arrow strings carry a published regex `pattern` ([[spec/src/index.ts#ARROW_PATTERN]]) in the schema, expanded by [[packages/core/src/normalize.ts#normalize]]. This is deliberate: a JSON Schema `oneOf` failure reports "must match exactly one schema", which is useless to a person and destroys the [[agents#Agent Integration#Self-Correction Loop|self-correction loop]]. A pattern-constrained branch instead reports the arrow form it expected.

### Relation Identity

Every relation has a stable identifier, derived deterministically by [[packages/core/src/normalize.ts#deriveRelationId]] from its endpoints and kind when not given explicitly.

This is forced by the [[format#CausalJSON#JSON-LD Binding|JSON-LD binding]]: relations are reified entities, and without identifiers they become blank nodes — which are poison for diffing, for merging, and for letting an agent address one specific edge. Explicit identifiers are preserved rather than replaced.

## Quantitative Layers

Bayesian-network and structural-causal-model content attaches to the same variables and relations as optional members, rather than requiring a separate profile or a second file.

A Bayesian network *is* a DAG plus conditional probability tables. An SCM *is* a DAG plus structural equations and noise terms. Treating them as layers rather than alternatives means the workflow "structure first, then numbers" happens in one document, with no cross-file drift when a variable is renamed.

Bulky content may be extracted with `$ref`. A document with no quantitative members remains valid and unchanged in its structural interpretation.

## Assertion Provenance

A relation may record who claimed it, with what standing, and on what evidence. Absent, the relation is treated as asserted by the document's author with status `accepted`.

```json
"assertion": {
  "status": "proposed",          // proposed | accepted | disputed | rejected
  "assertedBy": "claude-opus-5",
  "assertedAt": "2026-08-31",
  "confidence": 0.6,
  "rationale": "Shared susceptibility locus at 15q25",
  "evidence": ["doi:10.1038/ng.3260"]
}
```

Without this, a document becomes untrustworthy the moment an agent touches it, because nothing distinguishes an edge the author vouched for from one a model proposed. What it unlocks is described in [[agents#Agent Integration#Assertion Review Workflow]].

## Views

Named figure definitions. A view may subset the graph, filter by assertion standing, mix automatic layout with explicit pins, declare highlights, and select a theme.

Views are how "the diagram is not the asset" and "the book needs a dozen figures" coexist: a figure is a query over the model, not a drawing of it. One model, many figures, no copy-paste, and no drift when a variable is renamed. Resolution is described in [[rendering#Figure Rendering#View Resolution]].

Views carry no causal meaning and must not affect interpretation. They are typed `@type: @json` in the context so that presentation content round-trips intact without ever entering the RDF graph.

## Extensibility

The core schema rejects unrecognised members except those prefixed `x-`, which are permitted anywhere. A `packages` member is reserved for domain extensions carrying their own schemas.

```json
"additionalProperties": false,
"patternProperties": { "^x-": true }
```

This resolves the tension between catching `"exposre"` as a typo and accepting a legitimate custom field, entirely inside JSON Schema — so an editor's built-in `$schema` support enforces it with no bespoke code.

**Round-trip preservation is a normative MUST.** Any tool that reads and writes a document preserves every `x-` member and every unrecognised reserved block byte-identically. This is what makes extensibility real rather than nominal; it is where most editors quietly fail, and it is why the canvas applies surgical text edits rather than reserialising. See [[architecture#Architecture#Preservation Invariant]].

## JSON-LD Binding

The **normalized** document is valid JSON-LD 1.1. [[packages/core/src/ld.ts#toJsonLd]] builds it, inlining the bundled context so expansion never touches the network. The on-disk document may contain shorthand and is normalized first.

This precision matters. A bare string in a JSON-LD array is either an IRI reference or a literal, so `"variables": ["tar"]` expands correctly but `"relations": ["smoking -> tar"]` would expand to a meaningless literal. Rather than sacrifice arrow shorthand, expansion gains one pre-stage — and no consumer reads compact JSON-LD as RDF anyway; they all run `expand()` first.

```
 JSON on disk            normalized JSON-LD                RDF
+----------------+   +---------------------------+   +--------------------+
| {"from":       |   | {"@id": "r/smoking-tar",  |   | :r/smoking-tar     |
|   "smoking",   |   |  "@type": "cc:Relation",  |   |   a cc:Relation ;  |
|  "to": "tar",  |-->|  "cc:from": {"@id": ...}, |-->|   cc:from :smoking;|
|  "confidence": |   |  "cc:to":   {"@id": ...}, |   |   cc:to   :tar ;   |
|   0.6 }        |   |  "cc:confidence": 0.6 }   |   |   cc:confidence .6 |
+----------------+   +---------------------------+   +--------------------+
```

Reification is not a stylistic choice. Relations carry properties, and a plain RDF triple has no attributes; the alternatives are RDF-star, whose tooling is still uneven, or reification. The natural JSON object shape already *is* the reified shape, so nothing had to be redesigned.

### Vocabulary Alignment

`cc:` terms are minted for causal structure because no adequate causal-structure vocabulary exists. Everything else is borrowed.

- **RO** (Relation Ontology) — `cc:` causal terms align via `rdfs:subPropertyOf` in a separate alignment ontology, keeping the published core context small.
- **DCTERMS** — document metadata.
- **SKOS** — labels and definitions. Gives multilingual labels via `@language` at no extra cost.
- **CiTO** — citations.
- **PROV-O** — provenance of *assertions*, never of causal claims.

That last distinction is a common and embarrassing modelling error. `prov:wasGeneratedBy` is wrong for "smoking causes cancer" — that is not an event that happened to an entity. It is right for "this assertion was produced by this extraction run."
