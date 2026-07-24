// ============================================================
// types/player.ts — 玩家类型定义
// ============================================================
import type { Card } from "./card";

export interface Player {
  id: number;
  nickname: string;
  hand: Card[];
  score: number; // 累计总分
  isHost: boolean;
  isReady: boolean;
  isConnected: boolean; // 是否在线
  disconnectedAt: number | null; // 断线时间戳（ms）
  hasBusted: boolean; // 本回合是否已判负
  /** 本回合结束原因，用于玩家头像/昵称旁状态提示 */
  endReason?: "bust" | "freeze" | "stop" | "flip7" | "deck_end" | "skipped" | null;
  isOut: boolean; // 是否已出局（本回合已结算或判负）
  skipped: boolean; // 是否已被跳过（断线超时）
}
