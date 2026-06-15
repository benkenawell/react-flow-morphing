// Bundles the client web component and copies vendor assets into public/.
// Usage: node scripts/build.js [--watch]
import { build, context } from 'esbuild';
import { mkdir, copyFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const watch = process.argv.includes('--watch');

const VENDOR = [
  ['node_modules/htmx.org/dist/htmx.min.js', 'public/vendor/htmx.min.js'],
  ['node_modules/idiomorph/dist/idiomorph-ext.min.js', 'public/vendor/idiomorph-ext.min.js'],
];

async function copyVendor() {
  await mkdir(resolve(root, 'public/vendor'), { recursive: true });
  for (const [from, to] of VENDOR) {
    await copyFile(resolve(root, from), resolve(root, to));
  }
}

const options = {
  entryPoints: [resolve(root, 'src/client/index.js')],
  outfile: resolve(root, 'public/flow-component.js'),
  bundle: true,
  format: 'esm',
  target: 'es2020',
  jsx: 'automatic',
  minify: !watch,
  sourcemap: watch,
  // React Flow CSS is imported as a string and injected into the shadow root.
  loader: { '.css': 'text' },
  logLevel: 'info',
};

await copyVendor();

if (watch) {
  const ctx = await context(options);
  await ctx.watch();
  console.log('[build] watching client bundle…');
} else {
  await build(options);
  console.log('[build] client bundle written to public/flow-component.js');
}
