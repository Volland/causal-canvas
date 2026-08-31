## Purpose

Defines the CausalJSON document format: how a causal model is expressed as a JSON document that is schema-validatable, extensible without forking, liftable to RDF, and terse enough for both humans and language models to author by hand.

## ADDED Requirements

### Requirement: Document identity and version coherence

A CausalJSON document SHALL declare its format version in a `causal` member, and MAY declare `$schema` and `@context` members referencing published, immutable URLs. The `causal` member SHALL be authoritative. The `$schema` URL SHALL embed the full format version; the `@context` URL SHALL embed only the major version.

#### Scenario: Version fields agree

- **WHEN** a document declares `causal: "0.1"` and a `$schema` URL embedding version `0.1`
- **THEN** the document is accepted and validated against that schema version

#### Scenario: Version fields disagree

- **WHEN** a document declares `causal: "0.1"` but a `$schema` URL embedding a different version
- **THEN** a diagnostic is reported identifying both declared versions, and validation does not proceed against an ambiguous schema

#### Scenario: Unrecognized future version

- **WHEN** a document declares a `causal` version the reader does not recognize
- **THEN** a clear diagnostic naming the unsupported version is reported, and the reader does not fail with a parse error

### Requirement: Structural profile selects the validator

A document SHALL declare exactly one `profile` from `dag`, `admg`, `pag`, or `cld`. The profile SHALL determine which relation kinds are legal and whether directed cycles are permitted.

#### Scenario: Cycle rejected in an acyclic profile

- **WHEN** a document declares `profile: "dag"` and its relations form a directed cycle
- **THEN** a structural error is reported identifying the cycle's member relations

#### Scenario: Cycle accepted in the cyclic profile

- **WHEN** a document declares `profile: "cld"` and its relations form a directed cycle
- **THEN** the document validates successfully

#### Scenario: Relation kind illegal for the profile

- **WHEN** a document declares `profile: "dag"` and contains a relation of kind `bidirected`
- **THEN** an error is reported stating that the kind is not permitted in that profile and naming the profiles that permit it

### Requirement: Variables accept shorthand or object form

The `variables` member SHALL accept, in any combination, bare strings denoting an identifier and objects carrying an `id` plus optional descriptive members. Identifiers SHALL be unique within a document.

#### Scenario: Mixed shorthand and object forms

- **WHEN** a document declares `"variables": ["tar", {"id": "smoking", "role": "exposure"}]`
- **THEN** both variables are recognized, `tar` having no attributes beyond its identifier

#### Scenario: Duplicate identifiers

- **WHEN** two entries in `variables` resolve to the same identifier
- **THEN** an error is reported naming the identifier and locating both declarations

### Requirement: Relations accept arrow shorthand or object form

The `relations` member SHALL accept, in any combination, arrow strings and objects carrying `from`, `to`, and optional members. Arrow strings SHALL be constrained by a published pattern so that a malformed arrow produces a diagnostic naming the expected form. Recognized arrow tokens SHALL be `->`, `<->`, `--`, `o->`, and `o-o`.

#### Scenario: Arrow shorthand expands

- **WHEN** a document declares `"relations": ["smoking -> tar"]`
- **THEN** a directed relation from `smoking` to `tar` is recognized

#### Scenario: Malformed arrow

- **WHEN** a relation string does not match the published arrow pattern
- **THEN** an error is reported that names the expected pattern rather than reporting a generic schema-union failure

#### Scenario: Relation references an undeclared variable

- **WHEN** a relation names an endpoint that appears in no `variables` entry
- **THEN** a referential error is reported naming the missing identifier

### Requirement: Relations have stable identity

Every relation SHALL have a stable identifier. When `id` is absent, the identifier SHALL be derived deterministically from the relation's endpoints and kind, so that the same relation yields the same identifier across tools and runs.

#### Scenario: Derived identifier is deterministic

- **WHEN** the same relation is normalized twice by any conforming tool
- **THEN** the derived identifier is identical in both results

