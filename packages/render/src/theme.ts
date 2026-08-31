/** Visual tokens for a figure. Themes are named; projects may override them. */
export interface Theme {
  name: string;
  background: string;
  padding: number;
  node: {
    fill: string;
    stroke: string;
    strokeWidth: number;
    radius: number;
    paddingX: number;
    paddingY: number;
    minWidth: number;
    minHeight: number;
    fontFamily: string;
    fontSize: number;
    /** Line spacing as a multiple of font size. */
    lineHeight: number;
    /** Labels longer than this wrap instead of widening the node. */
    maxLabelChars: number;
    textColor: string;
    /** Latent variables are drawn with a dashed border by convention. */
    latentDash: string;
  };
  edge: {
    stroke: string;
    strokeWidth: number;
    fontFamily: string;
    fontSize: number;
    labelColor: string;
    /** Bidirected edges denote unmeasured confounding. */
    bidirectedDash: string;
  };
  highlight: {
    nodeFill: string;
    nodeStroke: string;
    nodeStrokeWidth: number;
    edgeStroke: string;
    edgeStrokeWidth: number;
  };
}

const base: Theme = {
  name: 'default',
  background: '#ffffff',
  padding: 24,
  node: {
    fill: '#ffffff',
    stroke: '#1f2933',
    strokeWidth: 1.5,
    radius: 4,
    paddingX: 14,
    paddingY: 10,
    minWidth: 64,
    minHeight: 34,
    fontFamily: 'Helvetica, Arial, sans-serif',
    fontSize: 13,
    lineHeight: 1.25,
    maxLabelChars: 18,
    textColor: '#1f2933',
    latentDash: '5 3',
  },
  edge: {
    stroke: '#1f2933',
    strokeWidth: 1.4,
    fontFamily: 'Helvetica, Arial, sans-serif',
    fontSize: 11,
    labelColor: '#52606d',
    bidirectedDash: '6 4',
  },
  highlight: {
    nodeFill: '#fff3bf',
    nodeStroke: '#b8860b',
    nodeStrokeWidth: 2.5,
    edgeStroke: '#b8860b',
    edgeStrokeWidth: 2.5,
  },
};

/** Black and white, serif, no fills — the manuscript target. */
const bookBw: Theme = {
  ...base,
  name: 'book-bw',
  node: {
    ...base.node,
    fill: '#ffffff',
    stroke: '#000000',
    strokeWidth: 1.2,
    textColor: '#000000',
    fontFamily: 'Times, "Times New Roman", serif',
    fontSize: 15,
    lineHeight: 1.2,
    maxLabelChars: 14,
    paddingX: 12,
    paddingY: 9,
  },
  edge: {
    ...base.edge,
    stroke: '#000000',
    strokeWidth: 1.1,
    labelColor: '#000000',
    fontFamily: 'Times, "Times New Roman", serif',
  },
  highlight: {
    nodeFill: '#e6e6e6',
    nodeStroke: '#000000',
    nodeStrokeWidth: 2.4,
    edgeStroke: '#000000',
    edgeStrokeWidth: 2.4,
  },
};

const dark: Theme = {
  ...base,
  name: 'dark',
  background: '#12161c',
  node: { ...base.node, fill: '#1c2530', stroke: '#8fa3b8', textColor: '#e6edf3' },
  edge: { ...base.edge, stroke: '#8fa3b8', labelColor: '#a9b6c4' },
  highlight: {
    nodeFill: '#3a2f12',
    nodeStroke: '#e3b341',
    nodeStrokeWidth: 2.5,
    edgeStroke: '#e3b341',
    edgeStrokeWidth: 2.5,
  },
};

export const BUILT_IN_THEMES: Record<string, Theme> = {
  default: base,
  'book-bw': bookBw,
  dark,
};

function mergeSection<T extends object>(target: T, patch: unknown): T {
  if (patch === null || typeof patch !== 'object') return target;
  return { ...target, ...(patch as object) } as T;
}

export class UnknownThemeError extends Error {
  constructor(
    readonly requested: string,
    readonly available: string[],
  ) {
    super(
      `unknown theme \`${requested}\`; available themes are ${available.map((n) => `\`${n}\``).join(', ')}`,
    );
    this.name = 'UnknownThemeError';
  }
}

/**
 * Resolve a theme by name. An unknown name is an error rather than a silent
 * substitution, because a substituted theme produces a figure that looks
 * plausible and is wrong.
 */
// @lat: [[rendering#Figure Rendering#Themes]]
export function resolveTheme(
  name: string | undefined,
  overrides: Record<string, Record<string, unknown>> = {},
): Theme {
  const requested = name ?? 'default';
  const patch = overrides[requested];
  const builtIn = BUILT_IN_THEMES[requested];

  if (!builtIn && !patch) {
    throw new UnknownThemeError(
      requested,
      [...new Set([...Object.keys(BUILT_IN_THEMES), ...Object.keys(overrides)])].sort(),
    );
  }

  const start = builtIn ?? BUILT_IN_THEMES['default']!;
  if (!patch) return start;

  return {
    ...start,
    ...(patch as Partial<Theme>),
    name: requested,
    node: mergeSection(start.node, (patch as any).node),
    edge: mergeSection(start.edge, (patch as any).edge),
    highlight: mergeSection(start.highlight, (patch as any).highlight),
  };
}
