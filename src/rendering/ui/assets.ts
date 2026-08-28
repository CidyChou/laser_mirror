import { Assets, DOMAdapter, ImageSource, Texture } from 'pixi.js';
import type { PlatformKind } from '@/platform/IPlatform';

const FILES = {
  settings: 'ui/settings-gear.png',
  crown: 'ui/victory-crown.png',
  coin: 'ui/victory-coin.png',
} as const;

export type UiAssetKey = keyof typeof FILES;

const nativeTextures = new Map<UiAssetKey, Texture>();

function src(_kind: PlatformKind, file: string): string {
  return file;
}

export async function loadUiAssets(kind: PlatformKind): Promise<void> {
  if (kind !== 'web') {
    await Promise.all((Object.entries(FILES) as [UiAssetKey, string][]).map(async ([key, file]) => {
      try {
        nativeTextures.set(key, await loadNativeTexture(file));
      } catch {
        nativeTextures.delete(key);
      }
    }));
    return;
  }
  try {
    await Assets.load(Object.values(FILES).map((file) => src(kind, file)));
  } catch {
    // Sprite fallbacks stay in the HUD / result layers.
  }
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
    image.onload = () => {
      try {
        const width = Number(image.naturalWidth || image.width || 0);
        const height = Number(image.naturalHeight || image.height || 0);
        if (width <= 0 || height <= 0) throw new Error(`Empty mini-game image: ${file}`);
        resolve(new Texture({ source: new ImageSource({ resource: image, width, height }) }));
      } catch (error) {
        reject(error);
      }
    };
    image.onerror = (error) => reject(error ?? new Error(`Failed to load mini-game image: ${file}`));
    image.src = file;
  });
}
