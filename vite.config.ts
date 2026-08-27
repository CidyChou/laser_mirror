import { defineConfig, type UserConfig } from 'vite';
import { resolve } from 'node:path';

const entries: Record<string, string> = {
  wechat: 'src/entry/wechat.ts',
  douyin: 'src/entry/douyin.ts',
  xhs: 'src/entry/xhs.ts',
};

export default defineConfig(({ mode }): UserConfig => {
  const alias = { '@': resolve(process.cwd(), 'src') };
  if (mode === 'web') {
    return {
      base: './',
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
