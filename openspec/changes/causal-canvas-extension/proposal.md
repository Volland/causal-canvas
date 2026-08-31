# Proposal: Causal Canvas — the VS Code extension

## Why

CausalJSON and its toolchain are built and tested, but the only way to author a model today is to type JSON or drive the CLI. That is fine for an agent and tolerable for a practised author; it is a wall for everyone else, and it makes the format harder to adopt than it needs to be.

The format was deliberately designed so that a canvas could exist without the canvas being the asset: relations carry stable identifiers, views carry layout, and round-trip preservation is a normative requirement. Nothing about the visual editor requires changing the format. What is missing is the surface.

This change delivers that surface — a VS Code custom text editor where the document being edited *is* the `.causal.json` file, so the JSON stays the asset, git keeps working, and undo behaves normally.

## What Changes

- **New `apps/vscode`** — the Causal Canvas extension, registering a custom text editor for `.causal.json`.
- **Interactive canvas** — drag variables, draw relations, rename labels, delete elements, switch between the document's views, and choose the relation kind to draw. Dragging writes an explicit pin into the active view rather than a free-floating coordinate.
- **Live publication preview** — a pane showing the actual SVG the emitter produces, so what ships to the manuscript is visible while editing rather than approximated.
- **Diagnostics in the Problems panel** — every `@vpavlyshyn/core` diagnostic surfaced at its JSON Pointer's line and column, including the causal lints.
- **Schema-driven text editing** — `.causal.json` files get validation and completion in the plain text editor from the bundled JSON Schema, with no extra configuration.
- **Commands** — render the current view to SVG, PDF, or PNG; format the document; open the preview; switch the active view.
- **New shared package `@vpavlyshyn/edits`** — the surgical JSON text-edit layer used by the extension, kept separate so it is testable without a running editor.

## Capabilities

### New Capabilities

- `visual-model-editing`: What an author can do on the canvas and what the document must look like afterwards — element creation, movement, deletion, relabelling, view switching, and the preservation and undo guarantees that make visual editing safe on a text asset.
- `editor-integration`: How the extension presents itself inside VS Code — custom editor registration, diagnostics, schema-driven text editing, live preview, commands, and configuration.

### Modified Capabilities

None. This change adds a surface over the existing format and toolchain; no requirement of `causal-json-format`, `model-validation`, `figure-rendering`, or `causal-cli` changes.

## Impact

**New code.** `apps/vscode` and `packages/edits` join the workspace. The extension depends on `@vpavlyshyn/core`, `@vpavlyshyn/render`, `@vpavlyshyn/spec`, and `@vpavlyshyn/edits` — it adds no new capability of its own beyond presentation and editing.

**New external dependencies.** `react`, `react-dom`, and `@xyflow/react` for the canvas (all MIT), `esbuild` to bundle the extension host and webview bundles, and `@types/vscode`. `jsonc-parser` is already a dependency of `@vpavlyshyn/core`.

**Verification limits.** The pure layers — surgical edits, the webview message protocol, diagnostic mapping — are unit tested. The rendered UI itself cannot be exercised in this environment and is verified by build and by manual smoke testing in a real editor.

**No format change.** The schema, the context, and the specification are untouched. If the canvas needs something the format cannot express, that is a finding for a later change, not a licence to alter the format here.
