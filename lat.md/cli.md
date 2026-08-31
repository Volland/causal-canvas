# Command Line

The surface through which people, continuous integration, and agents work with documents. It is built before any editor, because the manuscript build and CI need it and the editor does not need to exist for the format to be useful.

## Commands

Five commands, each a thin adapter over the core library, dispatched by [[packages/cli/src/index.ts#run]].

| Command | Purpose |
|---|---|
| `causalc validate` | schema, referential, and structural checks |
| `causalc lint` | the above plus configurable rules |
| `causalc fmt` | canonicalize, preserving content |
| `causalc render` | emit a figure from a named view |
| `causalc summarize` | compact a document for a bounded context window |

## Output Contract

Every command producing diagnostics offers structured output carrying rule identifier, severity, message, and JSON Pointer as discrete fields.

Structured output goes to standard output with nothing interleaved; progress and informational text goes to standard error. Mixing them is the classic failure that makes a tool unusable in a pipeline, because the consumer's parse breaks on a progress line.

## Exit Codes

Zero when no error-severity diagnostics were produced, non-zero when any were. Warnings alone do not fail a build unless the caller asks for it.

This is what lets a manuscript build gate on `causalc lint` without every hygiene warning blocking publication, while a project that wants stricter standards escalates them through [[validation#Validation#Rule Configuration|rule configuration]] rather than through a flag.

## Formatting Guarantees

`causalc fmt` is idempotent and preserving. Formatting twice produces no second change.

It preserves every `x-` member, every unrecognised reserved block, every view, and the author's choice of shorthand or object form per element. This is how the [[architecture#Architecture#Preservation Invariant]] is delivered without a mutation API — an agent edits freely, formatting restores canonical form, and unknown content survives by construction.

## Context Compression

[[packages/core/src/summarize.ts#summarize]] emits a document's structure using the format's own arrow shorthand, small enough to fit in a bounded context window.

```
smoking [exposure] -> tar -> cancer
genotype -> smoking ; genotype <-> cancer
... 197 more
```

A two-hundred-node model is thousands of JSON lines and will drown an agent. The terse authoring surface therefore doubles as the compression format — a designed-in property rather than a bolt-on. The summary re-parses as a valid model with the same variables and relations as its source.
