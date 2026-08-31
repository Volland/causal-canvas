## Purpose

Defines how a named view in a CausalJSON document becomes a publication figure, so that the figures in a manuscript are regenerable artifacts of the model rather than hand-maintained drawings that drift from it.

## ADDED Requirements

### Requirement: Rendering is deterministic

Rendering the same document and view with the same tool version SHALL produce byte-identical output. Rendering SHALL NOT require a browser, a display, or network access.

#### Scenario: Repeated renders match

- **WHEN** the same document and view are rendered twice
- **THEN** the two outputs are byte-identical

#### Scenario: Headless environment

- **WHEN** rendering runs in a continuous integration environment with no display and no network
- **THEN** rendering succeeds

### Requirement: Views resolve to figures

Rendering SHALL resolve a named view by applying its element subset, its assertion-status filter, its layout, its highlights, and its theme. A view omitting a subset SHALL render the whole model.

#### Scenario: Subset render

- **WHEN** a view includes three of twelve variables
- **THEN** the figure contains those three variables and only the relations whose endpoints are both included

#### Scenario: Status filter

- **WHEN** a view filters to accepted assertions and the model contains proposed relations
- **THEN** the proposed relations are absent from the figure while remaining present in the document

#### Scenario: Unknown view requested

- **WHEN** a view identifier is requested that the document does not declare
- **THEN** an error is reported naming the requested identifier and listing the declared view identifiers

### Requirement: Layout mixes automatic placement with explicit pins

A view's layout SHALL support automatic placement, explicit coordinate pins, and any combination of the two. Pinned elements SHALL be placed at their given coordinates and automatic placement SHALL position the remainder around them. Adding an unpinned variable SHALL NOT change the position of any pinned variable.

#### Scenario: Pins are honoured

- **WHEN** a view pins two variables and leaves the rest automatic
- **THEN** the pinned variables appear at their given coordinates in the output

#### Scenario: Pins survive model growth

- **WHEN** a variable is added to a model and the view is re-rendered
- **THEN** every pinned variable remains at its original coordinates

### Requirement: One geometry drives every output

All rendered outputs of a given view SHALL derive from a single computed geometry, so that element positions are identical across output formats and across any interactive presentation of the same view.

#### Scenario: Formats agree on placement

- **WHEN** one view is rendered to two different output formats
- **THEN** every element occupies the same position, in the coordinate system of each format, in both outputs

### Requirement: Output formats suitable for print and web

Rendering SHALL produce vector output for web embedding, vector output for print, and raster output at a caller-specified resolution. Raster and print output SHALL be self-contained with respect to fonts, either by embedding them or by converting text to outlines.

#### Scenario: Raster resolution

- **WHEN** a raster output is requested at a given resolution
- **THEN** the produced image matches that resolution

#### Scenario: Fonts do not depend on the viewing machine

- **WHEN** print or raster output is opened on a machine lacking the fonts used at render time
- **THEN** the text renders as it did at render time

### Requirement: Themes are named and overridable

A view SHALL select its theme by name. Conforming tools SHALL provide built-in themes and SHALL allow a project to define or override themes in project configuration. An unknown theme name SHALL be reported rather than silently substituted.

#### Scenario: Project theme override

- **WHEN** a project defines a theme whose name matches a built-in theme
- **THEN** the project definition is used

#### Scenario: Unknown theme

- **WHEN** a view names a theme that is neither built in nor project-defined
- **THEN** an error is reported naming the unknown theme
