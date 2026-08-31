# Design: Causal Canvas — the VS Code extension

## Context

See `proposal.md` — Why.

The architectural decision this change implements was already taken and recorded as **D13** in `openspec/changes/causal-json-format/design.md`: a Custom Text Editor over the `.causal.json` text, React Flow for interaction, ELK geometry shared with the export emitter, a live SVG preview pane, and surgical edits via `jsonc-parser`. That decision is not reopened here. What follows are the decisions D13 left underdetermined, which only surface once you actually write the editor.

Two existing guarantees constrain everything below. Round-trip preservation is a normative MUST in CausalJSON 0.1 §9.1 — a tool that reads and writes a document preserves every `x-` member and unrecognised block byte-identically. And layout lives only in `views[].layout`, never on variables, per D8.

## Goals / Non-Goals

**Goals**

- Visual editing that a text-first author, an agent, and git can all share without fighting.
- The canvas as a projection: nothing on screen is authoritative, the JSON is.
- Every risky layer testable without a running editor.

**Non-Goals**

- Format changes. If the canvas wants something CausalJSON cannot express, that is a finding for a later change.
- A general diagramming tool. The canvas edits causal models, not arbitrary shapes.
- Byte-identical WYSIWYG between canvas and figure. D13 accepted the gap and closes it with the preview pane instead.
- Reimplementing analysis. The extension surfaces what `@causal/core` already computes.

## Decisions

### E1 — Canvas edits are surgical text edits in a separate package

**Decision.** Every canvas action is translated into a `jsonc-parser` edit against the document text and applied as a `WorkspaceEdit`. That translation lives in a new `@causal/edits` package, not in the extension.

**Rationale.** D13 already forbids parse-mutate-reserialise, because it reformats the whole file on every drag and silently reorders keys — violating §9.1 and destroying diffs. What D13 did not say is *where* that logic lives. Putting it in the extension would make the single most breakable guarantee in the product testable only by hand in a running editor. As its own package it is tested headlessly against the same preservation fixtures the format uses.

Applying through `WorkspaceEdit` is also what buys undo, dirty state, and save behaviour for free — the editor treats a drag exactly like typing.

**Alternatives considered.** *Edits inside the extension* — fewer packages, rejected because it makes the preservation guarantee untestable. *A document-model abstraction that re-serialises* — far simpler to write, rejected outright by §9.1.

---

### E2 — A drag writes a pin into the active view, creating one if needed

**Decision.** Dragging a variable writes `views[active].layout.pin[id]`. If the document declares no views, the editor creates one named `default` and tells the author it did.

**Rationale.** D8 put layout in views precisely so that dragging does not dirty the semantic core, and there is nowhere else a coordinate may legally go. The awkward case is a document with no views at all — which is the *common* case for a model someone is sketching, since the minimal document is six lines.

Silently mutating a document's structure on a drag would be a surprise; refusing to drag would be worse. Creating the view and saying so is the honest middle. It is also exactly what the author needs next anyway: a view is what a figure is.

**Alternatives considered.** *Refuse to drag without a view* — coherent but hostile. *Hold positions in editor state until the author saves a view* — invisible work that vanishes on close. *Write coordinates onto variables* — reverses D8.

---

### E3 — The canvas is fed resolved geometry, not raw document

**Decision.** The extension resolves the view, computes ELK geometry, and sends the webview a flat, already-positioned scene. The webview does no layout and holds no document knowledge.

**Rationale.** This is what makes D13's shared-geometry invariant real rather than aspirational: the canvas cannot drift from the figure because it never computes its own positions. It also keeps ELK, the schema, and every dependency out of the webview bundle, and leaves the webview a pure view layer — which is the part that cannot be tested here, so it should hold as little logic as possible.

**Consequences.** Every document change costs a layout pass in the extension host. Layout is fast at causal-diagram sizes, and the alternative — incremental layout in the webview — is exactly the drift D13 set out to avoid.

---

### E4 — The webview protocol is a small typed message union

**Decision.** One `SceneMessage` from extension to webview; a closed union of intent messages back (`moveNode`, `addRelation`, `deleteVariable`, `deleteRelation`, `setLabel`, `setActiveView`, `ready`). Messages carry *intent*, never document fragments.

