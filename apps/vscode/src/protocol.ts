/**
 * The webview protocol.
 *
 * The host sends a fully positioned scene; the webview sends back *intent*,
 * never document content. Keeping authority in the host is what stops the
 * webview becoming a second writer to the file, which would put the round-trip
 * preservation guarantee inside the one layer that cannot be tested headlessly.
 */

export interface SceneNode {
  id: string;
  lines: string[];
  /** Centre coordinates, in document space. */
  x: number;
  y: number;
  width: number;
  height: number;
  latent: boolean;
  role?: string;
  highlighted: boolean;
  pinned: boolean;
  problems: string[];
}

export interface SceneEdge {
  id: string;
  from: string;
  to: string;
  kind: string;
  label?: string;
  status: string;
  points: { x: number; y: number }[];
  highlighted: boolean;
  problems: string[];
}

export interface SceneTheme {
  background: string;
  nodeFill: string;
  nodeStroke: string;
  nodeText: string;
  edgeStroke: string;
  fontFamily: string;
  fontSize: number;
  highlightFill: string;
  highlightStroke: string;
}

export interface Scene {
  type: 'scene';
  profile: string;
  activeView: string;
  views: { id: string; title?: string }[];
  nodes: SceneNode[];
  edges: SceneEdge[];
  theme: SceneTheme;
  /** Human-readable problems, most severe first. */
  problems: { rule: string; severity: string; message: string }[];
  /** Set when the document text does not currently parse. */
  staleReason?: string;
}

export type Intent =
  | { type: 'ready' }
  | { type: 'moveNode'; id: string; x: number; y: number }
  | { type: 'addRelation'; from: string; to: string; kind: string }
  | { type: 'addVariable'; id: string; label?: string; x: number; y: number }
  | { type: 'deleteVariable'; id: string }
  | { type: 'deleteRelation'; id: string }
  | { type: 'setLabel'; id: string; label: string }
  | { type: 'setActiveView'; viewId: string };

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

const str = (value: unknown): value is string => typeof value === 'string' && value.length > 0;
const num = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

/**
 * Validate a message at the boundary. A malformed message is a reported bug,
 * never a document edit.
 */
// @lat: [[extension#Causal Canvas extension#The Scene Protocol]]
export function parseIntent(message: unknown): Intent | undefined {
  if (!isRecord(message) || !str(message['type'])) return undefined;
  const m = message as Record<string, unknown>;
  switch (m['type']) {
    case 'ready':
      return { type: 'ready' };
    case 'moveNode':
      return str(m['id']) && num(m['x']) && num(m['y'])
        ? { type: 'moveNode', id: m['id'], x: m['x'], y: m['y'] }
        : undefined;
    case 'addRelation':
      return str(m['from']) && str(m['to']) && str(m['kind'])
        ? { type: 'addRelation', from: m['from'], to: m['to'], kind: m['kind'] }
        : undefined;
    case 'addVariable':
      return str(m['id']) && num(m['x']) && num(m['y'])
        ? {
            type: 'addVariable',
            id: m['id'],
            ...(str(m['label']) ? { label: m['label'] } : {}),
            x: m['x'],
            y: m['y'],
          }
        : undefined;
    case 'deleteVariable':
      return str(m['id']) ? { type: 'deleteVariable', id: m['id'] } : undefined;
    case 'deleteRelation':
      return str(m['id']) ? { type: 'deleteRelation', id: m['id'] } : undefined;
    case 'setLabel':
      return str(m['id']) && typeof m['label'] === 'string'
        ? { type: 'setLabel', id: m['id'], label: m['label'] }
        : undefined;
    case 'setActiveView':
      return str(m['viewId']) ? { type: 'setActiveView', viewId: m['viewId'] } : undefined;
    default:
      return undefined;
  }
}
