# Conformance suite

Normative for diagnostic rule identifiers and locations. Each document under
`invalid/` has a sibling `.expected.json` listing the diagnostics a conforming
implementation must produce; documents under `valid/` must produce no
error-severity diagnostics from the core layers.

Round-trip fixtures live in `preserve/`: reading and writing one of these must
return every `x-` member and unrecognised block unchanged.
