// ============================================================
// server/socket/handlers.ts — 消息处理器
//
// P0 修复：
// 1. 用 Room.players.get(id) 替代 players[id]（Map API）
// 2. 实现 reconnect_token 机制：断线玩家保留 slot 15s，新 ws
//    携带正确 token 即可恢复位置，不丢失游戏状态
// 3. 重连成功后清除 disconnect 定时器（通过 room.disconnectTimers map）
// 4. pendingBustPlayerId 泄漏：通过 Room.removePlayer 自动清理（重构已涵盖）
// ============================================================
import type { WebSocket } from "ws";
import type {
  ClientMessage,
  ServerMessage,
  GameEvent,
  Room as RoomType,
} from "@/types";
import { Room } from "../game-engine/Room";
import { FEATURE_FLAGS } from "@/config/featureFlags";

// ── 类型 ──
interface ConnectedWebSocket extends WebSocket {
  meta?: {
    playerId: number;
    roomCode: string;
    token?: string; // reconnect token
  };
}

interface RoomMeta {
  room: RoomType;
  connections: Map<number, ConnectedWebSocket>; // 仍用 playerId → ws，用于快速发送
  playerTokens: Map<number, string>; // playerId → reconnect token
  hostId: number;
}

// ── 全局状态 ──
export const rooms = new Map<string, RoomMeta>();

// ── 工具函数 ──

function send(ws: WebSocket, msg: ServerMessage) {
  if (ws.readyState === ws.OPEN) {
    ws.send(JSON.stringify(msg));
  }
}

function broadcast(roomCode: string, event: GameEvent, excludePlayerId?: number) {
  const meta = rooms.get(roomCode);
  if (!meta) return;
  const payload: ServerMessage = { type: "game_event", event };
  meta.connections.forEach((ws, pid) => {
    if (pid !== excludePlayerId && ws.readyState === ws.OPEN) {
      ws.send(JSON.stringify(payload));
    }
  });
}

function stateSync(roomCode: string, targetPlayerId?: number) {
  const meta = rooms.get(roomCode);
  if (!meta) return;
  const state = meta.room.getState();
  if (targetPlayerId !== undefined) {
    const ws = meta.connections.get(targetPlayerId);
    if (ws) send(ws, { type: "state_sync", state });
  } else {
    // 广播给所有连接
    const payload: ServerMessage = { type: "state_sync", state };
    meta.connections.forEach((ws) => {
      if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(payload));
    });
  }
}

// ── 重连 TOKEN 相关 ──

