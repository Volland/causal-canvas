export { BUILT_IN_THEMES, resolveTheme, UnknownThemeError, type Theme } from './theme.js';
export {
  findView,
  resolveView,
  UnknownViewError,
  DEFAULT_VIEW,
  type ResolvedView,
} from './resolve.js';
export {
  computeLayout,
  type Layout,
  type LaidOutNode,
  type LaidOutEdge,
  type Point,
} from './layout.js';
export { renderSvg } from './svg.js';
export { renderPdf, type PdfOptions } from './pdf.js';
export { renderPng, RasterizerUnavailableError, type PngOptions } from './png.js';
export { borderPoint } from './geometry.js';

import type { CanonicalDocument } from '@causal/core';
import { computeLayout, type Layout } from './layout.js';
import { findView, resolveView } from './resolve.js';
import { renderSvg } from './svg.js';
import { renderPdf } from './pdf.js';
import { renderPng, type PngOptions } from './png.js';
import { resolveTheme, type Theme } from './theme.js';

export type OutputFormat = 'svg' | 'pdf' | 'png';

export interface RenderOptions {
  view?: string;
  format?: OutputFormat;
  /** Project theme overrides, from `causal.config.json`. */
  themes?: Record<string, Record<string, unknown>>;
  png?: PngOptions;
}

export interface RenderResult {
  format: OutputFormat;
  viewId: string;
  theme: Theme;
  layout: Layout;
  /** SVG text, or the binary payload for pdf and png. */
  content: string | Uint8Array;
}

/**
 * Render a named view. Every format derives from one computed geometry, so
 * element positions are identical across outputs.
 */
export async function render(
  document: CanonicalDocument,
  options: RenderOptions = {},
): Promise<RenderResult> {
  const view = findView(document, options.view);
  const theme = resolveTheme(view.theme, options.themes);
  const resolved = resolveView(document, view);
  const layout = await computeLayout(resolved, theme);
  const svg = renderSvg(layout, theme);
  const format = options.format ?? 'svg';

  let content: string | Uint8Array = svg;
  if (format === 'pdf') {
    content = await renderPdf(layout, theme, { title: view.title ?? document.meta?.title });
  } else if (format === 'png') {
    content = await renderPng(svg, layout.width, options.png);
  }

  return { format, viewId: view.id, theme, layout, content };
}
