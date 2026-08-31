# Figure Rendering

Turns a named [[format#CausalJSON#Views|view]] into a publication figure. Figures are regenerable artifacts of the model, not hand-maintained drawings that drift from it.

The immediate consumer is a Quarto/Pandoc manuscript, so output is vector-first: SVG for HTML, vector PDF for print, raster PNG as a fallback.

## Render Pipeline

[[packages/render/src/layout.ts#computeLayout]] computes geometry once; [[packages/render/src/svg.ts#renderSvg]], [[packages/render/src/pdf.ts#renderPdf]], and [[packages/render/src/png.ts#renderPng]] consume it.

One geometry, many emitters. Rendering never screenshots a webview, because that would tie figure quality to a browser's CSS engine, which changes between versions and between machines.

```
        document + view id
                |
                v
      +---------------------+
      | view resolution     |  subset, status filter, highlights, theme
      +----------+----------+
                 |
                 v
      +---------------------+
      | elk layout solver   |  honours pins and rank hints
      |  -> absolute coords |
      +----------+----------+
                 |
     +-----------+-----------+-----------+
     v           v           v           v
   +-----+    +-----+     +-----+     +---------+
   | SVG |    | PDF |     | PNG |     | canvas  |
   |     |    |     |     |resvg|     |ReactFlow|
   +-----+    +-----+     +-----+     +---------+
     |
     +-- identical bytes from CLI, extension, and CI
```

Because emission is pure, the same figure comes out of a developer's machine, the manuscript build, and continuous integration. No browser, no display, no network.

## View Resolution

A view is applied in a fixed order: element subset, then assertion-status filter, then layout, then highlights, then theme. A view omitting a subset renders the whole model.

```
  fig-3-1   include: [smoking, tar, cancer]          theme: book-bw
  fig-3-2   include: *  filter: status = accepted    theme: book-bw
  fig-3-3   include: *  highlight: backdoor paths    theme: book-bw
```

Two capabilities here have no equivalent in a drawn diagram. Status filtering renders the publication figure from vouched-for edges while speculative ones stay in the document. Computed highlights are resolved at render time by the analysis engine, so changing the graph updates what a figure emphasises — which is why analysis precedes the canvas in [[architecture#Architecture#Delivery Phases]].

Relations are included only when both endpoints survive the subset. Requesting an undeclared view is an error listing the views that do exist.

## Layout Model

Automatic placement, explicit coordinate pins, and any mixture of the two. This is the mode a book author actually works in.

Layout cannot be avoided entirely. Causal diagrams have strong presentational conventions — exposure left, outcome right, confounders above, mediators between — that general graph layout reliably violates, and publication work needs pixel control.

Mixing solves the churn problem: pin the two variables carrying the figure's argument, let the solver place the rest. **Adding an unpinned variable never moves a pinned one**, so growing a model does not invalidate every hand-placed coordinate.

## Output Targets

Vector for web, vector for print, raster at a caller-specified resolution.

Raster and print output must be self-contained with respect to fonts — either embedded or converted to outlines. Otherwise a figure renders with fallback fonts on any machine lacking the fonts used at render time, which surfaces as a typography defect in the finished book rather than as an error anyone notices in time.

## Themes

Themes are selected by name and resolved by [[packages/render/src/theme.ts#resolveTheme]]. Built-ins ship with the renderer; a project may define or override themes in its configuration.

An unknown theme name is reported rather than silently substituted, because a silently substituted theme produces a figure that looks plausible and is wrong. The `book-bw` theme is the manuscript target: black and white, no shadows, typography matched to the book.

## Determinism

Rendering the same document and view with the same tool version produces byte-identical output.

This is a tested property, not an aspiration. It is what makes figures reviewable in a pull request and what lets the manuscript build regenerate every figure without producing spurious diffs.
