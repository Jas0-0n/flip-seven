// ============================================================
// types/events.ts — WebSocket 消息协议
// ============================================================
import type { GameState } from "./game-state";

// ====== 客户端 → 服务端 ======

export type ClientMessage =
  | { type: "connect"; payload: { roomCode: string; nickname: string; preferredColor?: string } }
  | { type: "reconnect"; payload: { roomCode: string; playerId: number; token: string } }
  | { type: "disconnect_player"; payload: { roomCode: string; playerId: number } }
  | { type: "create_room"; payload: { nickname: string; playerCount: 2 | 3 | 4 } }
  | { type: "join_room"; payload: { roomCode: string; nickname: string } }
  | { type: "set_player_count"; payload: { playerCount: 2 | 3 | 4 } }
  | { type: "set_ready"; payload: { ready: boolean } }
  | { type: "ready" }
  | { type: "start_game" }
  | { type: "action_flip" }
  | { type: "confirm_flip"; payload: {} }
  | { type: "action_stop" }
  | { type: "action_freeze"; payload: { targetId: number } }
  | { type: "action_flipthree"; payload: { targetId: number } }
  | { type: "action_revive"; payload: { targetId: number } }
  | { type: "action_target"; payload: { targetPlayerId: number } }
  | { type: "action_skip" }
  | { type: "new_game" }
  | { type: "request_sync"; payload: { roomCode: string; playerId?: number; token?: string } }
  | { type: "leave_room" }
  | { type: "kick_player"; payload: { playerId: number } }
  | { type: "flip3_next"; payload: {} };

// ====== 服务端 → 客户端 ======

export type ServerMessage =
  | { type: "player_joined"; payload: { playerId: number; reconnectToken: string } }
  | { type: "reconnect_result"; payload: { success: boolean; message: string } }
  | { type: "disconnect_warning"; payload: { token: string; timeoutMs: number; reason: string } }
  | { type: "room_update"; payload: { players: GameState["players"]; phase: GameState["phase"]; roomCode: string; hostId: number; selfId: number } }
  | { type: "game_start"; payload: GameState }
  | { type: "game_started"; payload: {} }
  | { type: "game_restarted"; payload: {} }
  | { type: "state_sync"; payload: GameState }
  | { type: "host_changed"; payload: { newHostId: number } }
  | { type: "ready_changed"; payload: { playerId: number; ready: boolean } }
  | { type: "player_count_set"; payload: { playerCount: 2 | 3 | 4 } }
  | { type: "player_joined_game"; payload: { playerId: number } }
  | { type: "player_disconnected"; payload: { playerId: number } }
  | { type: "player_reconnected"; payload: { playerId: number } }
  | { type: "player_skipped"; payload: { playerId: number } }
  | { type: "player_busted"; payload: { playerId: number } }
  | { type: "player_stopped"; payload: { playerId: number; score: number } }
  | { type: "player_frozen"; payload: { targetId: number; byPlayer: number } }
  | { type: "flipthree_done"; payload: { targetId: number; byPlayer: number; executionResult?: any } }
  | { type: "flip3_flip_result"; payload: { 
      targetId: number; 
      byPlayer: number; 
      flipNumber: 1 | 2 | 3; 
      card: any; 
      result: "continue" | "bust" | "flip7"; 
      busted?: boolean; 
      flip7Triggered?: boolean 
    } }
  | { type: "revive_done"; payload: { targetId: number; byPlayer: number } }
  | { type: "flip7_triggered"; payload: { playerId: number } }
  | { type: "round_ended"; payload: {} }
  | { type: "card_flipped"; payload: { card: any; byPlayer: number } }
  | { type: "flip_result"; payload: { success: boolean; result: string; card?: any; lastFlip?: any; message: string } }
  | { type: "error"; payload: { code: string; message: string } };

// 游戏事件（广播用）
export type GameEvent =
  | { type: "player_joined"; playerId: number }
  | { type: "player_disconnected"; playerId: number }
  | { type: "player_reconnected"; playerId: number }
  | { type: "player_skipped"; playerId: number }
  | { type: "player_busted"; playerId: number }
  | { type: "player_stopped"; playerId: number; score: number }
  | { type: "player_frozen"; targetId: number; byPlayer: number }
  | { type: "flipthree_done"; targetId: number; byPlayer: number; executionResult?: any }
  | { type: "revive_done"; targetId: number; byPlayer: number }
  | { type: "flip7_triggered"; playerId: number }
  | { type: "round_ended" }
  | { type: "game_started" }
  | { type: "game_restarted" }
  | { type: "card_flipped"; card: any; byPlayer: number }
  | { type: "player_count_set"; playerCount: 2 | 3 | 4 }
  | { type: "ready_changed"; playerId: number; ready: boolean };
