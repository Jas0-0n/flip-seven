// ============================================================
// src/utils/gameLogger.ts - 用户视角行为日志工具
//
// 格式规则：
//   翻到的牌（"翻到"后面，带引号）：
//     number -> "3"   score -> "+8"   double -> "×2"
//     revive -> "revive"   freeze -> "freeze"   flipthree -> "flip3"
//
//   手牌里的牌名：
//     number -> 3   score -> "+8"   double -> "×2"
//     revive -> revive   freeze -> freeze   flipthree -> flip3
//
//   爆牌标注：3(爆牌)    七连翻标注：7(七连翻)
//
//   轮次结算标签：(STOP) (FREEZE) (爆牌) (七连翻)  或无标签
// ============================================================
import type { Card, GameState, HistoryEntry, Flip3ExecutionResult, StashExecRecord, Flip3FlipRecord } from "@/types";

/** 翻到的牌名（带引号） */
export function formatCardForFlip(card: Card): string {
  switch (card.type) {
    case "number": return `"${card.value}"`;
    case "score": return `"${card.value}"`;
    case "double": return `"×2"`;
    case "revive": return `"revive"`;
    case "freeze": return `"freeze"`;
    case "flipthree": return `"flip3"`;
    default: return `"unknown"`;
  }
}

/** 手牌里的牌名（无引号，加分牌和加倍牌除外） */
export function formatCardInHand(card: Card): string {
  switch (card.type) {
    case "number": return String(card.value);
    case "score": return `"${card.value}"`;
    case "double": return `"×2"`;
    case "revive": return "revive";
    case "freeze": return "freeze";
    case "flipthree": return "flip3";
    default: return "unknown";
  }
}

/** 格式化手牌数组 */
export function formatHand(cards: Card[]): string {
  return cards.map((c) => formatCardInHand(c)).join(", ");
}

/**
 * 格式化爆牌时的手牌（旧手牌 + 触发牌带爆牌标注）
 * @param oldHand 爆牌前的手牌（不含触发牌，state 已被清空，应从 prev 读取）
 * @param triggerCard 触发爆牌的牌
 */
export function formatHandForBust(oldHand: Card[], triggerCard: Card): string {
  const parts = oldHand.map((c) => formatCardInHand(c));
  parts.push(`${formatCardInHand(triggerCard)}(爆牌)`);
  return parts.join(", ");
}

/**
 * 格式化七连翻时的手牌（旧手牌 + 触发牌带七连翻标注）
 * @param oldHand 七连翻前的手牌（不含触发牌，state 已被清空，应从 prev 读取）
 * @param triggerCard 触发七连翻的牌
 */
export function formatHandForFlip7(oldHand: Card[], triggerCard: Card): string {
  const parts = oldHand.map((c) => formatCardInHand(c));
  parts.push(`${formatCardInHand(triggerCard)}(七连翻)`);
  return parts.join(", ");
}

/**
 * 格式化轮次结算中的玩家手牌（flippedCards + 标签）
 * @param entry history 条目
 * @returns 格式化的手牌字符串，如 "1, 2, 3, (STOP)"
 */
export function formatFlippedCardsForRound(entry: HistoryEntry): string {
  const cards = entry.flippedCards ?? [];
  const parts = cards.map((c) => formatCardInHand(c));

  // 确定标签
  let label = "";
  if (entry.isBust) {
    label = "(爆牌)";
  } else if (entry.isFlip7 && entry.actions.includes("flip7")) {
    label = "(七连翻)";
  } else if (entry.actions.includes("freeze")) {
    label = "(FREEZE)";
  } else if (entry.actions.includes("stop")) {
    label = "(STOP)";
  } else if (entry.actions.includes("flipthree")) {
    // 翻三张的 history 条目 - 无标签（被翻三张的目标）
    label = "";
  }
  // scoredByFlip7（被七连翻波及）-> 无标签

  if (label) {
    parts.push(label);
  }
  return parts.join(", ");
}

/**
 * 打印翻三张暂存区执行记录
 * @param stashExecuted 暂存区执行记录数组
 * @param players 玩家列表（用于查找昵称）
 * @param indent 缩进（用于嵌套）
 */
export function printStashExecution(
  stashExecuted: StashExecRecord[],
  players: { id: number; nickname: string }[],
  indent = ""
): void {
  for (const rec of stashExecuted) {
    const cardName = formatCardInHand(rec.card);
    const playerNick = (id: number) => players.find((p) => p.id === id)?.nickname ?? `玩家${id}`;

    switch (rec.action) {
      case "scored":
        console.log(`${indent}- ${cardName}加入手牌`);
        break;
      case "revive":
        console.log(`${indent}- revive加入手牌`);
        break;
      case "revive_transferred":
        console.log(`${indent}- revive转赠给${playerNick(rec.reviveTargetId!)}`);
        break;
      case "revive_discarded":
        console.log(`${indent}- revive无转赠目标，进入弃牌堆`);
        break;
      case "freeze":
        console.log(`${indent}- freeze执行：${playerNick(rec.freezeTargetId!)}被冻结`);
        break;
      case "freeze_discarded":
        console.log(`${indent}- freeze无目标，进入弃牌堆`);
        break;
      case "flip3_nested":
        if (rec.nestedResult) {
          const nestedTarget = playerNick(rec.nestedResult.targetId);
          console.log(`${indent}- flip3嵌套执行：${nestedTarget}被迫翻3张`);
          printFlip3Flips(rec.nestedResult.flips, nestedTarget, players, indent + "  ");
          if (rec.nestedResult.stashExecuted.length > 0) {
            console.log(`${indent}  3张翻完，执行暂存区：`);
            printStashExecution(rec.nestedResult.stashExecuted, players, indent + "  ");
          }
        }
        break;
      case "flip3_discarded":
        console.log(`${indent}- flip3无目标，进入弃牌堆`);
        break;
    }
  }
}

/**
 * 打印翻三张的翻牌记录
 * @param flips 翻牌记录数组
 * @param targetName 目标玩家昵称
 * @param players 玩家列表
 * @param indent 缩进
 */
export function printFlip3Flips(
  flips: Flip3FlipRecord[],
  targetName: string,
  players: { id: number; nickname: string }[],
  indent = ""
): void {
  flips.forEach((flip, i) => {
    const cardName = formatCardForFlip(flip.card);
    const flipNum = i + 1;
    let suffix = "";
    if (flip.action === "stashed") {
      suffix = "（暂存）";
    } else if (flip.busted) {
      suffix = "，检测到爆牌，Trigger爆牌动画";
    } else if (flip.triggerFlip7) {
      suffix = "，检测到七连翻，Trigger七连翻动画";
    } else if (flip.action === "bust_saved") {
      suffix = "，复活牌抵消，继续翻牌";
    }
    console.log(`${indent}${targetName}翻开第${flipNum}张：${cardName}${suffix}`);
  });
}
