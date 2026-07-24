import type { Card } from "@/types";

const typeOrder: Record<Card["type"], number> = {
  number: 0,
  score: 1,
  double: 2,
  freeze: 3,
  flipthree: 4,
  revive: 5,
};

/**
 * 手牌纯展示排序：数字牌按 value 升序，功能牌按固定类型顺序
 * 不改变服务端权威数据，仅用于前端渲染
 */
export function sortHandForDisplay(hand: Card[]): Card[] {
  return [...hand].sort((a, b) => {
    const oa = typeOrder[a.type];
    const ob = typeOrder[b.type];
    if (oa !== ob) return oa - ob;
    if (a.type === "number" && b.type === "number") return a.value - b.value;
    return 0;
  });
}
