// ============================================================
// T2: End-to-End Start Game Flow Test — 完整游戏开始流程
//
// 模拟真实 WebSocket 客户端跑完整流程：
//   创建房间 → 加入 → 准备 → 开始游戏 → 验证游戏开始
//
// Run: npx tsx server/socket/tests/start-game-flow.test.ts
// ============================================================
import { WebSocket } from "ws";

let passed = 0;
let failed = 0;

function test(name: string, fn: () => void | Promise<void>) {
  return new Promise<void>(async (resolve) => {
    try {
      await fn();
      console.log(`  ✅ ${name}`);
      passed++;
    } catch (e: any) {
      console.error(`  ❌ ${name}: ${e.message}`);
      failed++;
    }
    resolve();
  });
}

function assert(condition: boolean, msg: string) {
  if (!condition) throw new Error(msg);
}

// ── 辅助：WebSocket 客户端包装 ──
class TestClient {
  ws: WebSocket;
  messages: any[] = [];
  private awaiters: { predicate: (msg: any) => boolean; resolve: (msg: any) => void }[] = [];

  constructor(private url: string, private nickname: string) {
    this.ws = new WebSocket(url);
    this.ws.on("message", (data) => {
      const msg = JSON.parse(data.toString());
      this.messages.push(msg);
      // 检查 awaiters
      for (let i = this.awaiters.length - 1; i >= 0; i--) {
        if (this.awaiters[i].predicate(msg)) {
          this.awaiters[i].resolve(msg);
          this.awaiters.splice(i, 1);
        }
      }
    });
  }

  open(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.ws.on("open", () => resolve());
      this.ws.on("error", (err) => reject(err));
      setTimeout(() => reject(new Error("连接超时")), 5000);
    });
  }

  send(msg: object) {
    this.ws.send(JSON.stringify(msg));
  }

  // 等待特定类型的消息
  waitFor(type: string, timeout = 5000): Promise<any> {
    // 先检查已有消息
    const existing = this.messages.find((m) => m.type === type);
    if (existing) return Promise.resolve(existing);

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        const idx = this.awaiters.findIndex((a) => a.predicate((m) => m.type === type));
        if (idx >= 0) this.awaiters.splice(idx, 1);
        reject(new Error(`等待 ${type} 超时 (${timeout}ms)`));
      }, timeout);

      this.awaiters.push({
        predicate: (m) => m.type === type,
        resolve: (msg) => {
          clearTimeout(timer);
          resolve(msg);
        },
      });
    });
  }

  // 等待满足条件的消息（过滤旧的）
  async waitForPredicate(predicate: (msg: any) => boolean, timeout = 5000): Promise<any> {
    // 先检查已有消息
    const existing = this.messages.find(predicate);
    if (existing) return existing;

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        const idx = this.awaiters.findIndex((a) => a.predicate === predicate);
        if (idx >= 0) this.awaiters.splice(idx, 1);
        reject(new Error(`等待条件消息超时 (${timeout}ms)`));
      }, timeout);

      this.awaiters.push({
        predicate,
        resolve: (msg: any) => {
          clearTimeout(timer);
          resolve(msg);
        },
      });
    });
  }

  close() {
    this.ws.close();
  }
}

// ── 测试配置 ──
const TEST_PORT = 3099;
const WS_URL = `ws://localhost:${TEST_PORT}`;

