# CausalJSON 0.1

**Status:** unstable. Breaking changes are permitted within 0.x and announced in the changelog.
**Specification text:** CC-BY-4.0. **Reference implementation:** Apache-2.0.

CausalJSON is a JSON-LD-native, schema-validated document format for causal models. One document holds one model: its variables, its relations, optional quantitative content, and the figure definitions that render it.

The key words MUST, MUST NOT, SHALL, SHOULD, and MAY are to be interpreted as described in RFC 2119.

---

## 1. Document

A CausalJSON document is a JSON object. It MUST declare `causal` and `profile`, and MUST declare `variables`.

```json
{
  "$schema": "https://causalcanvas.org/schema/0.1.json",
  "@context": "https://causalcanvas.org/ns/v1",
  "causal": "0.1",
  "profile": "admg",
  "id": "smoking-cancer",
  "meta": { "title": "Smoking and lung cancer" },
  "variables": [],
  "relations": [],
  "views": []
}
```

The conventional file extension is `.causal.json`.

### 1.1 Version coherence

Three members carry a version. Exactly one is authoritative.

| Member     | Carries                                | Authority         |
| ---------- | -------------------------------------- | ----------------- |
| `causal`   | the format version, e.g. `0.1`         | **authoritative** |
| `$schema`  | the **full** format version in its URL | derived           |
| `@context` | the **major** version only in its URL  | derived           |

The context versions on major only because term IRIs are stable across additive revisions; minting a context per patch would churn every document for no semantic change.

- Tools MUST report a diagnostic when `causal` and the version embedded in `$schema` disagree.
- Tools MUST report a clear diagnostic, and MUST NOT fail with a parse error, for a `causal` version they do not recognise.

### 1.2 Published URL stability

Once published, a version URL MUST NOT change meaning. Additive changes revise the same major version. Breaking changes mint a new major version. Superseded URLs remain resolvable indefinitely.

Conforming tools SHOULD bundle the schema and context and use the remote URL only as a fallback, so that documents validate and render offline and in continuous integration.

---

## 2. Profiles

A document MUST declare exactly one `profile`. The profile selects the validator: it determines which relation kinds are legal and whether directed cycles are permitted.

| Profile | Meaning                                                    | Cycles        |
| ------- | ---------------------------------------------------------- | ------------- |
| `dag`   | directed acyclic graph                                     | forbidden     |
| `admg`  | acyclic directed mixed graph — adds unmeasured confounding | forbidden     |
| `pag`   | partial ancestral graph — a Markov equivalence class       | forbidden     |
| `cld`   | causal loop diagram                                        | **permitted** |

Bayesian-network and structural-causal-model content are **not** profiles. They are additive layers (§5) that attach to any acyclic profile, because a Bayesian network is a DAG plus conditional probability tables and a structural causal model is a DAG plus assignments.

### 2.1 Edge kinds

| Kind                 | Shorthand token | `dag` | `admg` | `pag` | `cld` |
| -------------------- | --------------- | :---: | :----: | :---: | :---: |
| `directed`           | `->`            |  ✅   |   ✅   |  ✅   |  ✅   |
| `bidirected`         | `<->`           |       |   ✅   |  ✅   |       |
| `undirected`         | `--`            |       |        |  ✅   |       |
| `partially-directed` | `o->`           |       |        |  ✅   |       |
| `nondirected`        | `o-o`           |       |        |  ✅   |       |

A relation whose kind is not legal for the document's profile is a structural error. The diagnostic MUST name the profiles that do permit it.

---

## 3. Variables

`variables` is an array. Each entry is either a **slug string** naming the variable, or an **object** carrying `id` plus optional members.

```json
"variables": [
  "tar",
  { "id": "smoking", "label": "Smoking", "role": "exposure",
    "type": "ordinal", "unit": "cigarettes/day" },
  { "id": "genotype", "label": "Genotype", "latent": true }
]
```

A slug MUST match `^[A-Za-z_][A-Za-z0-9_.-]*$`. Identifiers are human-readable rather than opaque, so that a person or a model can name a variable and be understood.

Identifiers MUST be unique within a document. A duplicate is a referential error.

### 3.1 Latent variables and bidirected relations

Unmeasured confounding can be written two ways, and they are not interchangeable.

