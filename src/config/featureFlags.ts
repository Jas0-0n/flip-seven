// ============================================================
// config/featureFlags.ts — Feature Flag 配置
// ============================================================
// 所有高级功能通过环境变量控制，默认全部关闭。
// 关闭时牌组只保留基础数字牌，用于测试最低完成度。

const ENABLE_SCORE_CARDS = true; // process.env.NEXT_PUBLIC_ENABLE_SCORE_CARDS === "true";
const ENABLE_DOUBLE_CARD = true; // process.env.NEXT_PUBLIC_ENABLE_DOUBLE_CARD === "true";
const ENABLE_FREEZE_CARD = true; // process.env.NEXT_PUBLIC_ENABLE_FREEZE_CARD === "true";
const ENABLE_FLIPTHREE_CARD = process.env.NEXT_PUBLIC_ENABLE_FLIPTHREE_CARD === "true";
const ENABLE_REVIVE_CARD = true; // process.env.NEXT_PUBLIC_ENABLE_REVIVE_CARD === "true";

export const FEATURE_FLAGS = {
  /** +2 +4 +6 +8 +10 分数调整牌 */
  ENABLE_SCORE_CARDS,

  /** x2 翻倍牌 */
  ENABLE_DOUBLE_CARD,

  /** 冻结牌（行动牌：强制结束某玩家回合） */
  ENABLE_FREEZE_CARD,

  /** 翻三张牌（行动牌：指定玩家翻 3 张） */
  ENABLE_FLIPTHREE_CARD,

  /** 复活牌（功能牌：抵消一次判负） */
  ENABLE_REVIVE_CARD,

  /** 所有特殊牌（分数 + 翻倍） */
  get enableAnySpecial(): boolean {
    return ENABLE_SCORE_CARDS || ENABLE_DOUBLE_CARD;
  },

  /** 所有行动牌（冻结 + 翻三张） */
  get enableAnyAction(): boolean {
    return ENABLE_FREEZE_CARD || ENABLE_FLIPTHREE_CARD;
  },

  /** 是否启用任意非数字牌（用于牌组构建判断） */
  get enableAnyNonNumber(): boolean {
    return (
      ENABLE_SCORE_CARDS ||
      ENABLE_DOUBLE_CARD ||
      ENABLE_FREEZE_CARD ||
      ENABLE_FLIPTHREE_CARD ||
      ENABLE_REVIVE_CARD
    );
  },
} as const;

export type FeatureFlags = typeof FEATURE_FLAGS;
