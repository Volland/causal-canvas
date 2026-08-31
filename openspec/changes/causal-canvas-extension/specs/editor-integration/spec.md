## Purpose

Defines how Causal Canvas presents itself inside VS Code — which files it claims, where problems appear, what the author can invoke, and what the plain text editing experience is — so the extension behaves like a native part of the editor rather than a webview bolted on.

## ADDED Requirements

### Requirement: CausalJSON files open in the visual editor without losing the text

The extension SHALL register a custom editor for `.causal.json` files whose underlying document is the file's text. The author SHALL be able to open the same file in a plain text editor at the same time.

#### Scenario: Opening a model

- **WHEN** the author opens a `.causal.json` file
- **THEN** the visual editor is presented and the file's text is the document being edited

#### Scenario: Text and canvas side by side

- **WHEN** the author opens the same file in both the visual editor and a text editor
- **THEN** both are editing one document and each reflects the other's changes

### Requirement: Diagnostics appear in the Problems panel at precise locations

The extension SHALL publish every diagnostic produced for an open CausalJSON document to the editor's diagnostics, positioned at the element its JSON Pointer identifies, carrying the rule identifier and the configured severity.

#### Scenario: A causal lint is reported

- **WHEN** an open document adjusts for a collider
- **THEN** a problem appears naming the `collider-adjustment` rule, positioned at the offending variable

#### Scenario: Severity follows project configuration

- **WHEN** the project configures a rule to `error` and the document violates it
- **THEN** the problem is reported with error severity

#### Scenario: Diagnostics clear when fixed

- **WHEN** the author corrects the cause of a diagnostic
- **THEN** that problem is removed without the file being saved or reopened

### Requirement: Plain text editing is schema-driven

The extension SHALL associate CausalJSON files with the bundled JSON Schema so that validation and completion work in the plain text editor with no configuration by the author, including for documents that declare no `$schema` member.

#### Scenario: Completion without a $schema member

- **WHEN** the author edits a `.causal.json` file that declares no `$schema`
- **THEN** member completion and schema validation are available

### Requirement: A preview shows the publication figure

The extension SHALL offer a preview of the active view rendered by the figure emitter, and SHALL update it as the document changes.

#### Scenario: The preview matches what would ship

- **WHEN** the preview is open for a view
- **THEN** it shows the same figure the render command produces for that view

#### Scenario: The preview follows edits

- **WHEN** the document changes while the preview is open
- **THEN** the preview re-renders

#### Scenario: The document has errors

- **WHEN** the document has error-severity diagnostics
- **THEN** the preview reports that it cannot render rather than showing a stale or partial figure

### Requirement: Commands are available for the common operations

The extension SHALL contribute commands to render the active view to a chosen format, to format the document, to open the preview, and to choose the active view. Commands operating on a document SHALL be available only when a CausalJSON document is active.

#### Scenario: Rendering from the editor

- **WHEN** the author invokes the render command and chooses a format
- **THEN** the figure for the active view is written and the author is told where

#### Scenario: Commands are scoped

- **WHEN** the active editor holds a file that is not CausalJSON
- **THEN** the document commands are not offered

### Requirement: Authors can create a new model from the editor

The extension SHALL contribute a command that creates a new CausalJSON document and opens it. The command SHALL be available when no CausalJSON document is open, and SHALL let the author choose the structural profile.

The created document SHALL validate with no error-severity diagnostics and SHALL declare the format version, a profile, and a view, so the canvas has something to present immediately.

#### Scenario: Creating a model

- **WHEN** the author invokes the new-model command, chooses a profile, and supplies a name
- **THEN** a document is written with that profile, and it opens in the visual editor

#### Scenario: The command does not require an open model

- **WHEN** no CausalJSON document is open
- **THEN** the new-model command is still offered

#### Scenario: The created document is valid

- **WHEN** a model is created for any supported profile
- **THEN** validating it produces no error-severity diagnostics

#### Scenario: Refusing to overwrite

- **WHEN** the chosen filename already exists
- **THEN** the author is told and no file is written

### Requirement: Extension behaviour is configurable

The extension SHALL expose settings for the figure format used by the render command, the output directory for rendered figures, and whether the preview opens automatically.

#### Scenario: Configured output directory

- **WHEN** an output directory is configured and the author renders a figure
- **THEN** the figure is written into that directory
