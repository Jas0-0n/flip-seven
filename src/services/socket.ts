// ============================================================
// services/socket.ts — WebSocket 客户端封装（支持重连 token）
//
// 重连流程：
// 1. 服务端检测到断线 → 发 disconnect_warning（含 token）
// 2. 客户端存 token + playerId
// 3. 重连时发 reconnect 消息（携带 token）
// 4. 服务端验证通过后恢复完整状态（state_sync）
// ============================================================
import type {
  ClientMessage,
  ServerMessage,
} from "@/types";

type MessageHandler = (msg: ServerMessage) => void;
type StatusHandler = (status: "connecting" | "connected" | "disconnected") => void;

class SocketClient {
  private ws: WebSocket | null = null;
  private url: string;
  private messageHandlers: Set<MessageHandler> = new Set();
  private statusHandlers: Set<StatusHandler> = new Set();
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 10;
  private reconnectDelay = 1000;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private isManualClose = false;

  // 重连 token（断线后由服务端生成）
  private reconnectToken: string | null = null;
  private playerId: number | null = null;
  private roomCode: string | null = null;

  constructor() {
    const protocol = typeof window !== "undefined" && window.location.protocol === "https:" ? "wss" : "ws";
    const wsPort = 3001;
    this.url = `${protocol}://${typeof window !== "undefined" ? window.location.hostname : "localhost"}:${wsPort}`;
  }

  /** 注册消息处理器 */
  onMessage(handler: MessageHandler): () => void {
    this.messageHandlers.add(handler);
    return () => this.messageHandlers.delete(handler);
  }

  /** 注册连接状态处理器 */
  onStatus(handler: StatusHandler): () => void {
    this.statusHandlers.add(handler);
    return () => this.statusHandlers.delete(handler);
  }

  /** 启动连接 */
  connect(roomCode?: string, nickname?: string): void {
    if (this.ws?.readyState === WebSocket.OPEN) return;
    if (this.ws?.readyState === WebSocket.CONNECTING) return;
    this.isManualClose = false;
    this.setStatus("connecting");

    try {
      this.ws = new WebSocket(this.url);

      this.ws.onopen = () => {
        this.reconnectAttempts = 0;
        this.reconnectDelay = 1000;
        this.setStatus("connected");

        // 如果有重连 token，尝试重连；否则发送 connect 消息
        if (this.reconnectToken && this.playerId !== null && this.roomCode && roomCode) {
          this.send({
            type: "reconnect",
            payload: {
              roomCode: this.roomCode,
              playerId: this.playerId,
              token: this.reconnectToken,
            },
          });
        } else if (roomCode && nickname) {
          this.send({ type: "connect", payload: { roomCode, nickname } });
        }
      };

      this.ws.onmessage = (event: MessageEvent) => {
        try {
          const msg = JSON.parse(event.data) as ServerMessage;

          // 处理重连结果
          if (msg.type === "reconnect_result") {
            const payload = msg.payload as { success: boolean; message: string };
            if (payload.success) {
              // clear token after success
              this.reconnectToken = null;
            }
          }

          // 处理断线警告：保存 token 供后续重连用
          if (msg.type === "disconnect_warning") {
            const payload = msg.payload as { token: string; timeoutMs: number; reason: string };
            if (payload.token) {
              this.reconnectToken = payload.token;
            }
          }

          this.messageHandlers.forEach((h) => h(msg));
        } catch {
          // silently ignore malformed messages
        }
      };

      this.ws.onclose = () => {
        this.setStatus("disconnected");
        if (!this.isManualClose) this.scheduleReconnect();
      };

      this.ws.onerror = () => {
        this.ws?.close();
      };
    } catch {
      this.setStatus("disconnected");
      this.scheduleReconnect();
    }
  }

  /** 主动断连 */
  disconnect(): void {
    this.isManualClose = true;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.ws?.close();
    this.ws = null;
  }

  /** 发送消息 */
  send(msg: ClientMessage): void {
    if (this.ws?.readyState !== WebSocket.OPEN) return;
    this.ws.send(JSON.stringify(msg));
  }

  /** 保存 playerId（从服务端 response 中获取） */
  setPlayerId(playerId: number, roomCode: string): void {
    this.playerId = playerId;
    this.roomCode = roomCode;
  }

  // ── 便捷操作封装 ──

  createRoom(nickname: string, playerCount: 2 | 3 | 4): void {
    this.send({ type: "create_room", payload: { nickname, playerCount } });
  }

  joinRoom(roomCode: string, nickname: string): void {
    this.send({ type: "join_room", payload: { roomCode, nickname } });
  }

  ready(): void {
    this.send({ type: "ready" });
  }

  startGame(): void {
    this.send({ type: "start_game" });
  }

  actionFlip(): void {
    this.send({ type: "action_flip" });
  }

  actionStop(): void {
    this.send({ type: "action_stop" });
  }

  actionTarget(targetPlayerId: number): void {
    this.send({ type: "action_target", payload: { targetPlayerId } });
  }

  requestSync(roomCode: string, playerId?: number, token?: string): void {
    this.send({ type: "request_sync", payload: { roomCode, playerId, token } });
  }

  leaveRoom(): void {
    this.send({ type: "leave_room" });
  }

  // ── 内部 ──

  private setStatus(status: "connecting" | "connected" | "disconnected"): void {
    this.statusHandlers.forEach((h) => h(status));
  }

  private scheduleReconnect(): void {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) return;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectAttempts++;
      this.reconnectDelay *= 2;
      // 重连时不发 connect，让 onopen 处理
      if (this.roomCode) {
        this.connect(this.roomCode);
      } else {
        this.connect();
      }
    }, this.reconnectDelay);
  }
}

/** 单例 */
export const socketClient = new SocketClient();
