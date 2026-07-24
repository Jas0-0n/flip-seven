// ============================================================
// T1: Field Contract Test — 消息字段契约测试
//
// 验证后端发送的 WebSocket 消息字段名与前端的 ServerMessage
// 类型定义一致。这是"无法开始游戏"问题的根本原因：
// stateSync 发送 { type: "state_sync", state: ... } 但客户端读 payload。
//
// Run: npx tsx server/socket/tests/field-contract.test.ts
// ============================================================
import { rooms, stateSync, handleMessage } from "../handlers";
import { Room } from "../../game-engine/Room";
import type { ServerMessage } from "@/types";

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

// ── 辅助：创建捕获消息的 Mock WebSocket ──
interface MockWS {
  sent: string[];
  readyState: number;
  meta?: { playerId: number; roomCode: string };
  send: (data: string) => void;
  close?: () => void;
}

function createMockWS(playerId: number): MockWS {
  const sent: string[] = [];
  return {
    sent,
    readyState: 1, // WebSocket.OPEN
    OPEN: 1, // ws.OPEN static - needed because handler checks `ws.readyState === ws.OPEN`
    meta: { playerId, roomCode: "TEST" },
    send(data: string) {
      sent.push(data);
    },
  };
}

// 辅助：解析所有发送的消息
function parseSent(mock: MockWS): ServerMessage[] {
  return mock.sent.map((s) => JSON.parse(s));
}

// 辅助：在 rooms 中建立一个 2 人房间并初始化游戏
function setupRoom(): { host: MockWS; guest: MockWS } {
  // 清理测试房间（防止多次运行冲突）
  rooms.delete("TEST");

  const room = new Room("TEST", 2);
  // 添加两名玩家（房主 + 客人）
  room.addPlayer("Host", true);
  room.addPlayer("Guest", false);

  const host = createMockWS(0);
  const guest = createMockWS(1);

  // 设置 handleMessage 需要的 meta
  host.meta = { playerId: 0, roomCode: "TEST" };
  guest.meta = { playerId: 1, roomCode: "TEST" };

  // initGame 后重置状态，需要重新设置准备
  room.initGame();
  // 全体准备（开始游戏的前提）
  room.getPlayer(0)!.isReady = true;
  room.getPlayer(1)!.isReady = true;

  rooms.set("TEST", {
    room,
    connections: new Map([
      [0, host as any],
      [1, guest as any],
    ]),
    playerTokens: new Map(),
    hostId: 0,
  });

  return { host, guest };
}

// ── 运行 ──
console.log("\n📋 T1: Field Contract Test (消息字段契约)");

// ── state_sync 字段契约 ──
console.log("\n📋 T1-01: state_sync 必须包含 payload 字段");

test("stateSync 广播的消息type为 state_sync", () => {
  const { host, guest } = setupRoom();
  stateSync("TEST");
  const hostMsgs = parseSent(host);
  const guestMsgs = parseSent(guest);
  assert(hostMsgs.length === 1, `host 应收到 1 条消息, 实际 ${hostMsgs.length}`);
  assert(guestMsgs.length === 1, `guest 应收到 1 条消息, 实际 ${guestMsgs.length}`);
  assert(hostMsgs[0].type === "state_sync", `type 应为 state_sync, 实际 ${hostMsgs[0].type}`);
  assert(guestMsgs[0].type === "state_sync", `type 应为 state_sync, 实际 ${guestMsgs[0].type}`);
});

test("stateSync 消息必须包含 payload 字段（不是 state）", () => {
  const { host } = setupRoom();
  stateSync("TEST");
  const msg = parseSent(host)[0];
  assert("payload" in msg, "消息必须包含 payload 字段 (!('payload' in msg) 失败)");
  assert(!("state" in msg), "消息不能包含 state 字段（前端不读 state）");
});

test("stateSync payload 必须符合 GameState 结构", () => {
  const { host } = setupRoom();
  stateSync("TEST");
  const msg = parseSent(host)[0] as any;
  const payload = msg.payload;
  assert(payload !== undefined, "payload 不能为 undefined");
  assert(payload !== null, "payload 不能为 null");
  assert(typeof payload === "object", "payload 必须是对象");
  assert(Array.isArray(payload.players), "payload.players 必须是数组");
  assert(typeof payload.phase === "string", "payload.phase 必须是 string");
  assert(typeof payload.roundNumber === "number", "payload.roundNumber 必须是 number");
  assert(payload.players.length === 2, `应有 2 名玩家, 实际 ${payload.players.length}`);
  assert(payload.phase === "playing", `phase 应为 playing, 实际 ${payload.phase}`);
});

test("stateSync 单人目标发送也使用 payload 字段", () => {
  const { guest } = setupRoom();
  stateSync("TEST", 1);
  const msg = parseSent(guest)[0] as any;
  assert("payload" in msg, "单人同步也必须用 payload");
  assert(!("state" in msg), "单人同步不能用 state");
  assert(msg.payload !== undefined, "payload 不能为 undefined");
});

