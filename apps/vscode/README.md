# Causal Canvas

Visual editing, linting, and figure rendering for [CausalJSON](../../spec/causaljson-0.1.md)
causal models, inside VS Code.

The document you edit is the `.causal.json` file itself. The canvas is a
projection of it — never the source — so undo, save, diffs, and version control
behave exactly as they do for any other file, and an agent or the CLI can edit
the same model without fighting the editor.

## What it does

- **Visual editor.** Drag variables, draw relations, choose the relation kind,
  delete elements, rename labels, and switch between the document's views.
  Dragging records an explicit pin on the active view; no coordinate is ever
  written onto a variable.
- **Diagnostics in Problems.** Every check the CLI runs, including the causal
  lints — adjusting for a collider, an instrument that violates the exclusion
  restriction, an exposure with no path to the outcome — reported at the exact
  member that caused it, at the severity your `causal.config.json` sets.
- **Figure preview.** A pane showing the real emitter output for the active
  view, so what ships to a manuscript is visible while you edit.
- **Schema-driven text editing.** Completion and validation in the plain text
  editor, with no `$schema` member required.

## Commands

| Command                              | What it does                                  |
| ------------------------------------ | --------------------------------------------- |
| `Causal Canvas: Render Figure`       | Render the active view to SVG, PDF, or PNG    |
| `Causal Canvas: Open Figure Preview` | Open the live publication preview             |
| `Causal Canvas: Choose Active View`  | Pick the view used for rendering and preview  |
| `Causal Canvas: Format Document`     | Canonical formatting, preserving extensions   |
| `Causal Canvas: Open in Text Editor` | Open the same file as text, beside the canvas |

## Settings

| Setting                              | Default   | Meaning                                                                                   |
| ------------------------------------ | --------- | ----------------------------------------------------------------------------------------- |
| `causalCanvas.figureFormat`          | `svg`     | Format offered first by Render Figure                                                     |
| `causalCanvas.figureOutputDirectory` | _(empty)_ | Where figures are written, relative to the workspace root. Empty writes beside the model. |
| `causalCanvas.preview.autoOpen`      | `false`   | Open the preview when a model is opened                                                   |

## Running it locally

From the repository root:

```bash
pnpm install
pnpm run build            # builds the packages, then bundles the extension
```

Then open this repository in VS Code and press **F5** to launch an Extension
Development Host. Open any file under `examples/` to see the canvas.

While iterating:

```bash
pnpm --filter causal-canvas run watch
```

## Packaging

```bash
pnpm --filter causal-canvas run package   # produces a .vsix
```

## What it will not do

Change the format. If the canvas cannot express something, that is a finding
for the specification, not a licence for the editor to invent syntax. The
`.causal.json` files remain ordinary JSON, editable by hand and by the CLI,
whether or not this extension is installed.
