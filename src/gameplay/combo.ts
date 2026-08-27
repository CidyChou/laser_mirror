export const COMBO_VISIBLE_FROM = 2;
export const MAX_COMBO_COUNT = 99;

export type ComboTier = 1 | 2 | 3;

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

export function comboAudioIndex(count: number): 1 | 2 | 3 | 4 | 5 | 6 {
  return Math.min(6, Math.max(1, Math.floor(count) - 1)) as 1 | 2 | 3 | 4 | 5 | 6;
}
