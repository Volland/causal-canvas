# Changelog

Notable changes to the Causal Canvas extension. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project
follows [semantic versioning](https://semver.org/spec/v2.0.0.html).

The specification, the `causalc` command line, and the `@causal-canvas/*`
libraries are versioned separately.

## [0.1.3] — 2026-08-31

### Fixed

- **The canvas never opened.** Opening a `.causal.json` file left the editor on
  an endless loading bar: no diagram, no way to edit one, no error, and nothing
  in the extension host log. The editor waited for the webview to acknowledge
  the first scene, but VS Code does not load a webview until the editor has
  finished resolving — each side waiting on the other. The scene is now handed
  over without waiting for delivery.

  This was the whole editor, so 0.1.2 was usable only as a linter and a
  renderer. A regression test now resolves the shipped bundle's editor against a
  webview that never acknowledges anything, which is the exact state VS Code
  holds it in.

## [0.1.2] — 2026-08-31

### Fixed

- **Every command was dead.** The extension failed to activate, which VS Code
  reports only as `command 'causalCanvas.newModel' not found`. esbuild had
  resolved a dependency to its UMD build, whose factory calls a passed-through
  `require()` that esbuild cannot follow, so the call survived into the bundle
  and threw the moment VS Code loaded it. The host bundle now prefers the
  statically analysable ESM build, and a test requires the shipped bundle and
  checks its `activate` export.

## [0.1.1] — 2026-08-31

### Added

- **New Causal Model** command, on the Command Palette, the Explorer folder
  menu, and File > New File. The editor activates only on `.causal.json`, so
  before this a first-time author had to know the required members before the
  tool would do anything for them.

  The starter is deliberately not empty: each profile gets a two-variable model
  demonstrating what that profile is for — an exposure and an outcome for the
  acyclic profiles, a real feedback loop for `cld`. A fresh model lints clean
  and is already in canonical form.

## [0.1.0] — 2026-08-31

First public release.

### Added

- **Visual editor** for CausalJSON models, as a custom editor over the file's
  text — so undo, dirty state, save, and version control behave exactly as they
  do for any other file. Drag to place, connect to relate, delete to remove;
  every gesture is a surgical edit to the JSON that leaves the rest of the
  document, including `x-` extensions, untouched.
- **Live linting** in the Problems panel, positioned at the element each
  diagnostic names. Beyond schema and structure it catches collider adjustment,
  invalid instruments, exposures with no causal path to the outcome,
  unidentifiable latents, and relations still marked `proposed`.
- **Figure rendering** to SVG, PDF, and PNG, plus a live preview of the real
  emitter output rather than a second approximation of it. The canvas and the
  exported figure share one layout pass, so they cannot disagree about
  placement.
- **Views**, so layout never dirties meaning and one model can define many
  figures; the active view is chosen per editor.
- **Four profiles** — `dag`, `admg`, `pag`, `cld` — with the drawable relation
  kinds following the profile the document declares.
- **Canonical formatting** and **Open in Text Editor**, for working on the JSON
  directly beside the canvas.
- Schema validation for `*.causal.json` contributed to VS Code's JSON support,
  bundled rather than fetched.

### Privacy

No telemetry, no analytics, no update ping. The schema and JSON-LD context ship
inside the extension, so everything works offline and on air-gapped machines.

[0.1.3]: https://github.com/Volland/causal-canvas/releases/tag/v0.1.3
[0.1.2]: https://github.com/Volland/causal-canvas/releases/tag/v0.1.2
[0.1.1]: https://github.com/Volland/causal-canvas/releases/tag/v0.1.1
[0.1.0]: https://github.com/Volland/causal-canvas/releases/tag/v0.1.0
