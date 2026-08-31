import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Background,
  Controls,
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
  type Edge,
  type Node,
  type OnConnect,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import './canvas.css';
import type { Intent, Scene } from '../src/protocol';
import { CausalEdge, CausalNode, EdgeMarkers } from './nodes';

declare const acquireVsCodeApi: () => { postMessage(message: unknown): void };
const vscode = acquireVsCodeApi();
const send = (intent: Intent): void => vscode.postMessage(intent);

const KINDS_BY_PROFILE: Record<string, string[]> = {
  dag: ['directed'],
  admg: ['directed', 'bidirected'],
  pag: ['directed', 'bidirected', 'undirected', 'partially-directed', 'nondirected'],
  cld: ['directed'],
};

const nodeTypes = { causal: CausalNode };
const edgeTypes = { causal: CausalEdge };

function Canvas({ scene }: { scene: Scene }): JSX.Element {
  const { screenToFlowPosition } = useReactFlow();
  const [kind, setKind] = useState('directed');
  const [newId, setNewId] = useState('');

  const kinds = KINDS_BY_PROFILE[scene.profile] ?? ['directed'];
  useEffect(() => {
    if (!kinds.includes(kind)) setKind(kinds[0] as string);
  }, [scene.profile]);

  const onRename = useCallback(
    (id: string, label: string) => send({ type: 'setLabel', id, label }),
    [],
  );

  // Positions come from the host. React Flow anchors at the top-left; the
  // scene carries centres, because that is what the figure emitter uses.
  const nodes: Node[] = useMemo(
    () =>
      scene.nodes.map((node) => ({
        id: node.id,
        type: 'causal',
        position: { x: node.x - node.width / 2, y: node.y - node.height / 2 },
        width: node.width,
        height: node.height,
        data: {
          lines: node.lines,
          latent: node.latent,
          role: node.role,
          highlighted: node.highlighted,
          problems: node.problems,
          theme: scene.theme,
          onRename,
        },
      })),
    [scene, onRename],
  );

  const edges: Edge[] = useMemo(
    () =>
      scene.edges.map((edge) => ({
        id: edge.id,
        source: edge.from,
        target: edge.to,
        type: 'causal',
        data: {
          points: edge.points,
          kind: edge.kind,
          label: edge.label,
          status: edge.status,
          highlighted: edge.highlighted,
          problems: edge.problems,
          theme: scene.theme,
        },
      })),
    [scene],
  );

  const onConnect: OnConnect = useCallback(
    (connection) => {
      if (!connection.source || !connection.target) return;
      send({ type: 'addRelation', from: connection.source, to: connection.target, kind });
    },
    [kind],
  );

  const addVariable = (): void => {
    const id = newId.trim();
    if (!/^[A-Za-z_][A-Za-z0-9_.-]*$/.test(id)) return;
    const centre = screenToFlowPosition({ x: window.innerWidth / 2, y: window.innerHeight / 2 });
    send({ type: 'addVariable', id, x: Math.round(centre.x), y: Math.round(centre.y) });
    setNewId('');
  };

  const errors = scene.problems.filter((problem) => problem.severity === 'error');

  return (
    <div className="shell">
      <div className="toolbar">
        <label htmlFor="view">View</label>
        <select
          id="view"
          value={scene.activeView}
          onChange={(event) => send({ type: 'setActiveView', viewId: event.target.value })}
          disabled={scene.views.length === 0}
        >
          {scene.views.length === 0 ? <option>{scene.activeView || 'whole model'}</option> : null}
          {scene.views.map((view) => (
            <option key={view.id} value={view.id}>
              {view.title ? `${view.id} — ${view.title}` : view.id}
            </option>
          ))}
        </select>

        <label htmlFor="kind">Draw</label>
        <select id="kind" value={kind} onChange={(event) => setKind(event.target.value)}>
          {kinds.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>

        <input
          aria-label="New variable identifier"
          placeholder="new variable id"
          value={newId}
          onChange={(event) => setNewId(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') addVariable();
          }}
        />
        <button onClick={addVariable}>Add</button>

        <span className="spacer" />
        <span className="profile">
          profile {scene.profile}
          {errors.length > 0 ? ` · ${errors.length} error${errors.length === 1 ? '' : 's'}` : ''}
        </span>
      </div>

      {scene.staleReason ? (
        <div className="banner">
          Showing the last valid state — the document does not parse: {scene.staleReason}
        </div>
      ) : null}

      <div className="canvas">
        <EdgeMarkers theme={scene.theme} />
        <ReactFlow
          nodes={nodes}
          edges={edges}
          nodeTypes={nodeTypes}
          edgeTypes={edgeTypes}
          onConnect={onConnect}
          onNodeDragStop={(_event, node) =>
            send({
              type: 'moveNode',
              id: node.id,
              // Back to centre coordinates, which is what a pin records.
              x: Math.round(node.position.x + (node.width ?? 0) / 2),
              y: Math.round(node.position.y + (node.height ?? 0) / 2),
            })
          }
          onNodesDelete={(deleted) => {
            for (const node of deleted) send({ type: 'deleteVariable', id: node.id });
          }}
          onEdgesDelete={(deleted) => {
            for (const edge of deleted) send({ type: 'deleteRelation', id: edge.id });
          }}
          fitView
          proOptions={{ hideAttribution: false }}
        >
          <Background />
          <Controls />
        </ReactFlow>
      </div>
    </div>
  );
}

export function App(): JSX.Element {
  const [scene, setScene] = useState<Scene>();

  useEffect(() => {
    const listener = (event: MessageEvent): void => {
      const message = event.data as Scene | undefined;
      if (message?.type === 'scene') setScene(message);
    };
    window.addEventListener('message', listener);
    send({ type: 'ready' });
    return () => window.removeEventListener('message', listener);
  }, []);

  if (!scene) return <div style={{ padding: 16 }}>Loading model…</div>;
  return (
    <ReactFlowProvider>
      <Canvas scene={scene} />
    </ReactFlowProvider>
  );
}
