import type { TextStyleOptions } from 'pixi.js';

export const FONT_UI = 'ui-rounded, "SF Pro Rounded", "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif';

const VOID_PALETTE = {
  bg: 0x0d1218, bg0: 0x121820, bg1: 0x0a1016,
  panel: 0x171d24, panelHi: 0x1e252e,
  surface: 0x171d24, surfaceTop: 0x1f2731, surfaceSide: 0x12171d,
  surfaceLine: 0x303945, surfaceMuted: 0x151b22,
  boardTop: 0x1c293b, boardBottom: 0x111927, boardSide: 0x0d1522,
  boardShadow: 0x02050a, boardDepthBottom: 0x090e17, boardDepthSide: 0x0d1522,
  cellA: 0x293c53, cellB: 0x192738, cellShade: 0x101a28,
  text: 0xf3f0ea, ink: 0xf3f0ea, inkSoft: 0xb4aea6, muted: 0xb4aea6,
  textOnAccent: 0xfffaf1,
  accent: 0x4da43a, accentDark: 0x3a7d2c,
  danger: 0xd84f51, dangerSurface: 0x5a2a30, success: 0x4da43a,
  coin: 0xf0aa22, coinDark: 0xc98213, coinHighlight: 0xfff1a0,
  settingsIcon: 0xd8dde5, overlay: 0x050709,
  beam: 0xff5578, beamHot: 0xff9ab2, beam2: 0xff315f, beamCore: 0xfff6f9,
  laserBody: 0xff365f, laserPlasma: 0xffa9bf, laserCore: 0xfffdfd,
  cyan: 0x55ddff, cyanSoft: 0xa8efff, green: 0x55efae,
  gold: 0xffd66c, purple: 0x9a7cff, shadow: 0x05080d,
  heart: 0xe45b64, heartEmpty: 0x3a4450,
  disabledSurface: 0x3a4452, disabledEdge: 0x2a3340,
  comboSide: 0xb43a4e, victoryWash: 0x8fffd0,
  raisedFixed: 0x314158, raisedMovable: 0x2d3d56,
  splitterFixed: 0x304257, splitterMovable: 0x2d4055,
  mirrorBlade: 0xa9c9e1, mirrorCore: 0xf9fdff, mirrorShade: 0x6f82a0, mirrorEnd: 0x60728c,
  lock: 0x8b96aa, lockKey: 0x111927, splitterGem: 0x79d2e9,
  wallFace: 0x43536e, wallInset: 0x26344a,
  switchOff: 0x25364d, switchOffRing: 0x68809e, switchOffCore: 0x7f93ad,
  switchOnRing: 0xd9fff0,
  doorClosed: 0x78445d, doorEdge: 0xff7a9d, doorBars: 0xffcad7,
  white: 0xffffff,
} as const;

export type ThemePalette = { -readonly [K in keyof typeof VOID_PALETTE]: number };
export type ThemeId = 'void' | 'aurora' | 'atelier';
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
  { id: 'void', name: '深空霓虹', tagline: '冷静 · 精密', colorScheme: 'dark', colors: palette({}) },
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
    id: 'atelier', name: '暖金工坊', tagline: '温暖 · 玩具感', colorScheme: 'light',
    colors: palette({
      bg: 0xf7eddd, bg0: 0xfff7eb, bg1: 0xead8bd,
      panel: 0xfffaf1, panelHi: 0xffffff,
      surface: 0xfffaf1, surfaceTop: 0xffffff, surfaceSide: 0xe9d2b1,
      surfaceLine: 0xd6b88e, surfaceMuted: 0xf2e3cf,
      boardTop: 0xf1d9b5, boardBottom: 0xd9bc91, boardSide: 0xb99368,
      boardShadow: 0x7d6047, boardDepthBottom: 0xb08a61, boardDepthSide: 0xc39b6e,
      cellA: 0xfff2dc, cellB: 0xe9cea7, cellShade: 0xbfa078,
      text: 0x4f4036, ink: 0x4f4036, inkSoft: 0x7c624f, muted: 0x7c624f,
      accent: 0x69b83f, accentDark: 0x4f8f30,
      danger: 0xd84f51, dangerSurface: 0xf4cfcb, success: 0x4f9b36,
      gold: 0xc88716,
      settingsIcon: 0x5b4a3d, overlay: 0x33251d, shadow: 0x735844,
      heartEmpty: 0xcab89f, disabledSurface: 0xd7c8b5, disabledEdge: 0xbca98e,
      raisedFixed: 0x9bafbd, raisedMovable: 0x83aabd,
      splitterFixed: 0x8da8b1, splitterMovable: 0x73a7b2,
      mirrorBlade: 0xd8f2fb, mirrorCore: 0xffffff,
      mirrorShade: 0x7ba0b5, mirrorEnd: 0x698d9f,
      lock: 0x6f7f8c, lockKey: 0xe7d9c2, splitterGem: 0x52c2d3,
      wallFace: 0x9b876f, wallInset: 0x796753,
      switchOff: 0xb7aa96, switchOffRing: 0x8b7d6b, switchOffCore: 0x746756,
      doorClosed: 0xb95e75, doorEdge: 0xe24f78, doorBars: 0xffe3ea,
      comboSide: 0xa73349,
    }),
  },
]);

export const DEFAULT_THEME_ID: ThemeId = 'void';
export const Theme: ThemePalette = { ...VOID_PALETTE };
export let activeThemeId: ThemeId = DEFAULT_THEME_ID;

export function normalizeThemeId(value: unknown): ThemeId {
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
