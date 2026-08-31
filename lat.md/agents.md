# Agent Integration

How language models author, revise, and reason about causal models. "Agent-friendly" here is a structural property of [[format#CausalJSON|the format]], not a marketing claim about the tooling.

Three things make it real: identifiers a model can name, errors a model can act on, and a standing marker that separates what a model proposed from what a person vouched for.

## Tool Surface

Tools expose what agents cannot compute. There is no mutation API.

```
   causal_lint(file)                 -> located diagnostics
   causal_validate(file)             -> schema + semantic errors
   causal_backdoor(file, X, Y)       -> minimal adjustment sets
   causal_dsep(file, X, Y, given[])  -> verdict + blocking path
   causal_implications(file)         -> testable independencies
   causal_render(file, view)         -> figure regeneration
   causal_summarize(file)            -> compressed model
   causal_fmt(file)                  -> canonicalize, preserving
```

The reasoning is behavioural. Modern coding agents are excellent at editing JSON and poor at remembering bespoke mutation APIs, so `add_relation` would compete with a capability they already have and prefer. They are, by contrast, structurally incapable of computing d-separation or a minimal adjustment set by reasoning — that is the gap a tool actually fills.

The same core reaches agents three ways: the [[cli#Command Line|CLI]], an MCP server for portable agents, and VS Code Language Model Tools for agent mode inside the editor. All three are thin adapters.

## Self-Correction Loop

An agent writes a document, receives precisely located diagnostics, and corrects the specific member that was wrong.

```
   agent writes  ->  causalc lint  ->  { rule, severity, message,
                                        pointer: /relations/7/kind }
        ^                                          |
        +---------- surgical correction -----------+
```

Two design decisions exist to protect this loop. Arrow shorthand carries a regex `pattern` rather than relying on a schema union, because a `oneOf` failure reports "must match exactly one schema" — useless for correction. And the core schema is closed to unknown members, so `"exposre"` is rejected rather than silently ignored; an open schema would let a typo pass and produce a subtly wrong model. See [[format#CausalJSON#Extensibility]].

## Assertion Review Workflow

The workflow the format is built to support: an agent proposes many edges, a person reviews them, and the document records which is which at every moment.

```
   agent reads 40 papers -> proposes 60 edges -> review -> 22 survive
                                  |
                  the document now holds three kinds of claim:
        +-------------------+-----------------+------------------+
        v                   v                 v
   author-asserted     agent-proposed,   agent-proposed,
   from domain         accepted          not yet reviewed
   knowledge
```

Three capabilities follow from [[format#CausalJSON#Assertion Provenance|recording standing on each relation]].

- **A review gate.** `causalc lint` can fail a build while any relation is still `proposed`, so a half-reviewed model cannot silently reach print.
- **Status-filtered figures.** A view renders from accepted edges while speculative ones remain in the document rather than being deleted and lost.
- **Reviewable contributions.** An agent's change becomes a diff that flips status on twenty-two relations and removes thirty-eight, instead of an opaque rewrite nobody can audit.

Provenance attaches to the *assertion*, never to the causal claim — the distinction described in [[format#CausalJSON#JSON-LD Binding#Vocabulary Alignment]].
