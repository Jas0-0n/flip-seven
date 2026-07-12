// ============================================================
// utils/calculateScore.ts — 计分函数
// ============================================================
import { FEATURE_FLAGS } from "@/config/featureFlags";
import type { Card, ScoreCard, DoubleCard } from "@/types/card";

/**
 * 计算手牌的本回合得分（官方规则）
 * 
 * 计分顺序：
 * 1. 累加数字牌
 * 2. 应用加倍牌（×2）
 * 3. 加分数调整牌（+2/+4/+6/+8/+10）
 * 4. 加七连翻奖励（+15）
 * 
 * @param hand               玩家手牌
 * @param bonusPoints        Flip 7 奖励分数（0 | 15）
 * @returns                  本回合总得分
 */
export function calculateRoundScore(
  hand: Card[],
  bonusPoints: number = 0
): number {
  let sum = 0;
  let doubleActive = false;
  const scoreAdjust: number[] = [];

  for (const card of hand) {
    switch (card.type) {
      case "number":
        sum += card.value;
        break;

      case "score":
        if (FEATURE_FLAGS.ENABLE_SCORE_CARDS) {
          scoreAdjust.push((card as ScoreCard).effect);
        }
        break;

      case "double":
        if (FEATURE_FLAGS.ENABLE_DOUBLE_CARD) {
          doubleActive = true;
        }
        break;

      // freeze / flipthree / revive 不计分
      default:
        break;
    }
  }

  // Step 2: 加倍牌只翻倍数字牌
  if (doubleActive) {
    sum *= 2;
  }

  // Step 3: 分数调整牌不被翻倍，直接加
  for (const s of scoreAdjust) {
    sum += s;
  }

  // Step 4: 七连翻奖励
  return sum + bonusPoints;
}

/**
 * 检查手牌是否达 7 张（用于触发 Flip 7）
 */
export function isFlipSeven(hand: Card[]): boolean {
  return hand.filter((c) => c.type === "number").length >= 7;
}

/**
 * 检查翻到数字牌是否重复
 */
export function isDuplicate(card: Card, hand: Card[]): boolean {
  if (card.type !== "number") return false;
  return hand.some(
    (c) => c.type === "number" && (c as { value: number }).value === card.value
  );
}

/**
 * 检查手牌中是否有复活牌
 */
export function hasReviveCard(hand: Card[]): boolean {
  if (!FEATURE_FLAGS.ENABLE_REVIVE_CARD) return false;
  return hand.some((c) => c.type === "revive");
}

/**
 * 从手牌中移除一张复活牌并返回
 */
export function consumeReviveCard(hand: Card[]): {
  newHand: Card[];
  consumed: Card | null;
} {
  const idx = hand.findIndex((c) => c.type === "revive");
  if (idx === -1) return { newHand: hand, consumed: null };
  const newHand = [...hand];
  const [consumed] = newHand.splice(idx, 1);
  return { newHand, consumed };
}
