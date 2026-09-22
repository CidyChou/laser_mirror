import { defineConfig, type UserConfig } from 'vite';
import { resolve } from 'node:path';

const entries: Record<string, string> = {
  wechat: 'src/entry/wechat.ts',
  douyin: 'src/entry/douyin.ts',
  xhs: 'src/entry/xhs.ts',
};

function cliValue(name: string){
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

export default defineConfig(({ mode }): UserConfig => {
  const alias = { '@': resolve(process.cwd(), 'src') };
  if (mode === 'web') {
    return {
      base: './',
      // Multiple local previews can run at once (for example 5173 and the
      // LAN preview on 8347). Keep their dependency optimizer state apart so
      // one server cannot make the other serve a stale 504 dep URL.
      cacheDir: resolve(process.cwd(), `node_modules/.vite-web-${cliValue('--port') ?? 'default'}`),
      resolve: { alias },
      build: { outDir: 'dist/web', sourcemap: false, target: 'es2020' },
      server: { host: '0.0.0.0' },
    };
  }

  const entry = entries[mode];
  if (!entry) throw new Error(`Unknown build mode: ${mode}`);

  return {
    resolve: { alias },
    define: { __BUILD_TARGET__: JSON.stringify(mode) },
    build: {
      outDir: `dist/${mode}`,
      emptyOutDir: true,
      target: 'es2019',
      minify: true,
      sourcemap: false,
      lib: {
        entry: resolve(process.cwd(), entry),
        name: 'LaserMirrorGame',
        formats: ['iife'],
        fileName: () => 'game.js',
      },
      rolldownOptions: {
        output: { inlineDynamicImports: true },
      },
    },
  };
});
