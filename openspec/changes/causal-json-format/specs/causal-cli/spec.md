## Purpose

Defines the command-line surface through which people, continuous integration, and agents work with CausalJSON documents, including its output contract and its exit-code semantics.

## ADDED Requirements

### Requirement: Command set

The command line SHALL provide commands to validate a document, lint a document, format a document, render a view, and summarize a document.

#### Scenario: Validate a document

- **WHEN** the validate command runs against a valid document
- **THEN** it reports success and produces no diagnostics

#### Scenario: Render a view to a file

- **WHEN** the render command runs naming a document, a view, an output format, and a destination
- **THEN** the figure is written to the destination in the requested format

### Requirement: Machine-readable output

Every command that produces diagnostics SHALL offer structured output carrying each diagnostic's rule identifier, severity, message, and JSON Pointer location. Structured output SHALL be written to standard output with no interleaved human-readable text.

#### Scenario: Structured diagnostics are parseable

- **WHEN** a command runs in structured output mode against a document with errors
- **THEN** standard output parses as structured data containing one entry per diagnostic

#### Scenario: Progress text does not corrupt structured output

- **WHEN** a command runs in structured output mode
- **THEN** any progress or informational text appears on standard error, leaving standard output parseable

### Requirement: Exit codes suitable for continuous integration

Commands SHALL exit zero when no error-severity diagnostics were produced and non-zero when any were. Warnings alone SHALL NOT cause a non-zero exit unless the caller requests that warnings be treated as errors.

#### Scenario: Errors fail the build

- **WHEN** linting produces at least one error-severity diagnostic
- **THEN** the command exits non-zero

#### Scenario: Warnings pass by default

- **WHEN** linting produces only warning-severity diagnostics
- **THEN** the command exits zero

#### Scenario: Warnings escalated on request

- **WHEN** linting runs with warnings treated as errors and produces a warning
- **THEN** the command exits non-zero

### Requirement: Formatting preserves content

The format command SHALL rewrite a document into canonical form while preserving every `x-` member, every unrecognized reserved block, every view, and the author's choice of shorthand or object form for each element.

#### Scenario: Extension members survive formatting

- **WHEN** a document containing `x-` members is formatted
- **THEN** every `x-` member is present and unchanged in the output

#### Scenario: Formatting is idempotent

- **WHEN** a document is formatted twice
- **THEN** the second formatting produces no change

### Requirement: Summarize compresses a document for limited context

The summarize command SHALL emit a compact representation of a document's variables and relations using the format's shorthand, suitable for inclusion in a bounded context window.

#### Scenario: Large model summarized

- **WHEN** summarize runs against a document with many variables
- **THEN** it emits the model's structure in shorthand form, substantially smaller than the source document

#### Scenario: Summary is re-readable

- **WHEN** the emitted summary is supplied as a document body
- **THEN** it parses as a valid model with the same variables and relations as the source
