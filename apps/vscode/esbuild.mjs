// Two bundles: a CommonJS host bundle for the extension, and a self-contained
// IIFE bundle for the webview. A VS Code webview has no module resolution and
// no network, so everything it needs must be inlined.
import { build, context } from 'esbuild';
import { copyFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const watch = process.argv.includes('--watch');

const host = {
  entryPoints: [join(here, 'src/extension.ts')],
  outfile: join(here, 'dist/extension.cjs'),
  bundle: true,
  platform: 'node',
  target: 'node20',
  format: 'cjs',
  // Node's default field order picks UMD builds whose factories call a
  // passed-through require() for their own submodules. esbuild cannot follow
  // those, so they survive into the bundle and throw on load — which the host
  // reports as "command not found". Prefer the statically analysable ESM build.
  mainFields: ['module', 'main'],
  // Provided by the extension host at runtime, never bundled.
  external: ['vscode', '@resvg/resvg-js'],
  sourcemap: true,
  minify: !watch,
  logLevel: 'info',
};

const webview = {
  entryPoints: [join(here, 'webview/index.tsx')],
  outfile: join(here, 'media/canvas.js'),
  bundle: true,
  platform: 'browser',
  target: 'es2022',
  format: 'iife',
  jsx: 'automatic',
  loader: { '.css': 'css' },
  sourcemap: true,
  minify: !watch,
  logLevel: 'info',
};

// The schema is contributed to VS Code's JSON validation, so it must ship
// inside the extension rather than be resolved from the workspace.
mkdirSync(join(here, 'schema'), { recursive: true });
copyFileSync(join(here, '../../spec/schema/0.1.json'), join(here, 'schema/0.1.json'));

if (watch) {
  for (const options of [host, webview]) (await context(options)).watch();
} else {
  await Promise.all([build(host), build(webview)]);
}
