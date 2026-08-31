export * from './types.js';
export { parseDocument, type ParsedDocument } from './parse.js';
export { normalize, deriveRelationId, type NormalizeResult } from './normalize.js';
export { CausalGraph } from './graph.js';
export {
  validateSchema,
  validateVersion,
  validateReferences,
  validateStructure,
} from './validate.js';
export { RULES, type Rule, type RuleContext, type RuleFinding } from './rules.js';
export {
  loadConfig,
  resolveConfig,
  findConfig,
  CONFIG_FILENAME,
  type CausalConfig,
  type ResolvedConfig,
} from './config.js';
export {
  analyze,
  validate,
  lint,
  hasErrors,
  type AnalysisOptions,
  type AnalysisResult,
} from './lint.js';
export { fix, type FixResult } from './fix.js';
export { formatDocument } from './format.js';
export { summarize, type SummarizeOptions } from './summarize.js';
// JSON-LD lifting is deliberately NOT re-exported here. It pulls a network-capable
// document loader, which has no place in a consumer that only parses and validates.
// Import it from `@vpavlyshyn/core/ld` when you actually want RDF.
export {
  pointerToSegments,
  toPointer,
  resolvePointer,
  toSourcePointer,
  positionFor,
} from './pointer.js';
