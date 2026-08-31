# Tasks

Ordered so the guarantee that is hardest to recover from — round-trip preservation under editing — is built and tested first, before any UI exists to depend on it.

## 1. The surgical edit layer

- [x] 1.1 Create `packages/edits` in the workspace with its build and typecheck wiring
- [x] 1.2 Implement pointer-addressed set, insert, and remove operations over document text using the JSON syntax tree
- [x] 1.3 Implement `pinVariable`, creating the active view when the document declares none
- [x] 1.4 Implement `addRelation`, `deleteRelation`, `addVariable`, and `setVariableLabel`
- [x] 1.5 Implement `deleteVariable` as one composite edit that also removes every relation naming it
- [x] 1.6 Prove each operation preserves `x-` members, unrecognised blocks, other views, key order, and shorthand form, using the existing preservation fixture
- [x] 1.7 Prove every operation leaves a document that still parses and validates

## 2. Extension scaffolding

- [x] 2.1 Create `apps/vscode` with its manifest, activation events, and TypeScript configuration
- [x] 2.2 Configure esbuild to emit a CommonJS host bundle and an IIFE webview bundle
- [x] 2.3 Contribute the `causal-json` language association and the bundled JSON Schema for `**/*.causal.json`
- [x] 2.4 Contribute extension settings for figure format, output directory, and preview auto-open

## 3. The custom text editor

- [x] 3.1 Register a `CustomTextEditorProvider` for `.causal.json` whose document is the file text
- [x] 3.2 Resolve the active view and compute geometry in the extension host, sending the webview a positioned scene
- [x] 3.3 Push a new scene on every document change, and keep the last good scene when the text does not parse
- [x] 3.4 Define the typed webview message protocol and validate messages at the boundary
- [x] 3.5 Apply each inbound intent message as a `WorkspaceEdit` so undo, dirty state, and save behave normally

## 4. The canvas

- [x] 4.1 Build the webview shell with the scene protocol and theme-aware styling
- [x] 4.2 Render variables and relations with React Flow, using the geometry supplied by the host
- [x] 4.3 Draw latent variables and each relation kind distinctly, matching the figure conventions
- [x] 4.4 Emit `moveNode` on drag stop, so one gesture is one edit and one undo step
- [x] 4.5 Support drawing relations, choosing the relation kind, deleting elements, and relabelling
- [x] 4.6 Add a toolbar for the active view, the relation kind, and fit-to-view
- [x] 4.7 Surface diagnostics on the canvas by marking the elements they name

## 5. Diagnostics and commands

- [x] 5.1 Publish diagnostics for open CausalJSON documents, mapping JSON Pointers to ranges
- [x] 5.2 Resolve project configuration per document so severities match the CLI and CI
- [x] 5.3 Debounce recomputation on change and clear diagnostics when a document closes
- [x] 5.4 Implement the render, format, open-preview, and choose-view commands, scoped to CausalJSON documents
- [x] 5.6 Implement the new-model command: profile choice, starter document, file placement, and refusal to overwrite
- [x] 5.5 Implement the preview pane rendering the real emitter output, refusing when the document has errors

## 6. Verification and packaging

- [x] 6.1 Unit test the edit layer, the message protocol, and the pointer-to-range mapping
- [x] 6.2 Extend the conformance preservation fixtures to cover an edit session's worth of operations
- [x] 6.3 Wire the new package and app into the workspace build, lint, format, and CI
- [x] 6.4 Add packaging so a `.vsix` can be produced, and document how to run the extension locally
- [x] 6.5 Update `lat.md/` with the extension architecture and run `lat check`
