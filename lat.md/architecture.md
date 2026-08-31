# Architecture

One core library with thin adapters. The VS Code extension is one front end among several, not the centre — which is what keeps [[format#CausalJSON|the format]] the asset rather than the editor.

## Package Topology

A pnpm monorepo. The specification is a first-class package alongside the code that implements it, licensed separately.

```
   spec/  -- CausalJSON specification, JSON Schema, @context        CC-BY-4.0
       |
       +----------------+----------------+----------------+
       |                |                |                |
   packages/core   packages/       packages/         packages/       Apache-2.0
                   analysis        render            cli
   parse           d-separation    elk layout        causal validate
   normalize       backdoor        svg / pdf         causal lint
   validate        adjustment sets png (resvg)       causal fmt
   lint            implications                      causal render
       |                |                |           causal summarize
       |                |                |                |
       +----------------+----------------+----------------+
                                |
                  one core, thin adapters
                                |
              +-----------------+-----------------+
              |                                   |
        packages/mcp                        apps/vscode
        MCP server for                      Causal Canvas
        portable agents                     React Flow custom text editor
```

Implemented today: `spec/` ([[spec/src/index.ts#ARROW_PATTERN|bundled artifacts]]),
[[packages/core/src/index.ts|@causal/core]], [[packages/render/src/index.ts#render|@causal/render]],
[[packages/cli/src/index.ts#run|@causal/cli]], [[packages/edits/src/index.ts#pinVariable|@causal/edits]],
and the [[extension#Causal Canvas extension|Causal Canvas extension]]. `packages/analysis` and
`packages/mcp` are planned, not built.

Licensing is deliberate. Code is Apache-2.0 rather than MIT for the explicit patent grant, which is what makes corporate legal departments comfortable adopting a format. The specification text is CC-BY-4.0. Notably the project must not link dagitty's GPL-2 JavaScript — see [[decisions#Design Decisions#D9 Original Analysis Engine]].

## Data Flow

Every entry point runs the same pipeline. Nothing bypasses normalization, which is what makes [[format#CausalJSON#Extensibility|round-trip preservation]] achievable at all.

```
  .causal.json
       |
       v
   +--------+     +-----------+     +----------+     +--------+
   | parse  |---->| normalize |---->| validate |---->|  lint  |
   |        |     | shorthand |     | schema + |     | config-|
   | with   |     | -> canon  |     | refs +   |     | urable |
   | pointer|     |           |     | structure|     | rules  |
   | tracking     +-----------+     +----------+     +--------+
   +--------+           |                                 |
                        |                                 v
                        |                            diagnostics
                        |                            (rule, severity,
                        |                             message, pointer)
                        v
                 +-------------+
                 | elk layout  |  <- one geometry, computed once
                 +------+------+
                        |
        +---------------+---------------+
        v                               v
  +-----------+                  +--------------+
  | emitters  |                  | React Flow   |
  | svg / pdf |                  | canvas       |
  | / png     |                  | (interactive)|
  +-----------+                  +--------------+
```

## Shared Geometry Invariant

Layout is computed once and consumed by both the interactive canvas and the export emitters. This is the invariant that keeps the editor and the published figure from disagreeing.

Geometry therefore never drifts between what an author sees and what lands in the book; only styling differs, which theming and a live preview pane close. The alternative — letting each renderer lay out independently — produces the "it looked right in the editor" failure that makes diagram tools untrustworthy for publication work.

## Preservation Invariant

Any tool that reads and writes a document preserves every unknown `x-` member, every unrecognised reserved block, and every view, byte-identically.

[[packages/core/src/format.ts#formatDocument]] delivers this today by re-emitting the *source*
value rather than the normalized document, so key order, `x-` members, and each element's
shorthand-or-object form survive.

For the canvas this has a hard implementation consequence: edits are applied as **surgical text edits** against the JSON syntax tree, never by parsing to an object, mutating, and reserialising. Reserialising reformats the whole file on every node drag, destroying diffs and silently reordering keys — the single most common way custom JSON editors become unusable in version control.

The VS Code integration is a **Custom Text Editor**, so the document genuinely is the `.causal.json` text. Undo and redo come for free, text and canvas open side by side on one file, and version control behaves normally.

## Public Website

`docs/` holds the GitHub Pages site: a landing page in English and the German legal pages required of a German operator — Impressum, Datenschutzerklärung, and Nutzungsbedingungen.

One constraint on it is not cosmetic. The site claims that the project tracks nothing, so **the site itself must load zero external resources**: no web fonts, no CDN, no analytics, no embedded third-party content. Everything is served from the same origin, which is what makes the claim true rather than aspirational — and what means no cookie banner is needed under § 25 TDDDG.

The privacy claim about the *software* rests on [[format#CausalJSON#Document Identity|bundled schema and context]]: validation and rendering never touch the network, so models never leave the machine.

## Delivery Phases

The build order is chosen to test the riskiest assumption first: that this JSON is pleasant to author by hand. Everything else sits downstream of it.

```
  Phase 1  VERTICAL SLICE           <- validates the format itself
           spec -> schema -> hand-write 4 real models
                -> core -> elk + svg -> one figure in the manuscript

  Phase 2  ANALYSIS ENGINE          <- unblocks lints AND computed highlights
           d-separation, backdoor, adjustment sets, implications

  Phase 3  CANVAS                   <- DONE, see [[extension#Causal Canvas extension]]
           React Flow custom text editor

  Phase 4  EXPORTERS                <- ecosystem reach
           dagitty, DOT, GML, Mermaid, snippets

  Phase 5  AGENT ADAPTERS
           MCP server, VS Code Language Model Tools
```

Phase 1 deliberately ends by publishing the namespace, because nothing external depends on the URLs until then and they become immutable once live. Analysis precedes the canvas because it unblocks both the [[validation#Validation#Causal Rules|causal lint rules]] and the computed highlights that [[rendering#Figure Rendering#View Resolution|views]] depend on.
