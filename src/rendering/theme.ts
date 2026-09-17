import type { TextStyleOptions } from 'pixi.js';

export const FONT_UI = 'ui-rounded, "SF Pro Rounded", "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif';

const VOID_PALETTE = {
  bg: 0x070d18, bg0: 0x101e32, bg1: 0x091221,
  panel: 0x111f32, panelHi: 0x1b3048,
  surface: 0x122137, surfaceTop: 0x233d55, surfaceSide: 0x080f1c,
  surfaceLine: 0x34536b, surfaceMuted: 0x0e192b,
  boardTop: 0x1c293b, boardBottom: 0x111927, boardSide: 0x0d1522,
  boardShadow: 0x02050a, boardDepthBottom: 0x090e17, boardDepthSide: 0x0d1522,
  cellA: 0x192e45, cellB: 0x192e45, cellShade: 0x080f1c,
  text: 0xedf7ff, ink: 0xedf7ff, inkSoft: 0x91abc3, muted: 0x91abc3,
  textOnAccent: 0xfffaf1,
  accent: 0x28bccc, accentDark: 0x116577,
  danger: 0xd84f51, dangerSurface: 0x5a2a30, success: 0x4da43a,
  coin: 0xf0aa22, coinDark: 0xc98213, coinHighlight: 0xfff1a0,
  settingsIcon: 0xd8dde5, overlay: 0x050709,
  beam: 0xff5578, beamHot: 0xff9ab2, beam2: 0xff315f, beamCore: 0xfff6f9,
  laserBody: 0xf52e61, laserPlasma: 0xffa9bf, laserCore: 0xfffdfd,
  cyan: 0x66d9f0, cyanSoft: 0xb9ffff, green: 0x55efae,
  gold: 0xffd66c, purple: 0x9a7cff, shadow: 0x05080d,
  heart: 0xfa426a, heartEmpty: 0x3a4450,
  disabledSurface: 0x3a4452, disabledEdge: 0x2a3340,
  comboSide: 0xb43a4e, victoryWash: 0x8fffd0,
  raisedFixed: 0x35485e, raisedMovable: 0x25485f,
  splitterFixed: 0x304257, splitterMovable: 0x2d4055,
  mirrorBlade: 0xb8e8f0, mirrorCore: 0xf2fdff, mirrorShade: 0x78bbd1, mirrorEnd: 0x81c5da,
  lock: 0x8b96aa, lockKey: 0x111927, splitterGem: 0x79d2e9,
  wallFace: 0x92a4c3, wallInset: 0x536580,
  switchOff: 0x25364d, switchOffRing: 0x68809e, switchOffCore: 0x7f93ad,
  switchOnRing: 0xd9fff0,
  doorClosed: 0x78445d, doorEdge: 0xff7a9d, doorBars: 0xffcad7,
  white: 0xffffff,
} as const;

export type ThemePalette = { -readonly [K in keyof typeof VOID_PALETTE]: number };
export type ThemeId = 'void' | 'aurora' | 'white';
export type GameTheme = {
  readonly id: ThemeId;
  readonly name: string;
  readonly tagline: string;
  readonly colorScheme: 'dark' | 'light';
  readonly colors: ThemePalette;
};

function palette(overrides: Partial<ThemePalette>): ThemePalette {
  return { ...VOID_PALETTE, ...overrides };
}

