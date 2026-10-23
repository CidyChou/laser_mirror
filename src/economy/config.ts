/** Small, bounded first-clear rewards; earning stays ahead of early-life needs. */
export const ECONOMY = {
  starterCoins: 40,
  heartPrice: 20,
  fullHeartPrice: 80,
  heartRecoveryMs: 10 * 60 * 1000,
  firstClearTiers: [
    { through: 10, coins: 6 },
    { through: 30, coins: 8 },
    { through: 80, coins: 10 },
    { through: 140, coins: 12 },
    { through: 200, coins: 14 },
  ],
} as const;