- Use a **latent variable** (`"latent": true`) when the confounder is a named
  thing you want to reason about, or when it has more than two children.
- Use a **bidirected relation** (`<->`, profile `admg`) when the confounder is
  anonymous and you only care that it exists.

A latent variable with fewer than two children is unidentifiable and SHOULD be
replaced by a bidirected relation; the `latent-underdetermined` rule reports it.

| Member        | Meaning                                                           |
| ------------- | ----------------------------------------------------------------- |
| `id`          | identifier, required in object form                               |
| `label`       | display name; defaults to `id`                                    |
| `description` | prose                                                             |
| `role`        | `exposure`, `outcome`, `adjusted`, `instrument`, `selected`       |
| `latent`      | `true` when the variable is unobserved                            |
| `type`        | `binary`, `categorical`, `ordinal`, `continuous`, `count`, `time` |
| `unit`        | measurement unit                                                  |

---

## 4. Relations

`relations` is an array. Each entry is either an **arrow string** or an **object** carrying `from` and `to`.

```json
"relations": [
  "smoking -> tar",
  "tar -> cancer",
  { "from": "genotype", "to": "cancer", "kind": "bidirected",
    "assertion": { "status": "proposed", "confidence": 0.6 } }
]
```

### 4.1 Arrow shorthand

An arrow string MUST match:

```
^[A-Za-z_][A-Za-z0-9_.-]* +(<->|o->|o-o|->|--) +[A-Za-z_][A-Za-z0-9_.-]*$
```

Endpoints MUST be separated from the arrow token by at least one space. This is what allows hyphens in identifiers without ambiguity: `birth-weight -> cancer` parses, and `a--b` does not parse as a relation at all.

The pattern is published in the schema deliberately. A JSON Schema union failure reports "must match exactly one schema", which is useless for correction; a pattern-constrained branch instead reports the form it expected.

### 4.2 Relation identity

Every relation MUST have a stable identifier. When `id` is absent, tools MUST derive it deterministically as:

```
<from>--<kind>--<to>
```

Derivation MUST be identical across tools and runs. An explicit `id` MUST be preserved rather than replaced.

Identity is required because relations are reified entities in the JSON-LD binding (§8). Without identifiers they become blank nodes, which cannot be reliably diffed, merged, or addressed by an agent.

### 4.3 Members

| Member        | Layer | Meaning                            |
| ------------- | ----- | ---------------------------------- |
| `from`, `to`  | core  | endpoints, required in object form |
| `kind`        | core  | defaults to `directed`             |
| `label`       | core  | display text on the edge           |
| `sign`        | `cld` | `+`, `-`, or `unknown`             |
| `delay`       | `cld` | lag on the influence               |
| `coefficient` | scm   | path coefficient                   |
| `assertion`   | core  | provenance of the claim (§6)       |

---

## 5. Quantitative layers

Bayesian-network and structural-causal-model content attach to the same variables, in the same document, as optional members. A document with no such members remains valid and its structural interpretation is unchanged.

| Member     | Layer | Meaning                                             |
| ---------- | ----- | --------------------------------------------------- |
| `states`   | bn    | the variable's discrete state space                 |
| `cpt`      | bn    | conditional probability table, or `{"$ref": "..."}` |
| `equation` | scm   | assignment in terms of the variable's parents       |
| `noise`    | scm   | exogenous noise term                                |

The internal shape of `cpt` is **reserved** in 0.1. Its attachment point is fixed; the representation — dense arrays, sparse rows, or factor tables — is specified in a later version, once real Bayesian-network use shows which one keeps files tractable.

---

## 6. Assertion provenance

A relation MAY carry an `assertion` object recording who claims it, with what standing, and on what evidence.

```json
"assertion": {
  "status": "proposed",
  "assertedBy": "claude-opus-5",
  "assertedAt": "2026-08-31",
  "confidence": 0.6,
  "rationale": "Shared susceptibility locus at 15q25",
  "evidence": ["doi:10.1038/ng.3260"]
}
```

When `assertion` is absent, the relation MUST be treated as asserted by the document's author with status `accepted`. `status` MUST be one of `proposed`, `accepted`, `disputed`, `rejected`.

