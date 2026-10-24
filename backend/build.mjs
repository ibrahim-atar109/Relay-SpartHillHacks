import { build } from 'esbuild';
import { writeFile } from 'node:fs/promises';
await build({ entryPoints: ['backend/handlers/ai.ts'], outfile: 'backend/dist/index.js', bundle: true, platform: 'node', target: 'node22', format: 'cjs' });
// Isolate the Lambda bundle from the frontend repository's ESM package scope.
await writeFile('backend/dist/package.json', JSON.stringify({ private: true, type: 'commonjs' }) + '\n');
