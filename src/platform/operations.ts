export type RewardPlacement = 'hearts' | 'coins' | 'hint' | 'double';
export type RewardOutcome = 'rewarded' | 'cancelled' | 'unavailable' | 'busy' | 'error';
export interface OperationContext { stage: string; screen: string }
/** All coordinates and dimensions are native window pixels, not design pixels. */
export interface NativeAdRect { x: number; y: number; width: number; height: number }
export interface GameAds {
  canReward(placement: RewardPlacement): boolean;
  preloadRewards(placements: readonly RewardPlacement[]): void;
  showReward(placement: RewardPlacement, context: OperationContext): Promise<RewardOutcome>;
  reportReward(placement: RewardPlacement, context: OperationContext, amount: number): void;
  canInterstitial(): boolean;
  preloadInterstitial(): void;
  showInterstitial(context: OperationContext): Promise<boolean>;
  menuSize(): { width: number; height: number } | null;
  onMenuChange?(handler: () => void): () => void;
  setMenuPlacement(rect: NativeAdRect | null): void;
  destroy(): void;
}
export type CommunityTarget = 'club' | 'help' | 'recommend' | 'circleRecommend';
export type CommunityOutcome = 'opened' | 'unavailable' | 'busy' | 'error';
export interface GameCommunity {
  canOpen(target: CommunityTarget): boolean;
  open(target: CommunityTarget, context: OperationContext): Promise<CommunityOutcome>;
  isRecommended(): boolean;
  /** A canvas gesture proves that a native page has returned, even on older SDKs. */
  onGameInteraction(): void;
  destroy(): void;
}