// ── game_start 字段契约 ──
console.log("\n📋 T1-02: game_start 必须包含 payload 字段");

test("start_game 后 host 收到 game_start", () => {
  const { host, guest } = setupRoom();
  // 清除 setupRoom 期间 stateSync 的消息（initGame 不触发 stateSync，但保险起见）
  host.sent.length = 0;
  guest.sent.length = 0;

  handleMessage(host as any, JSON.stringify({ type: "start_game" }), "TEST");

  const hostMsgs = parseSent(host);
  const gameStartMsgs = hostMsgs.filter((m) => m.type === "game_start");
  assert(gameStartMsgs.length === 1, `应收到 1 条 game_start, 实际 ${gameStartMsgs.length}`);
});

test("game_start 消息必须包含 payload 字段", () => {
  const { host, guest } = setupRoom();
  host.sent.length = 0;
  guest.sent.length = 0;

  handleMessage(host as any, JSON.stringify({ type: "start_game" }), "TEST");

  const hostMsgs = parseSent(host);
  const gameStartMsg = hostMsgs.find((m) => m.type === "game_start") as any;
  assert(gameStartMsg !== undefined, "必须收到 game_start");
  assert("payload" in gameStartMsg, "game_start 必须包含 payload 字段");
  assert(gameStartMsg.payload !== undefined, "payload 不能为 undefined");
});

test("game_start payload 必须符合 GameState 结构", () => {
  const { host, guest } = setupRoom();
  host.sent.length = 0;
  guest.sent.length = 0;

  handleMessage(host as any, JSON.stringify({ type: "start_game" }), "TEST");

  const hostMsgs = parseSent(host);
  const gameStartMsg = hostMsgs.find((m) => m.type === "game_start") as any;
  const payload = gameStartMsg.payload;
  assert(typeof payload === "object", "payload 必须是对象");
  assert(Array.isArray(payload.players), "payload.players 必须是数组");
  assert(typeof payload.phase === "string", "payload.phase 必须是 string");
  assert(payload.phase === "playing", `phase 应为 playing, 实际 ${payload.phase}`);
});

test("所有玩家都收到 game_start（不只是 host）", () => {
  const { host, guest } = setupRoom();
  host.sent.length = 0;
  guest.sent.length = 0;

  handleMessage(host as any, JSON.stringify({ type: "start_game" }), "TEST");

  const guestMsgs = parseSent(guest);
  const guestGameStart = guestMsgs.filter((m) => m.type === "game_start");
  assert(guestGameStart.length === 1, `guest 应收到 1 条 game_start, 实际 ${guestGameStart.length}`);
});

test("start_game 后还发送 state_sync（双重保障）", () => {
  const { host, guest } = setupRoom();
  host.sent.length = 0;
  guest.sent.length = 0;

  handleMessage(host as any, JSON.stringify({ type: "start_game" }), "TEST");

  const hostMsgs = parseSent(host);
  const stateSyncMsgs = hostMsgs.filter((m) => m.type === "state_sync");
  assert(stateSyncMsgs.length === 1, `start_game 后应发送 1 条 state_sync, 实际 ${stateSyncMsgs.length}`);
  const stateSyncMsg = stateSyncMsgs[0] as any;
  assert("payload" in stateSyncMsg, "state_sync 必须包含 payload");
  assert(stateSyncMsg.payload?.phase === "playing", `state_sync phase 应为 playing, 实际 ${stateSyncMsg.payload?.phase}`);
});

// ── 消息格式验证 ──
console.log("\n📋 T1-03: 消息 JSON 格式验证");

test("发送的消息可被 JSON.parse 正常解析", () => {
  const { host } = setupRoom();
  stateSync("TEST");
  const raw = host.sent[0];
  let parsed: any;
  try {
    parsed = JSON.parse(raw);
  } catch (e: any) {
    throw new Error(`JSON.parse 失败: ${e.message}, raw: ${raw}`);
  }
  assert(parsed.type === "state_sync", "解析后 type 正确");
  assert(parsed.payload !== undefined, "解析后 payload 存在");
});

test("没有消息包含 undefined 字段（防止 {'state': undefined} 绕过检查）", () => {
  const { host } = setupRoom();
  stateSync("TEST");
  const raw = host.sent[0];
  // 关键：序列化后不应该出现 "state":undefined
  assert(!raw.includes('"state"'), `消息中不能包含 "state" 字段, raw: ${raw}`);
  assert(raw.includes('"payload"'), `消息中必须包含 "payload" 字段, raw: ${raw}`);
});

// ── 测试总结 ──
console.log(`\n${"=".repeat(50)}`);
console.log(`T1 Field Contract: 通过 ${passed} / 失败 ${failed} / 总计 ${passed + failed}`);
console.log(`${"=".repeat(50)}`);

// 清理
rooms.delete("TEST");

if (failed > 0) process.exit(1);
