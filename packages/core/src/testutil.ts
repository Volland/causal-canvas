import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

/** Locate the workspace root so fixtures resolve regardless of cwd. */
export function repoRoot(): string {
  let current = dirname(fileURLToPath(import.meta.url));
  for (let i = 0; i < 10; i++) {
    if (existsSync(join(current, 'pnpm-workspace.yaml'))) return current;
    current = dirname(current);
  }
  throw new Error('workspace root not found');
}

export const conformanceDir = (): string => join(repoRoot(), 'conformance');
export const examplesDir = (): string => join(repoRoot(), 'examples');
