## Purpose

Defines how CausalJSON documents are checked, how problems are reported, and how projects tune which problems matter — so that both a person in an editor and an agent revising a file can correct a document precisely from its diagnostics.

## ADDED Requirements

### Requirement: Layered checks with a fixed error core

Validation SHALL apply checks in layers. Syntax, schema conformance, referential integrity, and structural legality SHALL always be reported as errors and SHALL NOT be configurable. Causal, hygiene, and quantitative checks SHALL be configurable rules.

#### Scenario: Core layer cannot be downgraded

- **WHEN** a configuration attempts to set a referential or structural check to a severity other than error
- **THEN** the configuration is rejected with a diagnostic naming the check that may not be reconfigured

#### Scenario: Later layers are skipped when the core fails

- **WHEN** a document fails schema validation
- **THEN** schema errors are reported and configurable rules are not evaluated against an unparseable model

### Requirement: Every diagnostic is precisely located and machine-readable

Every diagnostic SHALL carry a stable rule identifier, a severity, a human-readable message, and a JSON Pointer locating the offending element. Diagnostics SHALL be emittable as structured data.

#### Scenario: Diagnostic locates a nested member

- **WHEN** the assertion status of the eighth relation is invalid
- **THEN** the diagnostic carries a JSON Pointer resolving to that member, not merely to the document or to the `relations` array

#### Scenario: Structured output

- **WHEN** diagnostics are requested in machine-readable form
- **THEN** each diagnostic is emitted with its rule identifier, severity, message, and pointer as discrete fields

### Requirement: Configurable rule severities

Projects SHALL be able to set the severity of each configurable rule to `error`, `warn`, or `off` in a project-level configuration file. Rules SHALL have documented default severities that apply when no configuration is present.

#### Scenario: Publication gate

- **WHEN** a project configures the rule requiring reviewed assertions to `error` and a document contains a relation with status `proposed`
- **THEN** an error is reported for that relation

#### Scenario: Rule disabled

- **WHEN** a project sets a rule to `off`
- **THEN** no diagnostic is produced for that rule regardless of document content

#### Scenario: No configuration present

- **WHEN** no configuration file exists
- **THEN** every rule is evaluated at its documented default severity

### Requirement: Causal rules detect inference errors

Validation SHALL provide rules that detect causal modelling errors that schema and structural checks cannot: adjusting for a collider or a descendant of the exposure, absence of any unblocked causal path from a declared exposure to a declared outcome, a declared instrument having a directed path to the outcome, and a latent variable with fewer than two children.

#### Scenario: Collider adjustment

- **WHEN** a variable declared as adjusted is a collider on a path between the exposure and the outcome
- **THEN** a diagnostic is reported naming the variable and the path it opens

#### Scenario: Invalid instrument

- **WHEN** a variable declared as an instrument has a directed path to the outcome that does not pass through the exposure
- **THEN** a diagnostic is reported naming the violating path

#### Scenario: Rules limited to applicable profiles

- **WHEN** causal rules are evaluated against a document whose profile does not support them
- **THEN** those rules are skipped rather than reported as failures

### Requirement: Mechanical problems are auto-fixable

Validation SHALL offer an automatic fix mode that repairs mechanical problems only: deriving absent relation identifiers, deriving absent labels from identifiers, and normalizing shorthand to canonical form. Automatic fixing SHALL NOT alter causal structure, assertion status, or any `x-` member.

#### Scenario: Mechanical fixes applied

- **WHEN** automatic fixing runs on a document with relations lacking identifiers
- **THEN** deterministic identifiers are added and no other content changes

#### Scenario: Judgement rules are never auto-fixed

- **WHEN** a document has a relation with status `proposed` and automatic fixing runs
- **THEN** the status is left unchanged and the diagnostic remains
