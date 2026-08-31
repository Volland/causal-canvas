# Interoperability

How CausalJSON reaches the existing causal-inference ecosystem. The format is positioned as a hub that feeds established tools, not as a replacement for their solvers.

## Ecosystem Position

The gap this format fills, and the tools it does not compete with.

| Format | Represents | Serialization | Carries causal semantics? |
|---|---|---|---|
| DAGitty model text | DAG / ADMG | bespoke DSL | yes — roles, bidirected edges, positions |
| DOT / GML | any graph | text | no |
| GraphML | any graph | XML | no |
| JSON Graph Format | any graph | JSON | no |
| XMLBIF / xdsl / net | Bayes net | XML | CPTs, but no causal role vocabulary |
| XMILE | system dynamics | XML | stocks and flows, not Pearl-causal |
| lavaan / Mplus | SEM | DSL | path coefficients |
| Mermaid / D2 | pictures | text | no |

DAGitty's text DSL is the de facto semantic standard and is not JSON. Everything JSON-native is a generic graph container with no causal meaning. DoWhy, the most widely used causal-inference library, accepts GML and DOT — so it too has no causal-semantic input format.

Two adjacent gaps compound this: there is no permissively licensed JavaScript or TypeScript implementation of d-separation and adjustment sets, and there was no VS Code extension for causal modelling at all.

## Import Targets

Import is best-effort and preserves everything representable, including positions where the source carries them.

DAGitty model text is the highest-value target, because it unlocks the entire R and epidemiology ecosystem and the existing corpus of models people have already drawn. DOT, GML, and GraphML follow.

## Export Targets

Export reaches other ecosystems by degrading to what they understand.

- **DAGitty model text** — drops into R's `dagitty` and `ggdag`, and into dagitty.net as a viewer.
- **DOT** and **GML** — GML is DoWhy's preferred input.
- **Mermaid** — renders in documentation and on GitHub for free.
- **R and Python snippets** — paste into a Quarto chunk so the manuscript runs real analysis reproducibly.
- **XMLBIF** and **lavaan** — emitted only when the corresponding [[format#CausalJSON#Quantitative Layers|quantitative layer]] is populated.

## Fidelity Contract

Export is lossy by construction, with a published loss table per target. There is no round-trip guarantee to any foreign format.

DOT cannot hold an [[format#CausalJSON#Assertion Provenance|assertion block]]; GML cannot hold a view. Promising fidelity that cannot be kept is how a format loses trust, so the contract states the loss rather than hiding it.

Language bindings are deliberately not part of this. One well-maintained TypeScript implementation beats several neglected ones, and the exporters already cover the ecosystem — lossily, but adequately. A native reader in another language is added only when demand is demonstrated.
