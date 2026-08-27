import { Graphics } from 'pixi.js';
import { Theme } from '../theme';

export function drawGearIcon(g: Graphics, size = 52, color = Theme.settingsIcon) {
  g.clear();
  const r = size / 2;
  const teeth = 8;
  const outer = r * 0.92;
  const inner = r * 0.64;
  const hub = r * 0.28;
  const hole = r * 0.16;
  const toothW = Math.PI / teeth * 0.42;
  const points: number[] = [];
  for (let i = 0; i < teeth; i++) {
    const a = (i / teeth) * Math.PI * 2 - Math.PI / 2;
    const a0 = a - toothW;
    const a1 = a + toothW;
    const mid0 = a - Math.PI / teeth;
    const mid1 = a + Math.PI / teeth;
    points.push(
      Math.cos(mid0) * inner, Math.sin(mid0) * inner,
      Math.cos(a0) * inner, Math.sin(a0) * inner,
      Math.cos(a0) * outer, Math.sin(a0) * outer,
      Math.cos(a1) * outer, Math.sin(a1) * outer,
      Math.cos(a1) * inner, Math.sin(a1) * inner,
      Math.cos(mid1) * inner, Math.sin(mid1) * inner,
    );
  }
  g.poly(points).fill(color);
  g.circle(0, 2, hub).fill(0x10161c);
  g.circle(0, 0, hub).fill(color);
  g.circle(0, 0, hole).fill(0x10161c);
}

export function drawCrownIcon(g: Graphics, size = 124) {
  g.clear();
  const s = size / 124;
  const points = [
    -48, 24, -54, -28, -24, -4, 0, -46,
    24, -4, 54, -28, 48, 24,
  ].map((value) => value * s);
  g.poly(points).fill(Theme.coin).stroke({ color: Theme.gold, width: 4 * s });
  g.roundRect(-48 * s, 18 * s, 96 * s, 25 * s, 8 * s)
    .fill(Theme.coinDark)
    .stroke({ color: Theme.gold, width: 4 * s });
  g.circle(-26 * s, 27 * s, 5 * s).fill(Theme.beamHot);
  g.circle(0, 27 * s, 5 * s).fill(Theme.cyanSoft);
  g.circle(26 * s, 27 * s, 5 * s).fill(Theme.green);
}

export function drawCoinIcon(g: Graphics, radius = 18) {
  g.clear();
  g.circle(0, 2, radius).fill(Theme.coinDark);
  g.circle(0, -1, radius).fill(Theme.coin);
  g.circle(0, -1, radius * 0.62)
    .fill({ color: Theme.gold, alpha: 0.22 })
    .stroke({ color: Theme.coinHighlight, width: Math.max(1.5, radius * 0.1), alpha: 0.62 });
  drawStar(g, 0, -1, radius * 0.43, Theme.coinHighlight);
}

function drawStar(g: Graphics, x: number, y: number, radius: number, color: number) {
  const points: number[] = [];
  for (let i = 0; i < 10; i++) {
    const angle = -Math.PI / 2 + i * Math.PI / 5;
    const r = i % 2 === 0 ? radius : radius * 0.45;
    points.push(x + Math.cos(angle) * r, y + Math.sin(angle) * r);
  }
  g.poly(points).fill(color);
}