export const THEMES: readonly GameTheme[] = Object.freeze([
  { id: 'void', name: '深空霓虹', tagline: '霓虹 · 能量场', colorScheme: 'dark', colors: palette({}) },
  {
    id: 'aurora', name: '极光紫', tagline: '梦幻 · 能量', colorScheme: 'dark',
    colors: palette({
      bg: 0x100f1d, bg0: 0x19162a, bg1: 0x0d0c18,
      panel: 0x1c1930, panelHi: 0x292441,
      surface: 0x201c35, surfaceTop: 0x2b2645, surfaceSide: 0x161329,
      surfaceLine: 0x484064, surfaceMuted: 0x19162b,
      boardTop: 0x252344, boardBottom: 0x15152c, boardSide: 0x101022,
      boardShadow: 0x080713, boardDepthBottom: 0x111024, boardDepthSide: 0x16152e,
      cellA: 0x39365f, cellB: 0x25223f, cellShade: 0x15142a,
      ink: 0xf7f4ff, text: 0xf7f4ff, inkSoft: 0xc3b8dc, muted: 0xc3b8dc,
      accent: 0x7667e8, accentDark: 0x5748b8,
      cyan: 0x52e2dc, cyanSoft: 0xb3fff5, purple: 0xb187ff, green: 0x64e8a8,
      beam: 0xff5a9f, beamHot: 0xffa1cf, beam2: 0xf52f85,
      laserBody: 0xff4385,
      raisedFixed: 0x443d63, raisedMovable: 0x39365e,
      splitterFixed: 0x3d4364, splitterMovable: 0x34435f,
      wallFace: 0x544f72, wallInset: 0x34304f,
      switchOff: 0x343457, switchOffRing: 0x81789f, switchOffCore: 0xa097bd,
      doorClosed: 0x70425f,
    }),
  },
  {
    id: 'white', name: '简约白', tagline: '干净 · 纸白', colorScheme: 'light',
    colors: palette({
      bg: 0xe3e3e6, bg0: 0xdedee1, bg1: 0xd6d6da,
      panel: 0xf0f0f2, panelHi: 0xf5f5f6,
      surface: 0xf0f0f2, surfaceTop: 0xf5f5f6, surfaceSide: 0xc4c4c8,
      surfaceLine: 0xc8c8cc, surfaceMuted: 0xe8e8eb,
      boardTop: 0xe8e8eb, boardBottom: 0xdddde1, boardSide: 0xc8c8cc,
      boardShadow: 0xb8b8bc, boardDepthBottom: 0xd0d0d4, boardDepthSide: 0xc4c4c8,
      cellA: 0xeaeaed, cellB: 0xeaeaed, cellShade: 0xd5d5d9,
      text: 0x1a1a1c, ink: 0x1a1a1c, inkSoft: 0x5c5c62, muted: 0x5c5c62,
      textOnAccent: 0xf5f5f6,
      accent: 0x1a1a1c, accentDark: 0x000000,
      danger: 0xe24b4b, dangerSurface: 0xf3e0e0, success: 0x2f8f64,
      coin: 0xc49620, gold: 0xc49620,
      cyan: 0x6a6a70, cyanSoft: 0xb4b4b8, green: 0x2f8f64, purple: 0x6a6a70,
      settingsIcon: 0x2c2c30, overlay: 0x1a1a1c, shadow: 0x1a1a1c,
      heartEmpty: 0xc8c8cc, disabledSurface: 0xdadade, disabledEdge: 0xc4c4c8,
      raisedFixed: 0xc8c8cc, raisedMovable: 0xd0d0d4,
      splitterFixed: 0xc8c8cc, splitterMovable: 0xd0d0d4,
      mirrorBlade: 0xc8c8cc, mirrorCore: 0xeeeef0,
      mirrorShade: 0x6e6e74, mirrorEnd: 0x8a8a90,
      lock: 0x6a6a70, lockKey: 0xf0f0f2, splitterGem: 0x9a9aa0,
      wallFace: 0x8a8a90, wallInset: 0x5c5c62,
      switchOff: 0xd0d0d4, switchOffRing: 0x9a9aa0, switchOffCore: 0x6a6a70,
      switchOnRing: 0xd5e8dc,
      doorClosed: 0xb45a6a, comboSide: 0xb43a4e,
      victoryWash: 0xe8e8eb,
    }),
  },
]);

export const DEFAULT_THEME_ID: ThemeId = 'void';
export const Theme: ThemePalette = { ...VOID_PALETTE };
export let activeThemeId: ThemeId = DEFAULT_THEME_ID;

export function normalizeThemeId(value: unknown): ThemeId {
  if (value === 'atelier') return 'white';
  return THEMES.some((theme) => theme.id === value) ? value as ThemeId : DEFAULT_THEME_ID;
}

export function themeById(id: ThemeId): GameTheme {
  return THEMES.find((theme) => theme.id === id) ?? THEMES[0];
}

export function isLightTheme() {
  return themeById(activeThemeId).colorScheme === 'light';
}

export function setActiveTheme(id: ThemeId): GameTheme {
  const next = themeById(id);
  activeThemeId = next.id;
  Object.assign(Theme, next.colors);
  return next;
}

export function applyThemeToDocument(theme: GameTheme) {
  if (typeof document === 'undefined') return;
  // WeChat Mini Game exposes a lightweight `document` shim so libraries can
  // detect a browser-like runtime, but it does not provide a real DOM tree.
  // Treat document theming as progressive enhancement for the web build.
  const root = document.documentElement;
  const rootStyle = root?.style;
  if (!rootStyle || typeof rootStyle.setProperty !== 'function') return;
  const bg = colorHex(theme.colors.bg);
  if (root.dataset) root.dataset.theme = theme.id;
  rootStyle.colorScheme = theme.colorScheme;
  rootStyle.setProperty('--app-bg', bg);
  rootStyle.setProperty('--focus', colorHex(theme.colors.accent));
  if (document.body?.style) document.body.style.background = bg;
  document.getElementById?.('app')?.style?.setProperty?.('background', bg);
  document.querySelector?.('meta[name="theme-color"]')?.setAttribute?.('content', bg);
}

function colorHex(color: number) {
  return `#${color.toString(16).padStart(6, '0')}`;
}

/** WeChat canvas clips CJK glyphs unless the raster is padded and weight is `bold`. */
export function uiTextPadding(fontSize: number): number {
  return Math.max(10, Math.round(Number(fontSize) * 0.32));
}

export function uiText(style: TextStyleOptions = {}): TextStyleOptions {
  const fontSize = Number(style.fontSize ?? 24);
  return { ...style, fontFamily: FONT_UI, fontWeight: 'bold', padding: uiTextPadding(fontSize) };
}

export function setUiFontSize(target: { style: { fontSize?: number | string; padding?: number } }, size: number) {
  target.style.fontSize = size;
  target.style.padding = uiTextPadding(size);
}