#### Scenario: Explicit identifier is preserved

- **WHEN** a relation declares an explicit `id`
- **THEN** that identifier is preserved through normalization and formatting rather than being replaced by a derived one

### Requirement: Quantitative content attaches as additive layers

Bayesian-network and structural-causal-model content SHALL attach to the same variables and relations as optional members rather than requiring a separate profile or document. A document containing no such members SHALL remain valid. Bulky content MAY be extracted via `$ref`.

#### Scenario: Bare structural model stays minimal

- **WHEN** a document declares only variables and relations with no quantitative members
- **THEN** it validates successfully with no missing-member diagnostics

#### Scenario: Quantitative layer added to an existing model

- **WHEN** quantitative members are added to variables in a valid structural document
- **THEN** the document remains valid and its structural interpretation is unchanged

### Requirement: Relations carry optional assertion provenance

A relation MAY carry an `assertion` member recording `status` (one of `proposed`, `accepted`, `disputed`, `rejected`), `assertedBy`, `assertedAt`, `confidence`, `rationale`, and `evidence`. When absent, the relation SHALL be treated as asserted by the document's author with status `accepted`.

#### Scenario: Agent-proposed edge is distinguishable

- **WHEN** a relation carries `assertion.status: "proposed"` and another carries no assertion member
- **THEN** consumers can distinguish the proposed relation from the author-asserted one

#### Scenario: Invalid status value

- **WHEN** a relation declares an `assertion.status` outside the permitted set
- **THEN** an error is reported listing the permitted values

### Requirement: Views declare figures without affecting model semantics

A document MAY declare a `views` member holding named figure definitions. A view MAY subset the graph, filter by assertion status, specify layout as automatic placement and/or explicit coordinate pins, declare highlighted elements, and select a theme. Views SHALL NOT affect the causal interpretation of the model, and SHALL round-trip unchanged through any conforming reader and writer.

#### Scenario: View subsets the graph

- **WHEN** a view declares an `include` list naming three of twelve variables
- **THEN** that view resolves to a figure containing only those three variables and the relations between them

#### Scenario: Views do not alter semantics

- **WHEN** two documents are identical except that one declares `views` and the other does not
- **THEN** both yield the same set of variables and relations and the same validation result

#### Scenario: View references an undeclared variable

- **WHEN** a view's `include` list names an identifier that appears in no `variables` entry
- **THEN** a referential error is reported naming the missing identifier

### Requirement: Extension members are permitted and preserved

The format SHALL reject unrecognized members except those prefixed `x-`, which SHALL be permitted anywhere. Any tool that reads and writes a document SHALL preserve every `x-` member and every unrecognized reserved block unchanged. A `packages` member SHALL be reserved for domain extensions carrying their own schemas.

#### Scenario: Typo rejected

- **WHEN** a variable declares a member `exposre` that is neither a known member nor `x-` prefixed
- **THEN** an error is reported naming the unrecognized member and its location

#### Scenario: Extension member accepted and preserved

- **WHEN** a document containing `x-mytool:collapsed` is read and written back by a conforming tool
- **THEN** the document validates and the `x-mytool:collapsed` member is present and unchanged in the output

### Requirement: Normalized documents are valid JSON-LD

Normalization SHALL expand all shorthand into canonical object form. The normalized document SHALL be valid JSON-LD 1.1, with relations expressed as reified entities carrying their own identifiers, and with `views` carried as an opaque JSON literal so that presentation content does not enter the RDF graph.

#### Scenario: Normalized document expands to RDF

- **WHEN** a valid document containing arrow shorthand is normalized and then expanded as JSON-LD
- **THEN** expansion succeeds and each relation appears as a distinct identified entity with its endpoints as IRI references

#### Scenario: Views do not become triples

- **WHEN** a document declaring `views` is normalized and expanded to RDF
- **THEN** no triples are produced from the contents of `views`
