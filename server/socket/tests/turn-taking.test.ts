// ============================================================
// Turn-Taking Verification Test — 轮流翻牌验证
//
// 直接测试修复后的轮流翻牌逻辑：
//   A 翻牌 → currentPlayerId 切换到 B
//   B 翻牌 → currentPlayerId 切换回 A
//
// Run: npx tsx server/socket/tests/turn-taking.test.ts
// ============================================================
import { WebSocket } from "ws";
import { rooms, stateSync, handleMessage } from "../handlers";
import { Room } from "../../game-engine/Room";

let passed = 0;
let failed = 0;

function test(name: string, fn: () => void) {
  try {
    fn();
    console.log(`  ✅ ${name}`);
    passed++;
  } catch (e: any) {
    console.error(`  ❌ ${name}: ${e.message}`);
    failed++;
  }
}

function assert(condition: boolean, msg: string) {
  if (!condition) throw new Error(msg);
}

// ── Mock WebSocket ──
interface MockWS {
  sent: string[];
  readyState: number;
  OPEN: number;
  meta?: { playerId: number; roomCode: string };
  send: (data: string) => void;
}

function createMockWS(playerId: number): MockWS {
  const sent: string[] = [];
  return {
    sent,
    readyState: 1,
    OPEN: 1,
    meta: { playerId, roomCode: "TEST" },
    send(data: string) {
      sent.push(data);
    },
  };
}

function parseSent(mock: MockWS): any[] {
  return mock.sent.map((s) => JSON.parse(s));
}

function setupRoom(): { host: MockWS; guest: MockWS; room: Room } {
  rooms.delete("TEST");
  const room = new Room("TEST", 2);
  room.addPlayer("Host", true);
  room.addPlayer("Guest", false);
  room.initGame();
  room.getPlayer(0)!.isReady = true;
  room.getPlayer(1)!.isReady = true;

  const host = createMockWS(0);
  const guest = createMockWS(1);
  host.meta = { playerId: 0, roomCode: "TEST" };
  guest.meta = { playerId: 1, roomCode: "TEST" };

  rooms.set("TEST", {
    room,
    connections: new Map([
      [0, host as any],
      [1, guest as any],
    ]),
    playerTokens: new Map(),
    hostId: 0,
  });

  return { host, guest, room };
}

// 取最后一条 state_sync 中的 currentPlayerId
function getCurrentPlayerId(mock: MockWS): number {
  const msgs = parseSent(mock);
  const syncs = msgs.filter((m) => m.type === "state_sync");
  const last = syncs[syncs.length - 1];
  return last?.payload?.currentPlayerId;
}

console.log("\n📋 Turn-Taking Test (轮流翻牌)");

test("初始当前玩家是 host（player 0）", () => {
  const { host, guest, room } = setupRoom();
  // initGame 后 currentPlayerId 应为 0（房主）
  assert(room.currentPlayerId === 0, `初始 currentPlayerId 应为 0, 实际 ${room.currentPlayerId}`);
});

test("host 翻牌后切换到 guest（player 1）", () => {
  const { host, guest, room } = setupRoom();
  host.sent.length = 0;
  guest.sent.length = 0;

  // Host 翻牌
  handleMessage(host as any, JSON.stringify({ type: "action_flip" }), "TEST");

  // 由于牌堆第一张可能是任意牌，检查是否切换了玩家
  // 注意：如果第一张是 bust，则不会切换（需要 confirm）
  const hostMsgs = parseSent(host);
  const flipResult = hostMsgs.find((m) => m.type === "flip_result");

  if (flipResult?.payload?.result === "continue" || flipResult?.payload?.result === "flip7") {
    // 如果存活，currentPlayerId 应切换到 1
    assert(room.currentPlayerId === 1, `host 翻牌存活后应切换到 player 1, 实际 ${room.currentPlayerId}`);
    console.log(`    (host 存活，切换到 ${room.currentPlayerId})`);
  } else if (flipResult?.payload?.result === "bust") {
    // bust 不切换，等 confirm
    assert(room.currentPlayerId === 0, `host bust 不应切换, 实际 ${room.currentPlayerId}`);
    console.log(`    (host bust，等待 confirm)`);
  }
});

test("连续翻牌：host → guest → host → guest（完整一轮）", () => {
  const { host, guest, room } = setupRoom();
  host.sent.length = 0;
  guest.sent.length = 0;

  const turnOrder: number[] = [];
  let safety = 20; // 防止无限循环

  while (safety-- > 0) {
    const cp = room.currentPlayerId;
    // 如果回到 player 0 且 turnOrder 不为空，说明完成一轮
    if (cp === 0 && turnOrder.length > 0) break;
    if (room.phase !== "playing") break;

    turnOrder.push(cp);

    const ws = cp === 0 ? host : guest;
    ws.sent.length = 0;
    const prevSent = ws.sent.length;

    handleMessage(ws as any, JSON.stringify({ type: "action_flip" }), "TEST");

    const msgs = parseSent(ws);
    const flipResult = msgs.find((m) => m.type === "flip_result");
    const result = flipResult?.payload?.result;

    if (result === "bust") {
      // bust 后需要 confirm
      ws.sent.length = 0;
      handleMessage(ws as any, JSON.stringify({ type: "confirm_flip" }), "TEST");
    } else if (result === "flip7") {
      // flip7 后游戏可能结束
      if (room.phase === "ended") break;
    }
  }

  console.log(`    轮流顺序: ${turnOrder.join(" → ")}`);

  // 验证轮流顺序：0,1,0,1,... 或 0,1,2,0,1,2,...（3人）
  // 对于 2 人房间，应严格 0,1,0,1,...
  let validTurnOrder = true;
  for (let i = 0; i < turnOrder.length; i++) {
    const expected = i % 2; // 0,1,0,1,...
    if (turnOrder[i] !== expected) {
      validTurnOrder = false;
      break;
    }
  }

  assert(validTurnOrder, `轮流顺序应严格交替 0,1,0,1,... 实际: ${turnOrder.join(",")}`);
  assert(turnOrder.length >= 2, `应有至少 2 次翻牌, 实际 ${turnOrder.length}`);
});

test("STOP 后切换到下一玩家", () => {
  const { host, guest, room } = setupRoom();
  host.sent.length = 0;
  guest.sent.length = 0;

  // Host STOP
  handleMessage(host as any, JSON.stringify({ type: "action_stop" }), "TEST");

  assert(room.currentPlayerId === 1, `host STOP 后应切换到 player 1, 实际 ${room.currentPlayerId}`);
});

test("爆牌确认后切换到下一玩家", () => {
  const { host, guest, room } = setupRoom();
  host.sent.length = 0;
  guest.sent.length = 0;

  // 强制设置 pendingBustPlayerId 为 host
  (room as any).pendingBustPlayerId = 0;

  // Host confirm_flip
  handleMessage(host as any, JSON.stringify({ type: "confirm_flip" }), "TEST");

  assert(room.currentPlayerId === 1, `confirm_flip 后应切换到 player 1, 实际 ${room.currentPlayerId}`);
});

// ── 总结 ──
console.log(`\n${"=".repeat(50)}`);
console.log(`Turn-Taking: 通过 ${passed} / 失败 ${failed} / 总计 ${passed + failed}`);
console.log(`${"=".repeat(50)}`);

rooms.delete("TEST");

if (failed > 0) process.exit(1);
