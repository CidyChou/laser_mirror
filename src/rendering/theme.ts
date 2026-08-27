import type { TextStyleOptions } from 'pixi.js';

export const FONT_UI = '"PingFang SC", "Hiragino Sans GB", "Heiti SC", "Microsoft YaHei", sans-serif';

export const Theme = {
  bg: 0x0d1218,
  bg0: 0x121820,
  bg1: 0x0a1016,
  panel: 0x171d24,
  panelHi: 0x1e252e,
  surface: 0x171d24,
  surfaceTop: 0x1f2731,
  surfaceSide: 0x12171d,
  surfaceLine: 0x303945,
  surfaceMuted: 0x151b22,
  boardTop: 0x1c293b,
  boardBottom: 0x111927,
  boardSide: 0x0d1522,
  cellA: 0x24344a,
  cellB: 0x1d2a3d,
  text: 0xf3f0ea,
  ink: 0xf3f0ea,
  inkSoft: 0xb4aea6,
  muted: 0xb4aea6,
  accent: 0x4da43a,
  accentDark: 0x3a7d2c,
  danger: 0xd84f51,
  success: 0x4da43a,
  coin: 0xf0aa22,
  coinDark: 0xc98213,
  coinHighlight: 0xfff1a0,
  settingsIcon: 0xd8dde5,
  overlay: 0x050709,
  beam: 0xff5578,
  beamHot: 0xff9ab2,
  beam2: 0xff315f,
  beamCore: 0xfff6f9,
  cyan: 0x55ddff,
  cyanSoft: 0xa8efff,
  green: 0x55efae,
  gold: 0xffd66c,
  purple: 0x9a7cff,
  shadow: 0x05080d,
  heart: 0xe45b64,
  heartEmpty: 0x3a4450,
};

/** WeChat canvas clips CJK glyphs unless the raster is padded and weight is `bold`. */
export function uiTextPadding(fontSize: number): number {
  return Math.max(10, Math.round(Number(fontSize) * 0.32));
}

export function uiText(style: TextStyleOptions = {}): TextStyleOptions {
  const fontSize = Number(style.fontSize ?? 24);
  return {
    ...style,
    fontFamily: FONT_UI,
    fontWeight: 'bold',
    padding: uiTextPadding(fontSize),
  };
}

export function setUiFontSize(target: { style: { fontSize?: number | string; padding?: number } }, size: number) {
  target.style.fontSize = size;
  target.style.padding = uiTextPadding(size);
}
