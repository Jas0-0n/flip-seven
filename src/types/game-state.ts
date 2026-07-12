// ============================================================
// types/game-state.ts — 完整游戏状态
// ============================================================
import type { Card } from "./card";
import type { Player } from "./player";

/** 游戏状态枚举 */
export type GamePhase =
  | "waiting" // 等待加入
  | "lobby" // 房间Lobby（已加入，等待准备）
  | "playing" // 游戏进行中
  | "roundEnd" // 回合结束
  | "ended"; // 游戏结束

/** 翻牌/结算动画类型 */
export type AnimationType =
  | "flip"
  | "bust"
  | "flip7"
  | "freeze"
  | "flipthree"
  | "revive";

/** 游戏内消息记录 */
export interface HistoryEntry {
  round: number;
  playerId: number;
  actions: string[];
  scoreGained: number;
  isBust: boolean;
  isFlip7: boolean;
  isRevive: boolean;
  /** 是否是受七连翻影响而结算的（非触发者） */
  scoredByFlip7?: boolean;
  /** 触发爆牌/七连翻的那张牌 */
  triggerCard?: Card;
  /** 本轮翻到的所有牌 */
  flippedCards?: Card[];
}

/** 核心游戏状态（服务端权威） */
export interface GameState {
  roomCode: string;
  phase: GamePhase;
  players: Player[];
  currentPlayerId: number; // 当前操作玩家
  roundNumber: number;
  deck: Card[]; // 未翻牌牌堆
  discard: Card[]; // 弃牌堆
  lastFlip: Card | null; // 最近一张翻开的牌
  pendingAction: PendingAction | null; // 等待玩家决策（冻结/翻三张目标选择）
  history: HistoryEntry[];
  winnerId: number | null;
  createdAt: number;
  updatedAt: number;
}

/** 等待决策的动作 */
export interface PendingAction {
  type: "freeze" | "flipthree" | "revive";
  actorId: number; // 触发者
  targetId: number | null; // 目标（待选择）
}
