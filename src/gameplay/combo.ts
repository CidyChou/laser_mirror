export const COMBO_VISIBLE_FROM = 2;
export const MAX_COMBO_COUNT = 99;

export type ComboTier = 1 | 2 | 3;
export type ComboAudioIndex = 1 | 2 | 3 | 4 | 5 | 6;

const COMBO_AUDIO_MILESTONES = new Map<number, ComboAudioIndex>([
  [2, 1],
  [3, 2],
  [5, 3],
  [8, 4],
  [12, 5],
  [20, 6],
]);

export function comboTierForCount(count: number): ComboTier {
  if (count >= 5) return 3;
  if (count >= 3) return 2;
  return 1;
}

export function comboPraiseForCount(count: number): string {
  const tier = comboTierForCount(count);
  if (tier === 3) return '势不可挡！';
  if (tier === 2) return '火力全开！';
  return '漂亮连击！';
}

export function comboAudioIndex(count: number): ComboAudioIndex | null {
  const safeCount = Math.max(0, Math.floor(count));
  return COMBO_AUDIO_MILESTONES.get(safeCount) ?? (safeCount > 20 && safeCount % 5 === 0 ? 6 : null);
}

export function isComboMilestone(count: number): boolean {
  return comboAudioIndex(count) !== null;
}
