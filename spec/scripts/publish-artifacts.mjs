// Copies the bundled artifacts to their publication paths so that spec/schema/0.1.json
// and spec/context/v1.jsonld are byte-identical to what the tooling bundles.
import { copyFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const pairs = [
  ['src/artifacts/schema-0.1.json', 'schema/0.1.json'],
  ['src/artifacts/context-v1.json', 'context/v1.jsonld'],
  ['src/artifacts/schema-0.1.json', 'dist/artifacts/schema-0.1.json'],
  ['src/artifacts/context-v1.json', 'dist/artifacts/context-v1.json'],
  // Served at the published URLs by GitHub Pages, so $schema and @context
  // resolve. Generated here so they can never drift from what ships bundled.
  ['src/artifacts/schema-0.1.json', '../docs/schema/0.1.json'],
  ['src/artifacts/context-v1.json', '../docs/ns/v1'],
  ['src/artifacts/context-v1.json', '../docs/ns/v1.jsonld'],
];
for (const [from, to] of pairs) {
  mkdirSync(dirname(join(root, to)), { recursive: true });
  copyFileSync(join(root, from), join(root, to));
}
