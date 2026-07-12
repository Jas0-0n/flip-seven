// ============================================================
// types/card.ts — 卡牌类型定义
// ============================================================

/** 数字牌 */
export interface NumberCard {
  type: "number";
  value: number; // 0~12
  id: string;
}

/** 分数调整牌：+2 +4 +6 +8 +10 */
export interface ScoreCard {
  type: "score";
  value: string; // "+2" | "+4" | "+6" | "+8" | "+10"
  effect: number;
  id: string;
}

/** 翻倍牌：x2 */
export interface DoubleCard {
  type: "double";
  value: "x2";
  effect: "multiply";
  id: string;
}

/** 冻结牌 */
export interface FreezeCard {
  type: "freeze";
  value: "freeze";
  effect: "freeze";
  id: string;
}

/** 翻三张牌 */
export interface FlipThreeCard {
  type: "flipthree";
  value: "flipthree";
  effect: "flipthree";
  id: string;
}

/** 复活牌（二次机会牌） */
export interface ReviveCard {
  type: "revive";
  value: "revive";
  effect: "revive";
  id: string;
}

/** 卡牌联合类型 */
export type Card =
  | NumberCard
  | ScoreCard
  | DoubleCard
  | FreezeCard
  | FlipThreeCard
  | ReviveCard;

/** 牌堆类型 */
export type DeckType = Card[];
