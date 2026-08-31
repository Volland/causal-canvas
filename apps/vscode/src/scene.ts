import { lint, resolveConfig, type CanonicalDocument, type ResolvedConfig } from '@causal/core';
import {
  computeLayout,
  findView,
  resolveTheme,
  resolveView,
  UnknownThemeError,
  UnknownViewError,
} from '@causal/render';
import type { Scene, SceneEdge, SceneNode } from './protocol.js';

export interface SceneBuild {
  scene?: Scene;
  document?: CanonicalDocument;
  /** Set when the text does not parse, or the view or theme cannot be resolved. */
  problem?: string;
}

/**
 * Resolve the view, compute geometry, and flatten it into a scene.
 *
 * All of this happens in the extension host. The webview receives positions and
 * never computes its own, which is what guarantees the canvas and the exported
 * figure can never disagree about placement.
 */
// @lat: [[extension#Causal Canvas extension#Editor Architecture]]
export async function buildScene(
  text: string,
  activeViewId: string | undefined,
  config: ResolvedConfig = resolveConfig(undefined),
): Promise<SceneBuild> {
  const analysis = lint(text, { config });
  if (!analysis.document) {
    return { problem: analysis.diagnostics[0]?.message ?? 'document does not parse' };
  }

  const document = analysis.document;
  let view;
  try {
    view = findView(document, activeViewId);
  } catch (cause) {
    if (cause instanceof UnknownViewError) return { document, problem: cause.message };
    throw cause;
  }

  let theme;
  try {
    theme = resolveTheme(view.theme, config.themes);
  } catch (cause) {
    if (cause instanceof UnknownThemeError) return { document, problem: cause.message };
    throw cause;
  }

  const resolved = resolveView(document, view);
  const layout = await computeLayout(resolved, theme);

  const problemsByPointer = new Map<string, string[]>();
  for (const diagnostic of analysis.diagnostics) {
    const list = problemsByPointer.get(diagnostic.pointer) ?? [];
    list.push(`${diagnostic.rule}: ${diagnostic.message}`);
    problemsByPointer.set(diagnostic.pointer, list);
  }
  const problemsFor = (kind: 'variables' | 'relations', index: number): string[] =>
    problemsByPointer.get(`/${kind}/${index}`) ?? [];

  const nodes: SceneNode[] = layout.nodes.map((node) => ({
    id: node.id,
    lines: node.lines,
    x: node.x,
    y: node.y,
    width: node.width,
    height: node.height,
    latent: node.variable.latent === true,
    ...(node.variable.role ? { role: node.variable.role } : {}),
    highlighted: node.highlighted,
    pinned: node.pinned,
    problems: problemsFor(
      'variables',
      document.variables.findIndex((variable) => variable.id === node.id),
    ),
  }));

  const edges: SceneEdge[] = layout.edges.map((edge) => ({
    id: edge.id,
    from: edge.relation.from,
    to: edge.relation.to,
    kind: edge.relation.kind,
    ...(typeof edge.relation.label === 'string' ? { label: edge.relation.label } : {}),
    status: edge.relation.assertion?.status ?? 'accepted',
    points: edge.points,
    highlighted: edge.highlighted,
    problems: problemsFor(
      'relations',
      document.relations.findIndex((relation) => relation.id === edge.id),
    ),
  }));

  return {
    document,
    scene: {
      type: 'scene',
      profile: document.profile,
      activeView: view.id,
      views: document.views.map((v) => ({ id: v.id, ...(v.title ? { title: v.title } : {}) })),
      nodes,
      edges,
      theme: {
        background: theme.background,
        nodeFill: theme.node.fill,
        nodeStroke: theme.node.stroke,
        nodeText: theme.node.textColor,
        edgeStroke: theme.edge.stroke,
        fontFamily: theme.node.fontFamily,
        fontSize: theme.node.fontSize,
        highlightFill: theme.highlight.nodeFill,
        highlightStroke: theme.highlight.nodeStroke,
      },
      problems: analysis.diagnostics.map((d) => ({
        rule: d.rule,
        severity: d.severity,
        message: d.message,
      })),
    },
  };
}
