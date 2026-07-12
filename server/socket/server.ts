// ============================================================
// server/socket/server.ts — WebSocket 服务器入口
//
// 新特性：
// - 重连 token 机制已集成到 handlers.ts 中
// - 断线时调用 scheduleDisconnect（15s 保留期）
// - 期间内携带 token 可恢复位置
// - 单条消息 maxPayload 限制（防内存溢出）
// - 客户端操作频率限制（rate limit）
// ============================================================
import { WebSocketServer, WebSocket } from "ws";
import { handleMessage } from "./handlers";

const PORT = parseInt(process.env.WS_PORT || "3001", 10);
const MAX_PAYLOAD_BYTES = 64 * 1024; // 64KB
const RATE_LIMIT_WINDOW_MS = 1000;  // 1s 窗口
const RATE_LIMIT_MAX = 30;          // 每窗口最多 30 条消息

interface ConnectedWebSocket extends WebSocket {
  meta?: {
    playerId: number;
    roomCode: string;
    token?: string;
  };
  /** 频率限制桶 */
  _rateBucket?: {
    count: number;
    resetAt: number;
  };
}

export function createSocketServer() {
  const wss = new WebSocketServer({
    port: PORT,
    maxPayload: MAX_PAYLOAD_BYTES,
  });

  wss.on("connection", (ws: ConnectedWebSocket) => {
    // 初始化频率限制桶
    ws._rateBucket = { count: 0, resetAt: Date.now() + RATE_LIMIT_WINDOW_MS };

    ws.on("message", (data) => {
      // ── 频率限制检查 ──
      const now = Date.now();
      if (ws._rateBucket) {
        if (now >= ws._rateBucket.resetAt) {
          ws._rateBucket.count = 0;
          ws._rateBucket.resetAt = now + RATE_LIMIT_WINDOW_MS;
        }
        ws._rateBucket.count++;
        if (ws._rateBucket.count > RATE_LIMIT_MAX) {
          // 直接关闭超限连接
          ws.close(4001, "RATE_LIMIT_EXCEEDED");
          return;
        }
      }

      const raw = data.toString();
      handleMessage(ws, raw, ws.meta?.roomCode);
    });

    ws.on("close", () => {
      // 不立即处理，由客户端主动发送 disconnect_player 消息
      // 如果客户端已断开，PING/PONG 会最终检测到

      // 备用：如果 meta 存在，trigger 一个 disconnect_player
      if (ws.meta && ws.meta.roomCode && ws.meta.playerId !== undefined) {
        handleMessage(ws, JSON.stringify({
          type: "disconnect_player",
          payload: {
            roomCode: ws.meta.roomCode,
            playerId: ws.meta.playerId,
          },
        }), ws.meta.roomCode);
      }
    });

    ws.on("error", (err) => {
      console.error("WebSocket error:", err);
    });
  });

  console.log(`✅ WebSocket 服务器已启动，端口 ${PORT}，maxPayload=${MAX_PAYLOAD_BYTES}B，rate=${RATE_LIMIT最大}/${RATE_LIMIT_WINDOW_MS}ms`);
  return wss;
}