This exists so that a document stays trustworthy when an agent contributes to it: without a standing marker, nothing distinguishes an edge the author vouched for from one a model proposed.

Provenance attaches to the **assertion**, never to the causal claim. `prov:wasGeneratedBy` is wrong for "smoking causes cancer" — that is not an event that happened to an entity. It is right for "this assertion was produced by this extraction run."

---

## 7. Views

`views` is an array of named figure definitions. A view MAY subset the graph, filter by assertion standing, specify layout, declare highlights, and select a theme.

```json
"views": [
  { "id": "fig-3-1",
    "include": ["smoking", "tar", "cancer"],
    "layout": { "mode": "auto", "rank": "exposure-to-outcome" },
    "theme": "book-bw" },
  { "id": "fig-3-2",
    "filter": { "status": "accepted" },
    "layout": { "pin": { "smoking": [0, 0], "cancer": [400, 0] } },
    "theme": "book-bw" }
]
```

Views MUST NOT affect the causal interpretation of the model. Two documents identical but for their `views` MUST yield the same variables, the same relations, and the same validation result.

A relation is included in a view only when both of its endpoints are included. A view referencing an undeclared variable is a referential error.

Layout MAY mix automatic placement with explicit pins. **Adding an unpinned variable MUST NOT move a pinned one.**

---

## 8. JSON-LD binding

The **normalized** document is valid JSON-LD 1.1. The on-disk document may contain shorthand and MUST be normalized first.

Normalization expands every shorthand form into canonical object form and derives absent relation identifiers. It MUST NOT change the causal interpretation of the document.

```
JSON on disk            normalized                       RDF
{"from": "smoking",  →  {"@id": "…/smoking--…--tar",  →  :smoking--directed--tar
 "to": "tar",            "@type": "cc:Relation",           a cc:Relation ;
 "confidence": 0.6}      "from": {"@id": "smoking"},       cc:from :smoking ;
                         "to":   {"@id": "tar"},           cc:to   :tar .
```

Relations are **reified entities**, not bare triples, because a relation carries properties and an RDF triple has no attributes.

`views` is typed `@type: @json` in the context. Its contents therefore MUST NOT be decomposed into triples: presentation content round-trips intact without entering the graph.

### 8.1 Vocabulary

`cc:` terms are minted for causal structure, because no adequate causal-structure vocabulary exists. Everything else is borrowed.

| Prefix     | Used for                 |
| ---------- | ------------------------ |
| `cc:`      | causal structure         |
| `dcterms:` | document metadata        |
| `skos:`    | labels and definitions   |
| `cito:`    | citations                |
| `prov:`    | provenance of assertions |

`cc:` causal terms are aligned to the Relation Ontology (`RO:0002410` _causally related to_, `RO:0002418` _causally upstream of_) via `rdfs:subPropertyOf` in a **separate alignment ontology**, so the published context stays small and alignments can evolve without touching an immutable artifact.

---

## 9. Extensibility

The core schema is closed except for namespaced extensions:

```json
"unevaluatedProperties": false,
"patternProperties": { "^x-": true }
```

Unrecognised members MUST be rejected unless prefixed `x-`. This catches `"exposre"` as a typo while permitting genuine extension, entirely inside JSON Schema — so an editor's built-in `$schema` support enforces it with no bespoke code.

`packages` is **reserved** for domain extensions carrying their own schemas. It is specified here and validated in a later version.

### 9.1 Round-trip preservation

Any tool that reads and writes a document **MUST** preserve, byte-identically:

- every `x-` member, at every level;
- every unrecognised reserved block;
- every view;
- the author's choice of shorthand or object form, per element.

This is what makes extensibility real rather than nominal. In practice it means writers MUST apply surgical edits to the JSON text rather than reserialising a parsed object, because reserialising reformats the whole document and silently reorders keys.

---

## 10. Conformance

A conforming implementation MUST:

1. Reject documents failing §1–§4 with located diagnostics carrying a JSON Pointer.
2. Derive relation identifiers per §4.2, deterministically.
3. Enforce profile-gated edge-kind legality and acyclicity per §2.
4. Preserve extension content per §9.1 across any read-write cycle.
5. Produce a normalized form that is valid JSON-LD 1.1 per §8.

The conformance suite accompanying this specification is normative for diagnostic rule identifiers and locations.
