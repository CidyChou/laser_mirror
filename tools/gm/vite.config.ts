import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import { gmApiPlugin } from './store';

const dir = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(dir, '../..');

export default defineConfig({
  root: dir,
  publicDir: false,
  resolve: {
    alias: { '@': resolve(projectRoot, 'src') },
  },
  server: {
    host: '0.0.0.0',
    port: 8350,
    strictPort: true,
  },
  plugins: [gmApiPlugin(projectRoot)],
});
