import { useEffect, useRef, useState } from 'react';
import { Handle, Position, type EdgeProps, type NodeProps } from '@xyflow/react';
import type { SceneTheme } from '../src/protocol';

export interface CausalNodeData extends Record<string, unknown> {
  lines: string[];
  latent: boolean;
  role?: string;
  highlighted: boolean;
  problems: string[];
  theme: SceneTheme;
  onRename: (id: string, label: string) => void;
}

export function CausalNode({ id, data, selected }: NodeProps): JSX.Element {
  const { theme, lines, latent, role, highlighted, problems, onRename } = data as CausalNodeData;
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(lines.join(' '));
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => setDraft(lines.join(' ')), [lines]);
  useEffect(() => {
    if (editing) input.current?.focus();
  }, [editing]);

  const commit = (): void => {
    setEditing(false);
    const next = draft.trim();
    if (next && next !== lines.join(' ')) onRename(id, next);
  };

  return (
    <div
      className={`causal-node${latent ? ' latent' : ''}${problems.length > 0 ? ' problem' : ''}`}
      onDoubleClick={() => setEditing(true)}
      title={problems.join('\n') || undefined}
      style={{
        background: highlighted ? theme.highlightFill : theme.nodeFill,
        border: `${selected ? 2 : 1.5}px solid ${highlighted ? theme.highlightStroke : theme.nodeStroke}`,
        color: theme.nodeText,
        fontFamily: theme.fontFamily,
        fontSize: theme.fontSize,
      }}
    >
      <Handle type="target" position={Position.Left} />
      {editing ? (
        <input
          ref={input}
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onBlur={commit}
          onKeyDown={(event) => {
            if (event.key === 'Enter') commit();
            if (event.key === 'Escape') setEditing(false);
          }}
        />
      ) : (
        <span>
          {role ? <span className="role">{role}</span> : null}
          {lines.map((line, index) => (
            <span key={index} style={{ display: 'block' }}>
              {line}
            </span>
          ))}
        </span>
      )}
      <Handle type="source" position={Position.Right} />
    </div>
  );
}

export interface CausalEdgeData extends Record<string, unknown> {
  points: { x: number; y: number }[];
  kind: string;
  label?: string;
  status: string;
  highlighted: boolean;
  problems: string[];
  theme: SceneTheme;
}

const MARKERS: Record<string, { start?: string; end?: string }> = {
  directed: { end: 'arrow' },
  bidirected: { start: 'arrow', end: 'arrow' },
  'partially-directed': { start: 'odot', end: 'arrow' },
  nondirected: { start: 'odot', end: 'odot' },
  undirected: {},
};

/**
 * Edges are drawn through the points the host computed, so the canvas and the
 * exported figure route relations the same way.
 */
export function CausalEdge({
  id,
  data,
  sourceX,
  sourceY,
  targetX,
  targetY,
  selected,
}: EdgeProps): JSX.Element {
  const { points, kind, theme, highlighted, status, label, problems } = (data ??
    {}) as CausalEdgeData;
  const route =
    points && points.length >= 2
      ? [{ x: sourceX, y: sourceY }, ...points.slice(1, -1), { x: targetX, y: targetY }]
      : [
          { x: sourceX, y: sourceY },
          { x: targetX, y: targetY },
        ];
  const d = route.map((p, index) => `${index === 0 ? 'M' : 'L'}${p.x},${p.y}`).join(' ');
  const stroke = highlighted ? theme.highlightStroke : theme.edgeStroke;
  const markers = MARKERS[kind] ?? MARKERS['directed']!;
  const mid = route[Math.floor(route.length / 2)] ?? route[0]!;

  return (
    <g className={problems.length > 0 ? 'problem' : undefined}>
      <path
        id={id}
        d={d}
        fill="none"
        stroke={stroke}
        strokeWidth={selected ? 3 : highlighted ? 2.5 : 1.5}
        strokeDasharray={kind === 'bidirected' ? '6 4' : status === 'proposed' ? '3 3' : undefined}
        markerStart={markers.start ? `url(#cc-${markers.start})` : undefined}
        markerEnd={markers.end ? `url(#cc-${markers.end})` : undefined}
      />
      {label ? (
        <text
          x={mid.x}
          y={mid.y - 6}
          textAnchor="middle"
          fill={theme.edgeStroke}
          fontFamily={theme.fontFamily}
          fontSize={10}
        >
          {label}
        </text>
      ) : null}
    </g>
  );
}

/** Shared marker definitions, mounted once. */
export function EdgeMarkers({ theme }: { theme: SceneTheme }): JSX.Element {
  return (
    <svg style={{ position: 'absolute', width: 0, height: 0 }} aria-hidden>
      <defs>
        <marker
          id="cc-arrow"
          viewBox="0 0 10 10"
          refX="9"
          refY="5"
          markerWidth="7"
          markerHeight="7"
          orient="auto-start-reverse"
        >
          <path d="M0,0 L10,5 L0,10 z" fill={theme.edgeStroke} />
        </marker>
        <marker
          id="cc-odot"
          viewBox="0 0 10 10"
          refX="5"
          refY="5"
          markerWidth="6"
          markerHeight="6"
          orient="auto"
        >
          <circle
            cx="5"
            cy="5"
            r="3.2"
            fill={theme.background}
            stroke={theme.edgeStroke}
            strokeWidth="1.4"
          />
        </marker>
      </defs>
    </svg>
  );
}
