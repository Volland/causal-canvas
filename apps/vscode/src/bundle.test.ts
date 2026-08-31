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
  get: (_t, p) => (p === 'then' ? undefined : stub),
  apply: () => stub,
  construct: () => stub,
});
module.exports = stub;
`;

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
