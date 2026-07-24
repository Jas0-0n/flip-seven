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
  lastFlipPlayerId: number | null; // 新增：谁翻的这张牌
  lastFlipResult: "continue" | "bust" | "flip7" | "pending_action" | null; // 新增：翻牌结果
  pendingAction: PendingAction | null; // 等待玩家决策（冻结/翻三张目标选择）
  /** flip3 正在执行时用于隔离普通翻牌状态同步 */
  flip3Active?: boolean;
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

/** 翻三张序列中单次翻牌记录 */
export interface Flip3FlipRecord {
  card: Card;
  action: "entered_hand" | "stashed" | "bust_saved" | "bust";
  busted: boolean;
  triggerFlip7: boolean;
}

/** 暂存区单张牌的执行记录 */
export interface StashExecRecord {
  card: Card;
  action: "scored" | "freeze" | "revive" | "revive_transferred" | "revive_discarded" | "flip3_nested" | "flip3_discarded" | "freeze_discarded";
  nestedResult?: Flip3ExecutionResult;
  freezeTargetId?: number;
  reviveTargetId?: number;
}

/** 翻三张序列的完整执行结果 */
export interface Flip3ExecutionResult {
  targetId: number;
  layer: number;
  flips: Flip3FlipRecord[];
  stash: Card[];
  stashExecuted: StashExecRecord[];
  busted: boolean;
  flip7Triggered: boolean;
  flipsDone: number;
}
