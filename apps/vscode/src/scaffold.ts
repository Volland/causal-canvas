import { CONTEXT_URL, FORMAT_VERSION, SCHEMA_URL, type ProfileName } from '@causal-canvas/spec';

export interface ScaffoldOptions {
  profile: ProfileName;
  title?: string;
}

/**
 * Build the text of a new model.
 *
 * A blank document would open onto an empty canvas and teach nothing, so each
 * profile gets a two-variable starter that demonstrates its point: an exposure
 * and an outcome for the acyclic profiles, a reinforcing pair for `cld`. Both
 * validate clean and are trivial to delete.
 *
 * Output is already in canonical form, so `causalc fmt` on a fresh document is
 * a no-op.
 */
// @lat: [[extension#Causal Canvas extension#Commands#Creating A Model]]
export function newModelDocument(options: ScaffoldOptions): string {
  const cyclic = options.profile === 'cld';

  const variables = cyclic
    ? [
        { id: 'effort', label: 'Effort' },
        { id: 'result', label: 'Result' },
      ]
    : [
        { id: 'exposure', label: 'Exposure', role: 'exposure' },
        { id: 'outcome', label: 'Outcome', role: 'outcome' },
      ];

  const relations = cyclic
    ? [
        { from: 'effort', to: 'result', sign: '+' },
        { from: 'result', to: 'effort', sign: '+' },
      ]
    : ['exposure -> outcome'];

  const document: Record<string, unknown> = {
    $schema: SCHEMA_URL,
    '@context': CONTEXT_URL,
    causal: FORMAT_VERSION,
    profile: options.profile,
    ...(options.title ? { meta: { title: options.title } } : {}),
    variables,
    relations,
    views: [
      {
        id: 'main',
        layout: { mode: 'auto', direction: cyclic ? 'TB' : 'LR' },
      },
    ],
  };

  return JSON.stringify(document, null, 2) + '\n';
}

/** Ensure a filename carries the extension that activates the editor. */
export function withCausalExtension(name: string): string {
  const trimmed = name.trim().replace(/\/+$/, '');
  if (trimmed.endsWith('.causal.json')) return trimmed;
  return `${trimmed.replace(/\.json$/, '').replace(/\.causal$/, '')}.causal.json`;
}

export const PROFILE_CHOICES: { profile: ProfileName; label: string; detail: string }[] = [
  {
    profile: 'dag',
    label: 'dag',
    detail: 'Directed acyclic graph. The usual starting point.',
  },
  {
    profile: 'admg',
    label: 'admg',
    detail: 'Adds bidirected edges for confounding you cannot measure.',
  },
  {
    profile: 'pag',
    label: 'pag',
    detail: 'Partial ancestral graph — the output of causal discovery.',
  },
  {
    profile: 'cld',
    label: 'cld',
    detail: 'Causal loop diagram. Feedback loops are legal here.',
  },
];
