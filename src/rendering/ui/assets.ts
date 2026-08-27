import { Assets, Texture } from 'pixi.js';
import type { PlatformKind } from '@/platform/IPlatform';

const FILES = {
  settings: 'ui/settings-gear.png',
  crown: 'ui/victory-crown.png',
} as const;

export type UiAssetKey = keyof typeof FILES;

function src(kind: PlatformKind, file: string): string {
  return `${kind === 'web' ? './' : ''}${file}`;
}

export async function loadUiAssets(kind: PlatformKind): Promise<void> {
  try {
    await Assets.load(Object.values(FILES).map((file) => src(kind, file)));
  } catch {
    // Sprite fallbacks stay in the HUD / result layers.
  }
}

export function uiTexture(kind: PlatformKind, key: UiAssetKey): Texture {
  const texture = Assets.get(src(kind, FILES[key]));
  return texture instanceof Texture ? texture : Texture.EMPTY;
}