**Rationale.** Intent messages keep the authority in the extension: the webview says "the author dragged `smoking` to (120, 40)", not "here is the new document". A webview that could propose document content would be a second writer, and §9.1 would then depend on the untestable layer.

The union is exported as types shared by both sides and validated at the boundary, so a malformed message is a reported bug rather than a corrupted file.

---

### E5 — Diagnostics are recomputed on change and published per document

**Decision.** The extension lints on document change (debounced) and publishes to a single `DiagnosticCollection`, mapping each diagnostic's JSON Pointer to a range via the same `positionFor` used by the CLI.

**Rationale.** Reusing the CLI's location machinery means the editor and the terminal agree about where a problem is, which is the whole point of having put JSON Pointers on diagnostics. Project configuration is resolved per document, so a manuscript directory's publication gate shows up as errors in the editor exactly as it does in CI.

**Consequences.** Lint runs on every keystroke burst. Debouncing plus the fact that the analysis is bounded keeps this cheap; if it ever stops being cheap, the fix is incremental validation, not less validation.

---

### E6 — The preview renders the real emitter SVG in a webview

**Decision.** The preview pane displays exactly what `@causal/render` emits for the active view, refusing to render when the document has error-severity diagnostics.

**Rationale.** D13 accepted that React Flow will not look identical to the figure, and named the preview as the mitigation. That only works if the preview is the genuine artifact rather than a second approximation — so it calls the same emitter the CLI does.

Refusing on errors matters because the failure mode being avoided is shipping a figure that looks plausible and is wrong.

---

### E7 — Two esbuild bundles, CommonJS host and IIFE webview

**Decision.** `esbuild` produces a CommonJS bundle for the extension host and an IIFE bundle for the webview, with React and React Flow bundled in.

**Rationale.** The extension host is most compatible as CommonJS; the webview must be self-contained because a VS Code webview has no module resolution and no network. Bundling also means the extension ships with no runtime `node_modules`, which is what makes it packageable.

**Consequences.** The workspace's ESM packages are consumed by a CJS bundle. esbuild handles this, but it is why `apps/vscode` builds with esbuild rather than plain `tsc` like every other package.

---

### E8 — Schema association is contributed, not required in each document

**Decision.** The extension contributes a `jsonValidation` association for `**/*.causal.json` pointing at the bundled schema.

**Rationale.** A document that omits `$schema` should still get completion and validation — that is most sketches. Contributing the association means the plain-text experience works with zero ceremony, while a document that *does* declare `$schema` continues to work for every other tool.

## Risks / Trade-offs

**The UI layer cannot be tested in this environment** → Push everything testable out of it: edits into `@causal/edits`, geometry into `@causal/render`, diagnostics into `@causal/core`. What remains untested is rendering and pointer handling, verified by build and by manual smoke testing.

**A drag storm produces an edit storm** → Positions are written on drag *stop*, not during the drag, so one gesture is one undo step and one document edit.

**Creating a view on first drag surprises the author** → Announced explicitly when it happens, and it is an ordinary edit, so undo reverses it.

**Canvas and figure look different** → Accepted in D13; the preview pane closes the gap. Layout can never differ because of E3.

**Deleting a variable could leave dangling relations** → Deletion is one composite edit removing the variable and every relation naming it, so the document is never transiently invalid on disk.

**React Flow is a large dependency in a bundle** → MIT licensed, bundled once, and confined to the webview; the extension host bundle does not include it.

## Migration Plan

Additive. No existing artifact changes and no format version moves.

The extension is packaged as a `.vsix` from `apps/vscode`. Rollback is uninstalling it: `.causal.json` files remain ordinary JSON, editable by hand and by the CLI, because the format never depended on the editor.

## Open Questions

1. **Multi-select and group drag.** One variable at a time is enough to prove the loop; multi-select is additive and can land once the interaction has been used in anger.
2. **Editing quantitative layers on the canvas.** CPTs and equations have no canvas affordance. Deliberate: the internal shape of `cpt` is still reserved in the format, so building an editor for it now would guess.
3. **Where a new variable is placed.** Currently pinned near the viewport centre. Whether it should instead be left unpinned for the layout engine to place is a question real use will answer.
