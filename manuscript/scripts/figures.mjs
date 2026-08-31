#!/usr/bin/env node
// Regenerates every figure declared by every model under models/.
//
// Figures are outputs, not sources: they are gitignored and rebuilt here, so a
// model change can never leave a stale figure in the manuscript.
import { execFileSync } from 'node:child_process';
import { mkdirSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const manuscript = join(here, '..');
const repo = join(manuscript, '..');
const cli = join(repo, 'packages', 'cli', 'dist', 'bin.js');

const modelsDir = join(manuscript, 'models');
const figuresDir = join(manuscript, 'figures');
mkdirSync(figuresDir, { recursive: true });

const models = readdirSync(modelsDir).filter((name) => name.endsWith('.causal.json'));
if (models.length === 0) {
  console.error('no models found in manuscript/models');
  process.exit(1);
}

// Gate first: a figure must never be produced from a model that fails review.
execFileSync(process.execPath, [cli, 'lint', ...models.map((m) => join(modelsDir, m))], {
  stdio: 'inherit',
});

for (const model of models) {
  for (const format of ['svg', 'pdf']) {
    execFileSync(
      process.execPath,
      [
        cli,
        'render',
        join(modelsDir, model),
        '--all',
        '--format',
        format,
        '--out',
        figuresDir + '/',
      ],
      { stdio: 'inherit' },
    );
  }
}
console.log(`regenerated figures for ${models.length} model(s)`);
