// ============================================================
// utils/buildDeck.ts — 牌组构建（数据驱动 + Feature Flag）
// ============================================================
import { FEATURE_FLAGS } from "@/config/featureFlags";
import type {
  Card,
  NumberCard,
  ScoreCard,
  DoubleCard,
  FreezeCard,
  FlipThreeCard,
  ReviveCard,
} from "@/types/card";

/**
 * 构建一副符合当前 Feature Flag 配置的牌组
 * 数字牌始终存在，其余按配置开关决定是否加入
 */
export function buildDeck(): Card[] {
  const cards: Card[] = [];

  // ── 数字牌（始终加入） ──
  // value=0 只有 1 张，value=N 有 N 张（N=1~12）
  for (let value = 0; value <= 12; value++) {
    const count = value === 0 ? 1 : value;
    for (let i = 0; i < count; i++) {
      cards.push({
        type: "number",
        value,
        id: `n${value}_${i}`,
      } satisfies NumberCard);
    }
  }

  // ── 特殊牌（Feature Flag 控制） ──
  if (FEATURE_FLAGS.ENABLE_SCORE_CARDS) {
    const scoreEffects: Array<{ value: string; effect: number }> = [
      { value: "+2", effect: 2 },
      { value: "+4", effect: 4 },
      { value: "+6", effect: 6 },
      { value: "+8", effect: 8 },
      { value: "+10", effect: 10 },
    ];
    for (const sc of scoreEffects) {
      for (let i = 0; i < 3; i++) {
        cards.push({
          type: "score",
          value: sc.value,
          effect: sc.effect,
          id: `sp_${sc.value}_${i}`,
        } satisfies ScoreCard);
      }
    }
  }

  if (FEATURE_FLAGS.ENABLE_DOUBLE_CARD) {
    for (let i = 0; i < 3; i++) {
      cards.push({
        type: "double",
        value: "x2",
        effect: "multiply",
        id: `sp_x2_${i}`,
      } satisfies DoubleCard);
    }
  }

  // ── 行动牌（Feature Flag 控制） ──
  if (FEATURE_FLAGS.ENABLE_FREEZE_CARD) {
    for (let i = 0; i < 10; i++) {
      cards.push({
        type: "freeze",
        value: "freeze",
        effect: "freeze",
        id: `frz_${i}`,
      } satisfies FreezeCard);
    }
  }

  if (FEATURE_FLAGS.ENABLE_FLIPTHREE_CARD) {
    for (let i = 0; i < 3; i++) {
      cards.push({
        type: "flipthree",
        value: "flipthree",
        effect: "flipthree",
        id: `f3_${i}`,
      } satisfies FlipThreeCard);
    }
  }

  // ── 功能牌（Feature Flag 控制） ──
  if (FEATURE_FLAGS.ENABLE_REVIVE_CARD) {
    for (let i = 0; i < 10; i++) {
      cards.push({
        type: "revive",
        value: "revive",
        effect: "revive",
        id: `rv_${i}`,
      } satisfies ReviveCard);
    }
  }

  return cards;
}

/**
 * Fisher-Yates 洗牌
 */
export function shuffle<T>(array: T[]): T[] {
  const arr = [...array];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/**
 * 从弃牌堆补充到牌堆
 */
export function refillDeck(discard: Card[]): Card[] {
  return shuffle(discard);
}
