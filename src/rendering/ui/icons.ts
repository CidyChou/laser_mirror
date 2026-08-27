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
