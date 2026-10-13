import { Assets, DOMAdapter, ImageSource, Texture } from 'pixi.js';
import type { PlatformKind } from '@/platform/IPlatform';

const FILES = {
  // Local WebP decodes in WeChat DevTools but fails on many real devices.
  background: 'ui/space-background.jpg',
  settings: 'ui/settings-gear.png',
  crown: 'ui/victory-crown.png',
  coin: 'ui/victory-coin.png',
  finger: 'ui/tutorial/finger.png',
  loadingTitle: 'ui/loading-title.png',
} as const;

export type UiAssetKey = keyof typeof FILES;

const nativeTextures = new Map<UiAssetKey, Texture>();

function src(_kind: PlatformKind, file: string): string {
  return file;
}

export async function loadUiAssets(kind: PlatformKind, onProgress?: (ratio: number) => void): Promise<void> {
  const entries = Object.entries(FILES) as [UiAssetKey, string][];
  let completed = 0;
  await Promise.all(entries.map(async ([key, file]) => {
    try {
      if (kind !== 'web') nativeTextures.set(key, await loadNativeTexture(file));
      else await withTimeout(Assets.load(src(kind, file)), file);
    } catch (error) {
      nativeTextures.delete(key);
      // Every sprite has a vector/text fallback; optional images must never trap startup.
      console.warn(`[ui] failed to load ${file}`, error);
    }
    onProgress?.(++completed / entries.length);
  }));
}

function withTimeout<T>(pending: Promise<T>, file: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Image load timed out: ${file}`)), 4500);
    pending.then(resolve, reject).finally(() => clearTimeout(timer));
  });
}

export function uiTexture(kind: PlatformKind, key: UiAssetKey): Texture {
  if (kind !== 'web') return nativeTextures.get(key) ?? Texture.EMPTY;
  const assetKey = src(kind, FILES[key]);
  if (!Assets.cache.has(assetKey)) return Texture.EMPTY;
  const texture = Assets.cache.get(assetKey);
  return texture instanceof Texture ? texture : Texture.EMPTY;
}

function loadNativeTexture(file: string): Promise<Texture> {
  return new Promise((resolve, reject) => {
    const image = DOMAdapter.get().createImage() as HTMLImageElement & {
      onload: (() => void) | null;
      onerror: ((error?: unknown) => void) | null;
    };
    const cleanUp = () => {
      clearTimeout(timer);
      image.onload = null;
      image.onerror = null;
    };
    const timer = setTimeout(() => {
      cleanUp();
      reject(new Error(`Image load timed out: ${file}`));
    }, 4500);
    image.onload = () => {
      cleanUp();
      try {
        const width = Number(image.naturalWidth || image.width || 0);
        const height = Number(image.naturalHeight || image.height || 0);
        if (width <= 0 || height <= 0) throw new Error(`Empty mini-game image: ${file}`);
        resolve(new Texture({ source: new ImageSource({ resource: image, width, height }) }));
      } catch (error) {
        reject(error);
      }
    };
    image.onerror = (error) => {
      cleanUp();
      reject(error ?? new Error(`Failed to load mini-game image: ${file}`));
    };
    image.src = file;
  });
}