function generateReconnectToken(): string {
  return `rc_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

function scheduleDisconnect(
  roomCode: string,
  playerId: number,
  ws: ConnectedWebSocket
) {
  const meta = rooms.get(roomCode);
  if (!meta) return;

  // 生成重连 token
  const token = generateReconnectToken();
  meta.playerTokens.set(playerId, token);
  meta.room.disconnectTimers.set(playerId, setTimeout(() => {
    handleTimeoutDisconnect(roomCode, playerId);
  }, 15_000));

  // 通知客户端：保留 token，15s 内可重连
  send(ws, {
    type: "disconnect_warning",
    payload: {
      token,
      timeoutMs: 15_000,
      reason: "connection_lost",
    },
  });
}

function handleTimeoutDisconnect(roomCode: string, playerId: number) {
  const meta = rooms.get(roomCode);
  if (!meta) return;
  meta.room.disconnectTimers.delete(playerId);

  const player = meta.room.getPlayer(playerId);
  if (!player) return;

  // 如果玩家重新连接了（ws 存在）则跳过
  const ws = meta.connections.get(playerId);
  if (ws && ws.readyState === ws.OPEN) return;

  // 标记为跳过（不影响其他玩家 ID）
  player.skipped = true;
  player.isConnected = false;
  player.disconnectedAt = Date.now();

  // 转移房主
  if (player.isHost) {
    player.isHost = false;
    // 找到下一个未跳过的活跃玩家
    for (const p of meta.room.players.values()) {
      if (p.id !== playerId && !p.skipped) {
        p.isHost = true;
        break;
      }
    }
  }

  broadcast(roomCode, { type: "player_skipped", playerId });
  stateSync(roomCode);
}

function handleReconnect(
  roomCode: string,
  playerId: number,
  token: string,
  newWs: ConnectedWebSocket
): { success: boolean; message: string } {
  const meta = rooms.get(roomCode);
  if (!meta) return { success: false, message: "房间不存在" };

  // 验证 token
  const expectedToken = meta.playerTokens.get(playerId);
  if (!expectedToken || expectedToken !== token) {
    return { success: false, message: "重连 token 无效或已过期" };
  }

  // 清除定时器
  const timer = meta.room.disconnectTimers.get(playerId);
  if (timer) {
    clearTimeout(timer);
    meta.room.disconnectTimers.delete(playerId);
  }
  meta.playerTokens.delete(playerId);

  const player = meta.room.getPlayer(playerId);
  if (!player) return { success: false, message: "玩家不存在（已离开）" };

  // 更新连接：用新 ws 替换旧 ws
  meta.connections.set(playerId, newWs);
  newWs.meta = { playerId, roomCode };

  // 恢复玩家连接状态
  player.isConnected = true;
  player.disconnectedAt = null;
  // 不重置 skipped，如果被 skip 则保持（玩家选择则通过其他机制恢复）

  // 发送完整状态同步
  send(newWs, {
    type: "state_sync",
    state: meta.room.getState(),
  });

  // 通知其他玩家该玩家已恢复
  broadcast(roomCode, { type: "player_reconnected", playerId });

  return { success: true, message: "重连成功" };
}

// ── 消息处理器 ──

export function handleMessage(
  ws: ConnectedWebSocket,
  raw: string,
  roomCode?: string
) {
  let msg: ClientMessage;
  try {
    msg = JSON.parse(raw);
  } catch {
    return send(ws, { type: "error", payload: { code: "INVALID_JSON", message: "无效 JSON" } });
  }

  switch (msg.type) {
    // ── 连接与重连 ──

    case "connect": {
      const { roomCode: rc, nickname, preferredColor } = msg.payload;
      if (!rc || !nickname) {
        return send(ws, { type: "error", payload: { code: "MISSING_PARAMS", message: "缺少必要参数" } });
      }

      let meta = rooms.get(rc);
      if (!meta) {
        // 创建默认 2 人房间
        const room = new Room(rc, 2);
        meta = {
          room: room as unknown as RoomType,
          connections: new Map(),
          playerTokens: new Map(),
          hostId: 0,
        };
        rooms.set(rc, meta);
      }

      const player = meta.room.addPlayer(nickname, meta.room.players.size === 0);
      meta.connections.set(player.id, ws);
      ws.meta = { playerId: player.id, roomCode: rc };

      send(ws, { type: "player_joined", payload: { playerId: player.id, reconnectToken: "" } });
      broadcast(rc, { type: "player_joined", playerId: player.id }, player.id);
      stateSync(rc);
      break;
    }

    case "reconnect": {
      const { roomCode: rc, playerId, token } = msg.payload;
      if (!rc || playerId === undefined || !token) {
        return send(ws, { type: "error", payload: { code: "MISSING_PARAMS", message: "缺少 reconnect 参数" } });
      }

      const result = handleReconnect(rc, playerId, token, ws);
      send(ws, { type: "reconnect_result", payload: result });
      break;
    }

    case "disconnect_player": {
      const { roomCode: rc, playerId } = msg.payload;
      if (!rc || playerId === undefined) return;
      const meta = rooms.get(rc);
      if (!meta) return;

      const player = meta.room.getPlayer(playerId);
      if (!player) return;
      player.isConnected = false;
      player.disconnectedAt = Date.now();

      scheduleDisconnect(rc, playerId, ws);
      broadcast(rc, { type: "player_disconnected", playerId });
      break;
    }

    // ── 房间设置 ──

    case "set_player_count": {
      if (!roomCode) return;
      const meta = rooms.get(roomCode);
      if (!meta) return;
      const playerId = ws.meta?.playerId;
      if (playerId === undefined) return;

      const player = meta.room.getPlayer(playerId);
      if (!player?.isHost) return;

      const count = msg.payload?.playerCount;
      if (count !== 2 && count !== 3 && count !== 4) return;

      // 通过 type assertion 访问 playerCount
      (meta.room as unknown as { playerCount: 2 | 3 | 4 }).playerCount = count;
      broadcast(roomCode, { type: "player_count_set", playerCount: count });
      stateSync(roomCode);
      break;
    }

    case "set_ready": {
      if (!roomCode) return;
      const meta = rooms.get(roomCode);
      if (!meta) return;
      const playerId = ws.meta?.playerId;
      if (playerId === undefined) return;

      const player = meta.room.getPlayer(playerId);
      if (!player) return;

      player.isReady = msg.payload?.ready ?? false;
      broadcast(roomCode, { type: "ready_changed", playerId, ready: player.isReady });
      stateSync(roomCode);
      break;
    }

    // ── 游戏动作 ──

    case "start_game": {
      if (!roomCode) return;
      const meta = rooms.get(roomCode);
      if (!meta) return;
      const playerId = ws.meta?.playerId;
      if (playerId === undefined) return;

      const player = meta.room.getPlayer(playerId);
      if (!player?.isHost) return;

      if (!meta.room.getAllReady()) return;
      meta.room.initGame();
      broadcast(roomCode, { type: "game_started" });
      stateSync(roomCode);
      break;
    }

    case "action_flip": {
      if (!roomCode) return;
      const meta = rooms.get(roomCode);
      if (!meta) return;
      const playerId = ws.meta?.playerId;
      if (playerId === undefined) return;

      const player = meta.room.getPlayer(playerId);
      if (!player) return;

      // 校验游戏阶段
      if (meta.room.phase !== "playing") {
        return send(ws, { type: "error", payload: { code: "WRONG_PHASE", message: "当前不是 playing 阶段" } });
      }

      // 校验是否轮到该玩家
      if (meta.room.currentPlayerId !== playerId) {
        return send(ws, { type: "error", payload: { code: "NOT_YOUR_TURN", message: "还没轮到你" } });
      }

      // 如果有待决策动作（pendingAction），不接受 flip
      if (meta.room.pendingAction) {
        return send(ws, { type: "error", payload: { code: "PENDING_ACTION", message: "请先完成当前决策" } });
      }

      const result = meta.room.flip(playerId);
      // 使用 type asssertion to access lastFlip
      const lastFlip = (meta.room as unknown as { lastFlip: unknown }).lastFlip;
      send(ws, { type: "flip_result", payload: { ...result, lastFlip } });

      if (result.card) {
        broadcast(roomCode, { type: "card_flipped", card: result.card, byPlayer: playerId });
      }

      if (result.result === "bust") {
        broadcast(roomCode, { type: "player_busted", playerId });
      }

      if (result.result === "flip7") {
        broadcast(roomCode, { type: "flip7_triggered", playerId });
      }

      stateSync(roomCode);
      break;
    }

    case "action_stop": {
      if (!roomCode) return;
      const meta = rooms.get(roomCode);
      if (!meta) return;
      const playerId = ws.meta?.playerId;
      if (playerId === undefined) return;

      const player = meta.room.getPlayer(playerId);
      if (!player) return;

      if (meta.room.phase !== "playing") {
        return send(ws, { type: "error", payload: { code: "WRONG_PHASE", message: "当前不是 playing 阶段" } });
      }

      if (meta.room.currentPlayerId !== playerId) {
        return send(ws, { type: "error", payload: { code: "NOT_YOUR_TURN", message: "还没轮到你" } });
      }

      if (meta.room.pendingAction) {
        return send(ws, { type: "error", payload: { code: "PENDING_ACTION", message: "请先完成当前决策" } });
      }

      const result = meta.room.stop();
      broadcast(roomCode, { type: "player_stopped", playerId, score: result.score });
      stateSync(roomCode);
      break;
    }

    case "confirm_flip": {
      if (!roomCode) return;
      const meta = rooms.get(roomCode);
      if (!meta) return;
      const playerId = ws.meta?.playerId;
      if (playerId === undefined) return;

      const player = meta.room.getPlayer(playerId);
      if (!player) return;

      if (meta.room.pendingBustPlayerId !== playerId) {
        return send(ws, { type: "error", payload: { code: "NO_PENDING_BUST", message: "该玩家没有待确认的爆牌" } });
      }

      // 清空爆牌玩家的手牌到弃牌堆
      meta.room.discard.push(...player.hand, (meta.room as unknown as { lastFlip: unknown }).lastFlip!);
      player.hasBusted = false;
      player.hand = [];
      meta.room.pendingBustPlayerId = null;

      if (meta.room.isRoundOver()) {
        meta.room.startNewRound();
        broadcast(roomCode, { type: "round_ended" });
      } else {
        meta.room.nextPlayer();
      }

      stateSync(roomCode);
      break;
    }

    case "action_freeze": {
      if (!roomCode) return;
      const meta = rooms.get(roomCode);
      if (!meta) return;
      const playerId = ws.meta?.playerId;
      if (playerId === undefined) return;

      if (meta.room.phase !== "playing") return;

      const targetId = msg.payload?.targetId;
      if (targetId === undefined) return;

      const result = meta.room.selectTarget(targetId);
      if (!result.success) return;

      broadcast(roomCode, { type: "player_frozen", targetId, byPlayer: playerId });
      stateSync(roomCode);
      break;
    }

    case "action_flipthree": {
      if (!roomCode) return;
      const meta = rooms.get(roomCode);
      if (!meta) return;
      const playerId = ws.meta?.playerId;
      if (playerId === undefined) return;

      if (meta.room.phase !== "playing") return;

      const targetId = msg.payload?.targetId;
      if (targetId === undefined) return;

      const result = meta.room.selectTarget(targetId);
      if (!result.success) return;

      broadcast(roomCode, { type: "flipthree_done", targetId, byPlayer: playerId });
      stateSync(roomCode);
      break;
    }

    case "action_revive": {
      if (!roomCode) return;
      const meta = rooms.get(roomCode);
      if (!meta) return;
      const playerId = ws.meta?.playerId;
      if (playerId === undefined) return;

      if (meta.room.phase !== "playing") return;

      const targetId = msg.payload?.targetId;
      if (targetId === undefined) return;

      const result = meta.room.selectTarget(targetId);
      if (!result.success) return;

      broadcast(roomCode, { type: "revive_done", targetId, byPlayer: playerId });
      stateSync(roomCode);
      break;
    }

    case "action_skip": {
      if (!roomCode) return;
      const meta = rooms.get(roomCode);
      if (!meta) return;
      const playerId = ws.meta?.playerId;
      if (playerId === undefined) return;

      const player = meta.room.getPlayer(playerId);
      if (!player) return;

      // 跳过：玩家主动跳过当前及后续所有轮次
      player.skipped = true;
      player.isOut = true;

      // 转移房主
      if (player.isHost) {
        player.isHost = false;
        for (const p of meta.room.players.values()) {
          if (p.id !== playerId && !p.skipped) {
            p.isHost = true;
            break;
          }
        }
      }

      broadcast(roomCode, { type: "player_skipped", playerId });
      stateSync(roomCode);
      break;
    }

    case "new_game": {
      if (!roomCode) return;
      const meta = rooms.get(roomCode);
      if (!meta) return;
      const playerId = ws.meta?.playerId;
      if (playerId === undefined) return;

      const player = meta.room.getPlayer(playerId);
      if (!player?.isHost) return;

      meta.room.initGame();
      // 重置所有玩家的 skipped 状态
      for (const p of meta.room.players.values()) {
        if (p.skipped) {
          p.skipped = false;
          p.isOut = false;
        }
      }
      broadcast(roomCode, { type: "game_restarted" });
      stateSync(roomCode);
      break;
    }

    case "request_sync": {
      // 处理同步请求：如果携带 reconnect_token 则尝试重连
      const { roomCode: rc, playerId, token } = msg.payload;
      if (rc && playerId !== undefined && token) {
        const meta = rooms.get(rc);
        if (meta) {
          const result = handleReconnect(rc, playerId, token, ws);
          send(ws, { type: "reconnect_result", payload: result });
        } else {
          send(ws, { type: "error", payload: { code: "ROOM_NOT_FOUND", message: "房间不存在" } });
        }
      } else if (rc) {
        // 无 token：直接同步当前状态
        stateSync(rc);
      }
      break;
    }

    default:
      send(ws, { type: "error", payload: { code: "UNKNOWN_TYPE", message: `未知消息类型: ${(msg as { type: string }).type}` } });
  }
}

// ── 导出工具函数给 server.ts 使用 ──
export { send, broadcast, stateSync, scheduleDisconnect, handleReconnect };
