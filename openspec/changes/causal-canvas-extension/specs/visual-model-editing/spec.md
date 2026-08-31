## Purpose

Defines what an author can do to a causal model on a canvas, and what the underlying JSON document must look like afterwards — so that visual editing is a safe way to work on a text file that other tools, agents, and version control also own.

## ADDED Requirements

### Requirement: The canvas presents the active view of the document

The canvas SHALL display the variables and relations of one named view, resolved the same way the renderer resolves it. When the document declares no views, the canvas SHALL present the whole model.

#### Scenario: A view's subset is respected

- **WHEN** the active view includes three of a model's twelve variables
- **THEN** the canvas shows those three variables and only the relations whose endpoints are both shown

#### Scenario: Switching the active view

- **WHEN** the author selects a different declared view
- **THEN** the canvas re-presents the model according to that view, and the document is not modified

### Requirement: Moving a variable records an explicit pin in the active view

Dragging a variable SHALL write its coordinates as a pin on the active view's layout. No coordinate SHALL be written anywhere else in the document.

#### Scenario: A drag becomes a pin

- **WHEN** the author drags a variable to a new position
- **THEN** the active view's `layout.pin` records that variable at those coordinates

#### Scenario: The document has no view to pin into

- **WHEN** the author drags a variable in a document that declares no views
- **THEN** a view is created to hold the pin, and the author is told that this happened

#### Scenario: Moving one variable does not move another

- **WHEN** the author drags one variable
- **THEN** no other variable's recorded position changes

### Requirement: Authors can create, delete, and relabel elements

The canvas SHALL support adding a variable, drawing a relation between two variables, choosing the kind of relation drawn, deleting a variable or relation, and changing a variable's label.

#### Scenario: Drawing a relation

- **WHEN** the author draws a connection from one variable to another with the directed kind selected
- **THEN** a directed relation between them is added to the document

#### Scenario: Drawing a relation kind the profile forbids

- **WHEN** the author draws a bidirected relation in a document whose profile is `dag`
- **THEN** the relation is added and the resulting structural error is reported, rather than the edit being silently refused

#### Scenario: Deleting a variable removes its relations

- **WHEN** the author deletes a variable that participates in relations
- **THEN** the variable and every relation naming it are removed, leaving no dangling endpoint

#### Scenario: Relabelling

- **WHEN** the author changes a variable's label
- **THEN** the variable's `label` is set, and its `id` is unchanged

### Requirement: Every canvas edit preserves unrelated document content

An edit made on the canvas SHALL change only the members it targets. Formatting, key order, `x-` members, unrecognised blocks, other views, and each element's shorthand-or-object form SHALL survive unchanged.

#### Scenario: Extension content survives an edit

- **WHEN** the author drags a variable in a document containing `x-` members and views the canvas does not use
- **THEN** every `x-` member and every other view is byte-identical afterwards

#### Scenario: Shorthand is not rewritten wholesale

- **WHEN** the author edits one relation in a document whose other relations are written in arrow shorthand
- **THEN** those other relations remain in shorthand

### Requirement: Canvas edits participate in normal editor undo

Every canvas edit SHALL be applied to the text document as an ordinary edit, so that the editor's undo and redo reverse it, and so that the file's dirty state and save behaviour are unchanged.

#### Scenario: Undo reverses a drag

- **WHEN** the author drags a variable and then undoes
- **THEN** the document returns to its previous text exactly

### Requirement: Canvas and text stay in sync in both directions

The canvas SHALL reflect changes made to the document text, and text edits SHALL reflect changes made on the canvas, without the author saving or reopening.

#### Scenario: A text edit reaches the canvas

- **WHEN** the author adds a relation by typing in a text editor open on the same file
- **THEN** the canvas shows that relation

#### Scenario: An unparseable document

- **WHEN** the document text is temporarily not valid JSON
- **THEN** the canvas keeps showing the last good state and reports that the document does not parse, rather than clearing or crashing
