export interface PngOptions {
  /** Output width in pixels. Takes precedence over `scale`. */
  width?: number;
  /** Multiplier applied to the figure's intrinsic size. Defaults to 2. */
  scale?: number;
}

export class RasterizerUnavailableError extends Error {
  constructor(cause: unknown) {
    super(
      'PNG output needs the optional dependency @resvg/resvg-js, which is not installed or failed to load. ' +
        'Install it, or render SVG or PDF instead. ' +
        `Underlying error: ${cause instanceof Error ? cause.message : String(cause)}`,
    );
    this.name = 'RasterizerUnavailableError';
  }
}

/**
 * Rasterize a figure.
 *
 * Text is baked into pixels here, so a PNG never depends on the fonts installed
 * where it is opened.
 */
export async function renderPng(
  svg: string,
  intrinsicWidth: number,
  options: PngOptions = {},
): Promise<Uint8Array> {
  let Resvg: any;
  try {
    ({ Resvg } = await import('@resvg/resvg-js'));
  } catch (cause) {
    throw new RasterizerUnavailableError(cause);
  }

  const width = options.width ?? Math.round(intrinsicWidth * (options.scale ?? 2));
  const renderer = new Resvg(svg, {
    fitTo: { mode: 'width', value: width },
    font: { loadSystemFonts: true },
  });
  return renderer.render().asPng();
}
