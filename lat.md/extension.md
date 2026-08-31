# Causal Canvas extension

The VS Code surface over [[format#CausalJSON|CausalJSON]]. The document being edited is the `.causal.json` text itself, so the JSON stays the asset and the canvas is only a projection of it.

Nothing here required changing the format. Relations already had stable identifiers, views already held layout, and round-trip preservation was already normative — the editor is what those decisions were made for.

## Editor Architecture

A Custom Text Editor whose document is the file text, so undo, dirty state, save, and version control behave exactly as they do for any other file.

```
   .causal.json  (the document)
        |
        v
  +-------------------+        scene         +------------------+
  | extension host    | -------------------> |  webview canvas  |
  |                   |                      |  (React Flow)    |
  | lint  -> problems | <------------------- |                  |
  | view  -> geometry |       intent         +------------------+
  | edits -> text     |
  +-------------------+
        |
        +--> Problems panel      +--> figure preview (real emitter SVG)
```

[[apps/vscode/src/editorProvider.ts#CausalEditorProvider]] holds the loop. The host resolves the view, computes geometry, and sends a positioned scene; the webview computes no layout of its own, which is what makes the shared-geometry invariant in [[architecture#Architecture#Shared Geometry Invariant]] hold for the canvas too.

## Surgical Edits

Every canvas action becomes a targeted text edit, never a parse-mutate-reserialise cycle.

[[packages/edits/src/index.ts#pinVariable]] and its siblings live in their own package rather than in the extension, so the single most breakable guarantee in the product — [[architecture#Architecture#Preservation Invariant]] — is testable without a running editor.

Two consequences worth stating. A drag writes `views[active].layout.pin`, because that is the only place a coordinate may legally live; a document with no views gets one created, and the author is told. And [[apps/vscode/src/diff.ts#minimalEdit]] narrows the rewritten text to the span that actually changed, so a gesture is one tight undo step rather than a whole-file replace.

## The Scene Protocol

One message out carrying a positioned scene, and a closed union of intent messages back.

Intent messages say what the author did — "dragged `smoking` to (120, 40)" — never what the document should become. Authority stays in the host, so the webview never becomes a second writer to the file. [[apps/vscode/src/protocol.ts#parseIntent]] validates at the boundary: a malformed message is a reported bug, never an edit.

[[apps/vscode/src/scene.ts#buildScene]] flattens the resolved view, the computed geometry, and the current diagnostics into the scene the canvas draws.

## Diagnostics

Every check the CLI runs, published to the editor's Problems panel at the element its JSON Pointer identifies.

[[apps/vscode/src/diagnostics.ts#DiagnosticPublisher]] reuses the same location machinery as the command line, so the editor and the terminal agree about where a problem is. Project configuration is resolved per document, which means a manuscript directory's publication gate reports in the editor exactly as it does in continuous integration. See [[validation#Validation#Rule Configuration]].

## Figure Preview

A pane showing the genuine emitter output for the active view, not a second approximation of it.

[[apps/vscode/src/preview.ts#FigurePreview]] calls the same renderer the CLI does. It refuses to render a document carrying error-severity diagnostics, because the failure worth preventing is shipping a figure that looks plausible and is wrong. This is what closes the styling gap the canvas deliberately accepts.

## Bundling

Two bundles: a CommonJS host bundle and a self-contained browser bundle for the webview.

A VS Code webview has no module resolution and no network, so everything it needs is inlined. Bundling also means the extension ships with no runtime `node_modules`, which is what makes it packageable. This is why `apps/vscode` builds with esbuild rather than plain `tsc` like every other package — and why JSON-LD lifting lives at `@vpavlyshyn/core/ld` rather than on the main entry, keeping a network-capable dependency out of the editor.

Packaging is governed by `.vscodeignore` rather than a `files` list, because the packager rejects both strategies at once and only the ignore file can exclude the source maps that live inside `dist/`. Dropping them takes the `.vsix` from 2.7 MB to about 810 KB, and they help nobody who installs the extension.