async function main() {
  // 用测试端口启动服务器（必须在 import server 之前设置 WS_PORT）
  process.env.WS_PORT = String(TEST_PORT);
  const { createSocketServer } = await import("../server");
  const wss = createSocketServer();

  // 等待服务器就绪
  await new Promise<void>((resolve) => setTimeout(resolve, 500));

  console.log("\n📋 T2: End-to-End Start Game Flow (完整游戏开始流程)");

  // ── Step 1: Host 创建房间 ──
  console.log("\n📋 T2-01: Host 创建房间");

  const host = new TestClient(WS_URL, "房主");
  await host.open();

  await test("Host 连接后收到 player_joined（房间外）", async () => {
    host.send({ type: "create_room", payload: { nickname: "房主", playerCount: 2 } });
    const roomUpdate = await host.waitForPredicate(
      (m) => m.type === "state_sync" && m.payload?.players?.length === 1
    );
    assert(roomUpdate.payload !== undefined, "state_sync 必须有 payload");
    assert(roomUpdate.payload.players.length === 1, `玩家数应为 1, 实际 ${roomUpdate.payload.players.length}`);
    assert(roomUpdate.payload.phase === "waiting", `phase 应为 waiting, 实际 ${roomUpdate.payload.phase}`);
  });

  let roomCode: string = "";
  await test("Host 获得房间码", async () => {
    const joined = host.messages.find((m) => m.type === "player_joined");
    assert(joined?.payload?.playerId === 0, "Host 应获得 playerId");
    roomCode = joined?.payload?.roomCode;
    assert(/^\d{4}$/.test(roomCode), `房间码应为 4 位数字, 实际 ${roomCode}`);
  });

  // ── Step 2: Guest 加入 ──
  console.log("\n📋 T2-02: Guest 加入房间");

  const guest = new TestClient(WS_URL, "玩家二");
  await guest.open();

  await test("Guest 加入后双方收到 state_sync", async () => {
    guest.send({ type: "join_room", payload: { roomCode, nickname: "玩家二" } });
    const guestSync = await guest.waitForPredicate(
      (m) => m.type === "state_sync" && m.payload?.players?.length === 2
    );
    assert(guestSync.payload.players.length === 2, `玩家数应为 2, 实际 ${guestSync.payload.players.length}`);
  });

  await test("Host 也收到 state_sync（2 名玩家）", async () => {
    const hostSync = await host.waitForPredicate(
      (m) => m.type === "state_sync" && m.payload?.players?.length === 2
    );
    assert(hostSync.payload.players.length === 2, `host 看到 2 名玩家, 实际 ${hostSync.payload.players.length}`);
  });

  // ── Step 3: Guest 准备 ──
  console.log("\n📋 T2-03: 玩家准备");

  await test("Guest 准备后双方收到 state_sync（isReady=true）", async () => {
    guest.send({ type: "ready" });
    const guestSync = await guest.waitForPredicate(
      (m) => m.type === "state_sync" && m.payload?.players?.find((p: any) => p.isHost === false)?.isReady === true
    );
    const guestPlayer = guestSync.payload.players.find((p: any) => p.isHost === false);
    assert(guestPlayer !== undefined, "应找到 guest 玩家");
    assert(guestPlayer.isReady === true, `guest 应已准备, 实际 ${guestPlayer.isReady}`);
  });

  await test("Host 也看到 guest已准备", async () => {
    const hostSync = await host.waitForPredicate(
      (m) => m.type === "state_sync" && m.payload?.players?.find((p: any) => p.isHost === false)?.isReady === true
    );
    const guestPlayer = hostSync.payload.players.find((p: any) => p.isHost === false);
    assert(guestPlayer.isReady === true, `host 看到 guest 已准备, 实际 ${guestPlayer.isReady}`);
  });

  // ── Step 4: Host 开始游戏 ──
  console.log("\n📋 T2-04: Host 开始游戏");

  await test("Host 点击开始游戏 → 收到 game_start", async () => {
    host.send({ type: "start_game" });
    const gameStart = await host.waitFor("game_start");
    assert(gameStart.payload !== undefined, "game_start 必须有 payload");
    assert(gameStart.payload.phase === "playing", `phase 应为 playing, 实际 ${gameStart.payload.phase}`);
  });

  await test("Host 收到 state_sync（phase=playing）", async () => {
    const stateSync = await host.waitForPredicate(
      (m) => m.type === "state_sync" && m.payload?.phase === "playing"
    );
    assert(stateSync.payload !== undefined, "state_sync 必须有 payload");
    assert(stateSync.payload.phase === "playing", `state_sync phase 应为 playing, 实际 ${stateSync.payload.phase}`);
  });

  await test("Guest 也收到 game_start（payload.phase=playing）", async () => {
    const gameStart = await guest.waitFor("game_start");
    assert(gameStart.payload !== undefined, "guest game_start 必须有 payload");
    assert(gameStart.payload.phase === "playing", `guest phase 应为 playing, 实际 ${gameStart.payload.phase}`);
  });

  await test("Guest 也收到 state_sync（phase=playing）", async () => {
    const stateSync = await guest.waitForPredicate(
      (m) => m.type === "state_sync" && m.payload?.phase === "playing"
    );
    assert(stateSync.payload !== undefined, "guest state_sync 必须有 payload");
    assert(stateSync.payload.phase === "playing", `guest state_sync phase 应为 playing, 实际 ${stateSync.payload.phase}`);
  });

  // ── Step 5: 验证双方状态一致 ──
  console.log("\n📋 T2-05: 状态一致性验证");

  await test("Host 和 Guest 最终 state_sync 状态一致", async () => {
    const hostLastSync = host.messages.filter((m) => m.type === "state_sync").pop();
    const guestLastSync = guest.messages.filter((m) => m.type === "state_sync").pop();
    assert(hostLastSync.payload.phase === guestLastSync.payload.phase, "双方 phase 一致");
    assert(hostLastSync.payload.players.length === guestLastSync.payload.players.length, "双方 players 一致");
    assert(hostLastSync.payload.roundNumber === guestLastSync.payload.roundNumber, "双方 roundNumber 一致");
  });

  await test("双方 players 中都有 2 个 isReady=true", async () => {
    const hostLastSync = host.messages.filter((m) => m.type === "state_sync").pop();
    const players = hostLastSync.payload.players;
    const readyCount = players.filter((p: any) => p.isReady).length;
    assert(readyCount === 2, `应 2 人都准备, 实际 ${readyCount}`);
  });

  // ── 清理 ──
  host.close();
  guest.close();
  wss.close();

  // ── 测试总结 ──
  console.log(`\n${"=".repeat(50)}`);
  console.log(`T2 E2E Flow: 通过 ${passed} / 失败 ${failed} / 总计 ${passed + failed}`);
  console.log(`${"=".repeat(50)}`);

  if (failed > 0) process.exit(1);
}

main().catch((e) => {
  console.error("T2 测试运行失败:", e);
  process.exit(1);
});
