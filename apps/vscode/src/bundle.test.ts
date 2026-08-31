import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { copyFileSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
/** dist-test/ sits beside dist/, so the shipped bundle is one level up. */
const bundle = join(here, '..', 'dist', 'extension.cjs');

/**
 * `vscode` is supplied by the extension host, so loading the bundle outside
 * VS Code needs a stand-in. Anything the module touches at load time resolves
 * to the same inert proxy.
 */
const VSCODE_STUB = `
const stub = new Proxy(function () {}, {
  get: (_t, p) => {
    if (p === 'then') return undefined;
    // The host bundle interpolates webview URIs into HTML, so the stub has to
    // survive being turned into a string.
    if (p === Symbol.toPrimitive || p === 'toString' || p === 'valueOf') return () => 'stub';
    return stub;
  },
  apply: () => stub,
  construct: () => stub,
});

// esbuild's ESM interop copies the module's own properties, so the namespaces
// the bundle reaches for have to be real properties rather than proxy traps.
let provider;
const api = {
  provider: () => provider,
  window: new Proxy(
    {},
    {
      get: (_t, p) =>
        p === 'registerCustomEditorProvider'
          ? (_viewType, value) => {
              provider = value;
              return stub;
            }
          : stub,
    },
  ),
};
for (const name of [
  'commands',
  'Diagnostic',
  'DiagnosticSeverity',
  'Disposable',
  'EventEmitter',
  'FileType',
  'languages',
  'Range',
  'Uri',
  'ViewColumn',
  'workspace',
  'WorkspaceEdit',
]) {
  api[name] = stub;
}
module.exports = api;
`;

/** A panel whose webview never loads, and so never acknowledges a message. */
const DEADLOCK_PANEL = `
const panel = {
  webview: {
    options: {},
    html: '',
    cspSource: 'vscode-webview:',
    asWebviewUri: (uri) => uri,
    // VS Code holds this promise until the webview signals ready, which it
    // cannot do before resolveCustomTextEditor returns and the webview mounts.
    postMessage: () => new Promise(() => {}),
    onDidReceiveMessage: () => ({ dispose() {} }),
  },
  onDidDispose: () => ({ dispose() {} }),
};
`;

const MODEL = JSON.stringify({
  causal: '0.1',
  profile: 'dag',
  variables: ['x', 'y'],
  relations: ['x -> y'],
});

// @lat: [[tests#Packaging guarantees#The shipped bundle loads]]
test('the shipped bundle loads and exports activate', () => {
  const sandbox = mkdtempSync(join(tmpdir(), 'causal-canvas-bundle-'));
  const stub = join(sandbox, 'node_modules', 'vscode');
  mkdirSync(stub, { recursive: true });
  writeFileSync(join(stub, 'package.json'), '{"name":"vscode","main":"index.js"}');
  writeFileSync(join(stub, 'index.js'), VSCODE_STUB);

  // Copied rather than required in place, so `vscode` resolves to the stub.
  const copied = join(sandbox, 'extension.cjs');
  copyFileSync(bundle, copied);

  const probe = spawnSync(
    process.execPath,
    [
      '-e',
      'const m = require(process.argv[1]);' +
        'if (typeof m.activate !== "function") throw new Error("no activate export");',
      copied,
    ],
    { encoding: 'utf8' },
  );

  assert.equal(
    probe.status,
    0,
    `the extension bundle failed to load, which VS Code reports as "command not found":\n${probe.stderr}`,
  );
});

/**
 * Regression: the editor used to await `webview.postMessage` inside
 * `resolveCustomTextEditor`, which VS Code does not settle until the webview
 * has loaded — and it does not load the webview until that method returns.
 * The editor sat on its loading bar forever with no canvas and no error.
 */
// @lat: [[tests#Packaging guarantees#The editor resolves without the webview]]
test('the editor resolves before the webview acknowledges anything', () => {
  const sandbox = mkdtempSync(join(tmpdir(), 'causal-canvas-resolve-'));
  const stub = join(sandbox, 'node_modules', 'vscode');
  mkdirSync(stub, { recursive: true });
  writeFileSync(join(stub, 'package.json'), '{"name":"vscode","main":"index.js"}');
  writeFileSync(join(stub, 'index.js'), VSCODE_STUB);

  const copied = join(sandbox, 'extension.cjs');
  copyFileSync(bundle, copied);

  const model = join(sandbox, 'probe.causal.json');
  writeFileSync(model, MODEL);

  const probe = spawnSync(
    process.execPath,
    [
      '-e',
      `const vscode = require('vscode');
       require(process.argv[1]).activate({ subscriptions: [], extensionUri: {} });
       const provider = vscode.provider();
       if (!provider) throw new Error('no custom editor provider was registered');
       ${DEADLOCK_PANEL}
       const uri = { toString: () => 'file://' + process.argv[2], fsPath: process.argv[2] };
       const doc = { uri, getText: () => require('node:fs').readFileSync(process.argv[2], 'utf8') };
       const timer = setTimeout(() => {
         console.error('resolveCustomTextEditor never returned');
         process.exit(3);
       }, 10000);
       provider
         .resolveCustomTextEditor(doc, panel, { isCancellationRequested: false })
         .then(() => { clearTimeout(timer); process.exit(0); })
         .catch((error) => { console.error(error); process.exit(4); });`,
      copied,
      model,
    ],
    { cwd: sandbox, encoding: 'utf8', timeout: 30_000 },
  );

  assert.equal(
    probe.status,
    0,
    `the custom editor did not finish resolving, which VS Code shows as a loading bar that never ends:\n${probe.stderr}`,
  );
});
