// ============================================================
// types/index.ts — 类型统一导出
// ============================================================
export type {
  Card,
  NumberCard,
  ScoreCard,
  DoubleCard,
  FreezeCard,
  FlipThreeCard,
  ReviveCard,
  DeckType,
} from "./card";
export type { Player } from "./player";
export type {
  GameState,
  GamePhase,
  AnimationType,
  HistoryEntry,
  PendingAction,
  Flip3FlipRecord,
  StashExecRecord,
  Flip3ExecutionResult,
} from "./game-state";
export type { ClientMessage, ServerMessage } from "./events";
