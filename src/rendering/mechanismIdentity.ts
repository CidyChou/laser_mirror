import type { LevelItem } from '../gameplay/types';

export type MechanismIdentity = { label: string; color: number };
const colors = [0xa994ff, 0x51dce8, 0xffb951, 0xff83b0, 0x85d86a, 0x729eff, 0xf08a57, 0xd3d866];

/** Assign identities from all IDs, not from item order or a lossy ID hash. */
export function mechanismIdentities(items: LevelItem[], kind: 'portal' | 'switch') {
  const ids = [...new Set(items.flatMap(item =>
    kind === 'portal' && item.type === 'portal' ? [item.pair]
      : kind === 'switch' && item.type === 'switch' ? [item.id] : []))].sort();
  const used = new Set<number>();
  return new Map(ids.map((id, index) => {
    let color = colors[index];
    if (color === undefined) {
      // Golden-angle hues extend the palette without cycling back to prior colors.
      let hue = index * 137.508;
      do {
        const h = ((hue % 360) + 360) % 360 / 60, x = 1 - Math.abs(h % 2 - 1);
        const rgb = h < 1 ? [1,x,0] : h < 2 ? [x,1,0] : h < 3 ? [0,1,x]
          : h < 4 ? [0,x,1] : h < 5 ? [x,0,1] : [1,0,x];
        color = rgb.reduce((value, channel) => (value << 8) | Math.round(70 + channel * 170), 0);
        hue += 11;
      } while (used.has(color));
    }
    used.add(color);
    return [id, { label: kind === 'portal' ? String(index + 1) : letter(index), color }] as const;
  }));
}

function letter(index: number): string {
  return index < 26 ? String.fromCharCode(65 + index) : letter(Math.floor(index / 26) - 1) + letter(index % 26);
}
