// ============================================================
// src/utils/cardImages.ts — 卡牌图片路径工具函数
// ============================================================
import type { Card } from "@/types";

/**
 * 根据卡牌类型返回对应的图片路径
 * 统一 GameCard / FlipCard / GameBoard / RoundSummary 的映射逻辑
 */
export function getCardImage(card: Card): string {
  switch (card.type) {
    case "number":
      return `/images/card_${card.value}.png`;
    case "score":
      return `/images/card_plus_${(card.value as string).replace("+", "")}.png`;
    case "double":
      return "/images/card_times_2.png";
    case "freeze":
      return "/images/card_freeze.png";
    case "flipthree":
      return "/images/card_flip_three.png";
    case "revive":
      return "/images/card_revive.png";
    default:
      return "/images/card_0.png";
  }
}
