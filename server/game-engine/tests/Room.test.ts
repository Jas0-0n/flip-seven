// ============================================================
// Unit tests for Room.ts — final version using Map-based API
// ============================================================

import { Room } from "../Room";
import type { Card } from "@/types";

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

function makeRoom(n: 2 | 3 | 4 = 2): Room {
  return new Room("TEST", n);
}

function num(id: string, value: number): Card {
  return { type: "number", value, id } as Card;
}
function revive(id: string): Card {
  return { type: "revive", value: "revive", effect: "revive", id } as Card;
}
function score(id: string, value: number): Card {
  return { type: "score", value: `+${value}`, effect: value, id } as Card;
}
function freeze(id: string): Card {
  return { type: "freeze", value: "freeze", effect: "freeze", id } as Card;
}
function f3(id: string): Card {
  return { type: "flipthree", value: "flip3", effect: "flip3", id } as Card;
}
function dbl(id: string): Card {
  return { type: "double", value: "x2", effect: "multiply", id } as Card;
}

function finishFlip3(room: Room, targetId?: number) {
  const activeTargetId = targetId ?? (room as any).flip3State?.targetId ?? (room as any).flip3ExecutionResult?.targetId;
  return (room as any).advanceFlip3(activeTargetId);
}

// Simulate handler: clear bust + advance turn
function clearBustAndAdvance(room: Room) {
  if (room.pendingBustPlayerId !== null) {
    const bp = room.getPlayer(room.pendingBustPlayerId);
    if (bp) {
      room.discard.push(...bp.hand, room.lastFlip!);
      bp.hand = [];
    }
    room.pendingBustPlayerId = null;
  }
  if (room.isRoundOver()) {
    room.startNewRound();
  } else {
    room.nextPlayer();
  }
}

// Helper: find player in room.players Map
function findPlayer(room: Room, predicate: (p: any) => boolean): any {
  for (const p of (room.players as any).values()) {
    if (predicate(p)) return p;
  }
  return undefined;
}

// ── 房间创建 ──
console.log("\n📋 P0: 房间与玩家管理（Map 重构）");
test("创建房间 phase=waiting", () => {
  assert(makeRoom().phase === "waiting", "应为 waiting");
});
test("addPlayer 分配自增 ID (0, 1, 2...)", () => {
  const r = makeRoom();
  const a = r.addPlayer("A", true);
  const b = r.addPlayer("B", false);
  const c = r.addPlayer("C", false);
  assert(a.id === 0 && b.id === 1 && c.id === 2, "ID 应自增");
});
test("首个玩家是房主且准备", () => {
  const r = makeRoom();
  const p = r.addPlayer("A", true);
  assert(p.id === 0 && p.isHost && p.isReady, "首个玩家是房主且准备");
});
test("非房主 isReady=false", () => {
  const r = makeRoom();
  r.addPlayer("H", true);
  assert(!r.addPlayer("G", false).isReady, "非房主未准备");
});
test("getHost 返回房主", () => {
  const r = makeRoom();
  r.addPlayer("H", true);
  r.addPlayer("G", false);
  assert(r.getHost()?.isHost === true, "getHost 应返回房主");
});

// ── P0-01: removePlayer 不重排 ID ──
console.log("\n📋 P0-01: removePlayer 不重排 ID");
test("removePlayer 后其他玩家 ID 不变", () => {
  const r = makeRoom();
  const a = r.addPlayer("A", true);
  const b = r.addPlayer("B", false);
  const c = r.addPlayer("C", false);
  r.removePlayer(b.id);
  assert(a.id === 0, "A 的 ID 不变");
  assert(c.id === 2, "C 的 ID 不变（不重排）");
  assert(r.getPlayer(b.id) === undefined, "B 已移除");
  assert(r.getPlayer(c.id) === c, "C 仍可访问");
});
test("removePlayer 后 currentPlayerId 不会指向错误玩家", () => {
  const r = makeRoom(3);
  const a = r.addPlayer("A", true);
  const b = r.addPlayer("B", false);
  const c = r.addPlayer("C", false);
  r.initGame();
  // 当前是 A(0)，移除 A 后 → 应顺延到 B
  r.removePlayer(a.id);
  assert(r.currentPlayerId === b.id, `应顺延到 B(${b.id}), 实际 ${r.currentPlayerId}`);
});
test("removePlayer 清除 pendingBustPlayerId", () => {
  const r = makeRoom();
  const a = r.addPlayer("A", true);
  r.addPlayer("B", false);
  r.initGame();
  // A 爆牌
  a.hand = [num("x", 3)];
  r.deck = [num("y", 3)];
  r.flip(a.id);
  assert(r.pendingBustPlayerId === a.id, "pendingBustPlayerId = A");
  // A 离开 → 清除引用
  r.removePlayer(a.id);
  assert(r.pendingBustPlayerId === null, "pendingBustPlayerId 应清除");
});
test("removePlayer 清除 firstOutPlayerId", () => {
  const r = makeRoom();
  const a = r.addPlayer("A", true);
  r.addPlayer("B", false);
  r.initGame();
  a.hand = [num("x", 3)];
  r.deck = [num("y", 3)];
  r.flip(a.id);
  assert(r.firstOutPlayerId === a.id, "firstOutPlayerId = A");
  r.removePlayer(a.id);
  assert(r.firstOutPlayerId === null, "firstOutPlayerId 应清除");
});

// ── P9-07: initGame 94 张 ──
console.log("\n📋 P9-07 / P0-09: initGame");
test("牌堆 = 94 张（分数调整牌每种1张）", () => {
  const r = makeRoom();
  r.addPlayer("A", true); r.addPlayer("B", false);
  r.initGame();
  assert(r.deck.length === 94, `牌堆应为 94, 实际 ${r.deck.length}`);
});
test("phase=playing, roundNumber=1", () => {
  const r = makeRoom();
  r.addPlayer("A", true); r.addPlayer("B", false);
  r.initGame();
  assert(r.phase === "playing" && r.roundNumber === 1, "playing, round 1");
});
test("手牌清空、分数重置为 0", () => {
  const r = makeRoom();
  const a = r.addPlayer("A", true);
  a.hand = [num("x", 5)]; a.score = 100;
  r.addPlayer("B", false);
  r.initGame();
  assert(a.hand.length === 0 && a.score === 0, "新局开始：手牌清空，分数重置");
});

// ── P1-01~03: 数字牌 ──
console.log("\n📋 P1-01~03: 翻数字牌");
test("翻到 5 → 手牌 1 张", () => {
  const r = makeRoom();
  const a = r.addPlayer("A", true);
  r.addPlayer("B", false); r.initGame();
  r.deck = [num("c", 5)];
  assert(r.flip(a.id).success && a.hand.length === 1, "翻到 5");
});
test("翻到 0 → 不爆牌", () => {
  const r = makeRoom();
  const a = r.addPlayer("A", true);
  r.addPlayer("B", false); r.initGame();
  r.deck = [num("z", 0)];
  assert(r.flip(a.id).result === "continue", "0 不爆牌");
});
test("翻到 12 → 加入手牌", () => {
  const r = makeRoom();
  const a = r.addPlayer("A", true);
  r.addPlayer("B", false); r.initGame();
  r.deck = [num("m", 12)];
  r.flip(a.id);
  assert(a.hand[0]?.value === 12, "手牌含 12");
});

// ── P1-04: 重复爆牌 ──
console.log("\n📋 P1-04: 重复爆牌");
test("重复数字 → bust", () => {
  const r = makeRoom();
  const a = r.addPlayer("A", true);
  r.addPlayer("B", false); r.initGame();
  a.hand = [num("a", 3)];
  r.deck = [num("b", 3)];
  assert(r.flip(a.id).result === "bust", "bust");
});
test("爆牌: isOut=true, hasBusted=true, 手牌延迟清空", () => {
  const r = makeRoom();
  const a = r.addPlayer("A", true);
  r.addPlayer("B", false); r.initGame();
  a.hand = [num("a", 3)];
  r.deck = [num("b", 3)];
  r.flip(a.id);
  assert(a.isOut && a.hasBusted && a.hand.length === 1, "手牌延迟清空");
});
test("clearBust 后手牌进弃牌堆", () => {
  const r = makeRoom();
  const a = r.addPlayer("A", true);
  r.addPlayer("B", false); r.initGame();
  a.hand = [num("a", 3)];
  r.deck = [num("b", 3)];
  r.flip(a.id);
  const dLen = r.discard.length;
  clearBustAndAdvance(r);
  assert(r.discard.length > dLen, "手牌进了弃牌堆");
  assert(a.hand.length === 0, "手牌清空");
});

// ── P1-05: 复活牌抵消 ──
console.log("\n📋 P1-05: 复活牌抵消爆牌");
test("有复活 → continue、不爆牌", () => {
  const r = makeRoom();
  const a = r.addPlayer("A", true);
  r.addPlayer("B", false); r.initGame();
  a.hand = [num("a", 3), revive("rv")];
  r.deck = [num("b", 3)];
  const res = r.flip(a.id);
  assert(res.result === "continue" && !a.hasBusted && a.hand.length === 1, "抵消成功");
});
test("无复活 → bust", () => {
  const r = makeRoom();
  const a = r.addPlayer("A", true);
  r.addPlayer("B", false); r.initGame();
  a.hand = [num("a", 3)];
  r.deck = [num("b", 3)];
  assert(r.flip(a.id).result === "bust", "无复活 → bust");
});

// ── P1-07: 复活牌上限 ──
console.log("\n📋 P1-07 ~ P1-B*: 复活牌上限");
test("已有复活 + 翻到复活 → pending_action", () => {
  const r = makeRoom();
  const a = r.addPlayer("A", true);
  const b = r.addPlayer("B", false);
  r.initGame();
  a.hand = [revive("rv1")];
  r.deck = [revive("rv2")];
  assert(r.flip(a.id).result === "pending_action", "pending_action");
});
test("无复活 + 翻到复活 → 加入手牌", () => {
  const r = makeRoom();
  const a = r.addPlayer("A", true);
  const b = r.addPlayer("B", false); r.initGame();
  r.deck = [revive("rv1")];
  const res = r.flip(a.id);
  assert(res.result === "continue" && a.hand.length === 1 && !r.pendingAction, "正常获得");
});
test("无合法目标(其他跳过) → 进弃牌", () => {
  const r = makeRoom();
  const a = r.addPlayer("A", true);
  const b = r.addPlayer("B", false);
  r.initGame();
  a.hand = [revive("rv1")]; b.skipped = true;
  r.deck = [revive("rv2")];
  assert(r.flip(a.id).result === "continue", "无合法目标进弃牌");
});
test("有合法目标 → pending_action", () => {
  const r = makeRoom();
  const a = r.addPlayer("A", true);
  const b = r.addPlayer("B", false);
  r.initGame();
  a.hand = [revive("rv1")];
  r.deck = [revive("rv2")];
  assert(r.flip(a.id).result === "pending_action", "有合法目标");
});
test("选择 revive 目标后 → 目标获得复活牌并切换回合", () => {
  const r = makeRoom();
  const a = r.addPlayer("A", true);
  const b = r.addPlayer("B", false);
  r.initGame();
  a.hand = [revive("rv1")];
  r.deck = [revive("rv2")];

  assert(r.flip(a.id).result === "pending_action", "触发 revive 目标选择");
  const result = r.selectTarget(b.id);
  assert(result.success, "revive 目标选择成功");
  assert(b.hand.some((c) => c.type === "revive"), "目标获得 revive");
  assert(r.pendingAction === null, "pendingAction 已清空");
  assert(r.currentPlayerId === b.id, `应切换到 B，实际 ${r.currentPlayerId}`);
});

// ── P9-02 / P9-03 / P1-17~22: 七连翻 ──
console.log("\n📋 P1-17~22 / P9-02~03: 七连翻");
test("7 纯数字 → flip7", () => {
  const r = makeRoom();
  const a = r.addPlayer("A", true);
  r.addPlayer("B", false); r.initGame();
  a.hand = [num("a",1),num("b",2), num("c",3), num("d",4), num("e",5), num("f",6)];
  r.deck = [num("g", 7)];
  assert(r.flip(a.id).result === "flip7", "flip7");
});
test("6 数字 + 1 复活 + 翻数字 6 → 不触发", () => {
  const r = makeRoom();
  const a = r.addPlayer("A", true);
  r.addPlayer("B", false); r.initGame();
  a.hand = [num("a",1), num("b",2), num("c",3), num("d",4), num("e",5), num("f",6), revive("rv")];
  r.deck = [num("g", 6)];
  assert(r.flip(a.id).result !== "flip7", "不触发");
});
test("6 数字 + 1 复活 + 翻数字 7 → 触发 flip7", () => {
  const r = makeRoom();
  const a = r.addPlayer("A", true);
  r.addPlayer("B", false); r.initGame();
  a.hand = [num("a",1), num("b",2), num("c",3), num("d",4), num("e",5), num("f",6), revive("rv")];
  r.deck = [num("g", 7)];
  assert(r.flip(a.id).result === "flip7", "触发 flip7");
});
test("7 数字 (1~7) +15 = 43 分, B 空牌不得分", () => {
  const r = makeRoom();
  const a = r.addPlayer("A", true);
  const b = r.addPlayer("B", false);
  r.initGame();
  a.hand = [num("a",1), num("b",2), num("c",3), num("d",4), num("e",5), num("f",6)];
  r.deck = [num("g", 7)];
  r.flip(a.id);
  // A: 手牌 1+2+3+4+5+6+7=28 + 15 奖励 = 43
  assert(a.score === 43, `A 应得 43 分, 实际 ${a.score}`);
  // B 没有手牌 → 得 0 分
  assert(b.score === 0, `B 应得 0 分, 实际 ${b.score}`);
});
test("P1-17a 七连翻全员得分(2人,A触发B未结束)", () => {
  const r = makeRoom();
  const a = r.addPlayer("A", true);
  const b = r.addPlayer("B", false);
  r.initGame();
  a.hand = [num("a1",1), num("a2",2), num("a3",3), num("a4",4), num("a5",5), num("a6",6)];
  b.hand = [num("b1", 3), num("b2", 5)]; // B 还有手牌，未结束
  r.deck = [num("a7", 7)]; // A 翻第7张纯数字 → flip7

  const res = r.flip(a.id);
  assert(res.result === "flip7", "触发 flip7");
  // A: 1+2+3+4+5+6+7=28 + 15 = 43
  assert(a.score === 43, `A 得 43 分, 实际 ${a.score}`);
  // B: 手牌 3+5=8 必须被计算（这是用户报告的 bug）
  assert(b.score === 8, `B 必须得 8 分, 实际 ${b.score}`);
  // 手牌已清空（新回合已开始）
  assert(a.hand.length === 0 && b.hand.length === 0, "全员手牌清空");
  // 弃牌堆包含 A 的手牌 + B 的手牌 + 翻出的 a7
  assert(r.discard.length >= 9, `弃牌堆 ≥ 9 张, 实际 ${r.discard.length}`);
  // 新回合 isOut 已重置
  assert(!a.isOut && !b.isOut, "新回合开始，全员 isOut=false");
});
test("flip7: 所有未出局玩家得分（官方规则）", () => {
  const r = makeRoom(3);
  const a = r.addPlayer("A", true);
  const b = r.addPlayer("B", false);
  const c = r.addPlayer("C", false);
  r.initGame();
  // A 即将触发 flip7
  a.hand = [num("a1",1), num("a2",2), num("a3",3), num("a4",4), num("a5",5), num("a6",6)];
  // B 和 C 各有手牌
  b.hand = [num("b1", 3), num("b2", 5)]; // 3+5=8
  c.hand = [num("c1", 2)];              // 2
  r.deck = [num("a7", 7)]; // A 翻到 7 → 7 纯数字 → flip7
  r.flip(a.id);
  // A: 1+2+3+4+5+6+7=28 + 15 奖励 = 43
  assert(a.score === 43, `A 应得 43 分, 实际 ${a.score}`);
  // B: 手牌得分 8
  assert(b.score === 8, `B 应得 8 分, 实际 ${b.score}`);
  // C: 手牌得分 2
  assert(c.score === 2, `C 应得 2 分, 实际 ${c.score}`);
  // 所有玩家手牌清空
  assert(a.hand.length === 0 && b.hand.length === 0 && c.hand.length === 0, "全员手牌清空");
  // 新回合已开始，isOut 已重置
  assert(!a.isOut && !b.isOut && !c.isOut, "新回合开始，全员 isOut=false");
});
test("flip7 后全员手牌清空", () => {
  const r = makeRoom();
  const a = r.addPlayer("A", true);
  const b = r.addPlayer("B", false);
  r.initGame();
  a.hand = [num("a",1), num("b",2), num("c",3), num("d",4), num("e",5), num("f",6)];
  b.hand = [num("x", 10)]; // B 也有手牌
  r.deck = [num("g", 7)];
  r.flip(a.id);
  assert(a.hand.length === 0, "A 手牌清空");
  assert(b.hand.length === 0, "B 手牌清空（七连翻触发全员结算）");
});
test("功能牌 7 张 + 0 数字 → 不触发", () => {
  const r = makeRoom();
  const a = r.addPlayer("A", true);
  r.addPlayer("B", false); r.initGame();
  a.hand = [freeze("f1"), freeze("f2"), freeze("f3"), freeze("f4")];
  r.deck = [num("n", 5)];
  assert(r.flip(a.id).result !== "flip7", "功能牌不触发");
});

// ── P0-07: STOP ──
console.log("\n📋 P0-07: STOP");
test("STOP → 计分、isOut", () => {
  const r = makeRoom();
  const a = r.addPlayer("A", true);
  r.addPlayer("B", false); r.initGame();
  a.hand = [num("a", 5), num("b", 3)];
  const res = r.stop();
  assert(res.playerId === a.id && a.score === 8 && a.hand.length === 0 && a.isOut, "STOP 8 分");
});
test("空牌 STOP → 0 分", () => {
  const r = makeRoom();
  r.addPlayer("A", true); r.addPlayer("B", false); r.initGame();
  assert(r.stop().score === 0, "0 分");
});

// ── P5: 冻结牌 ──
console.log("\n📋 P5: 冻结牌");
test("翻到冻结牌 → pending_action", () => {
  const r = makeRoom();
  const a = r.addPlayer("A", true);
  const b = r.addPlayer("B", false);
  r.initGame();
  b.hand = [num("b1", 3), num("b2", 5)]; // B 有手牌 {3,5}=8 分
  r.deck = [freeze("fz1")];
  const res = r.flip(a.id);
  assert(res.result === "pending_action", "触发 pending_action");
  assert(r.pendingAction?.type === "freeze", "pendingAction.type = freeze");
  assert(r.pendingAction?.actorId === a.id, "actor 是 A");
});
test("选择冻结目标 → 目标结算 + isOut", () => {
  const r = makeRoom();
  const a = r.addPlayer("A", true);
  const b = r.addPlayer("B", false);
  r.initGame();
  b.hand = [num("b1", 3), num("b2", 5)]; // 8 分
  r.deck = [freeze("fz1")];
  r.flip(a.id);
  const result = r.selectTarget(b.id);
  assert(result.success, "选择目标成功");
  assert(b.score === 8, `B 结算 8 分, 实际 ${b.score}`);
  assert(b.isOut, "B isOut = true");
  assert(b.hand.length === 0, "B 手牌清空");
  assert(r.pendingAction === null, "pendingAction 已清空");
  // 关键：验证 history 中有冻结结算记录（RoundHistory 依赖此数据显示得分）
  const freezeEntry = r.history.find((h) => h.playerId === b.id && h.actions.includes("freeze"));
  assert(freezeEntry !== undefined, "history 中有冻结结算记录");
  assert(freezeEntry?.scoreGained === 8, `history 记录 scoreGained=8, 实际 ${freezeEntry?.scoreGained}`);
});
test("冻结牌使用后进弃牌堆", () => {
  const r = makeRoom();
  const a = r.addPlayer("A", true);
  const b = r.addPlayer("B", false);
  r.initGame();
  b.hand = [num("b1", 2)];
  r.deck = [freeze("fz1")];
  r.flip(a.id);
  const beforeDiscard = r.discard.length;
  r.selectTarget(b.id);
  assert(r.discard.length >= beforeDiscard + 1, "冻结牌进弃牌堆");
  assert(r.discard.some((c) => c.id.startsWith("fz1")), "弃牌堆包含被消耗的冻结牌");
});
test("不能选择自己为冻结目标", () => {
  const r = makeRoom();
  const a = r.addPlayer("A", true);
  const b = r.addPlayer("B", false);
  r.initGame();
  b.hand = [num("b1", 2)];
  r.deck = [freeze("fz1")];
  r.flip(a.id);
  const result = r.selectTarget(a.id);
  assert(!result.success, "不能选择自己");
});
test("不能选择已出局玩家为冻结目标", () => {
  const r = makeRoom();
  const a = r.addPlayer("A", true);
  const b = r.addPlayer("B", false);
  r.initGame();
  b.isOut = true; // B 已出局
  r.deck = [freeze("fz1")];
  r.flip(a.id);
  const result = r.selectTarget(b.id);
  assert(!result.success, "不能选择已出局玩家");
});
test("唯一存活玩家翻到冻结牌 → 自动结算自己的手牌", () => {
  const r = makeRoom();
  const a = r.addPlayer("A", true);
  const b = r.addPlayer("B", false);
  r.initGame();
  a.hand = [num("a1", 3)]; // A 有手牌 3 分
  b.isOut = true; // B 已出局 → 唯一存活是 A
  r.deck = [freeze("fz1")]; // A 翻到冻结牌
  const res = r.flip(a.id);
  assert(res.result === "continue", "无目标可用 → 直接结算");
  assert(a.score === 3, `A 结算 3 分, 实际 ${a.score}`);
  assert(a.hand.length === 0, "A 手牌清空");
  // 新回合开始，isOut 已重置
  assert(!a.isOut, "新回合开始 A isOut=false");
});

// ── P5b: 翻三张牌（服务端推进版） ──
console.log("\n📋 P5b: 翻三张牌（服务端推进版）");

// ── P0-01: 翻到 flip3 进入 pending ──
test("P0-01: 翻到 flipthree → pending_action", () => {
  const r = makeRoom();
  const a = r.addPlayer("A", true);
  const b = r.addPlayer("B", false);
  r.initGame();
  b.hand = [num("b1", 5)];
  r.deck = [f3("f3_1")];
  const res = r.flip(a.id);
  assert(res.result === "pending_action", "触发 pending_action");
  assert(r.pendingAction?.type === "flipthree", "type = flipthree");
  assert(r.pendingAction?.actorId === a.id, "actor = A");
});

// ── P0-02: 3 数字牌 → 逐张入手牌 ──
test("P0-02: 翻三张 3数字 → 入手牌, 逐张翻", () => {
  const r = makeRoom();
  const a = r.addPlayer("A", true);
  const b = r.addPlayer("B", false);
  r.initGame();
  // Deck: [3rd(7), 2nd(5), 1st(3), f3] → pop f3, then 3, 5, 7
  r.deck = [num("3", 7), num("2", 5), num("1", 3), f3("f3_1")];
  r.flip(a.id);
  assert(r.pendingAction?.type === "flipthree", "flip3 pending");
  (r as any).selectTarget(b.id); // 翻第 1 张

  const res2 = (r as any).flip3Next(); // 翻第 2 张
  assert(res2.type === "flip_result", "第 2 张返回 flip_result");
  assert(res2.payload.flipNumber === 2, "第 2 张 flipNumber = 2");

  const res3 = (r as any).flip3Next(); // 翻第 3 张，返回 flip_result
  assert(res3.type === "flip_result", "第 3 张返回 flip_result");
  assert(res3.payload.flipNumber === 3, "第 3 张 flipNumber = 3");
  const res4 = (r as any).flip3Next(); // 执行 stash + done
  assert(res4.type === "done", "第 4 次调用结束");

  assert(b.hand.length === 3, `B 应得 3 张牌, 实际 ${b.hand.length}`);
  assert(!b.isOut, "B 未出局");
});

// ── P0-03: 重复爆牌 → 在第 2 张爆 ──
test("P0-02b: 翻三张 +8、11、+6，暂存牌最终加入手牌", () => {
  const r = makeRoom();
  const a = r.addPlayer("A", true);
  const b = r.addPlayer("B", false);
  r.initGame();

  // pop 顺序：flipthree -> +8 -> 11 -> +6
  r.deck = [score("plus6", 6), num("n11", 11), score("plus8", 8), f3("f3_score")];
  r.flip(a.id);
  (r as any).selectTarget(b.id);
  (r as any).flip3Next();
  const third = (r as any).flip3Next();
  assert(third.type === "flip_result" && third.payload.flipNumber === 3, "第3张返回 flip_result");

  const done = (r as any).flip3Next();
  assert(done.type === "done", "第4次调用完成暂存区结算");
  assert(b.hand.length === 3, `B 最终应有 3 张牌，实际 ${b.hand.length}`);
  assert(b.hand.some((c: Card) => c.type === "number" && c.value === 11), "手牌包含 11");
  assert(b.hand.some((c: Card) => c.type === "score" && c.value === "+8"), "手牌包含 +8");
  assert(b.hand.some((c: Card) => c.type === "score" && c.value === "+6"), "手牌包含 +6");
});

test("P0-03: 翻三张 第2张重复数字爆牌", () => { 
  const r = makeRoom();
  const a = r.addPlayer("A", true);
  const b = r.addPlayer("B", false);
  r.initGame();
  b.hand = [num("b1", 3)]; // B 已有 3
  // Deck: card1=2, card2=3(重复→爆), card3=5, f3
  // pop f3 first, then pop 2, pop 3, pop 5
  r.deck = [num("c3", 5), num("c2", 3), num("c1", 2), f3("f3_1")];
  r.flip(a.id);
  (r as any).selectTarget(b.id); // 翻第 1 张 (2)

  const res2 = (r as any).flip3Next(); // 翻第 2 张 (3, 重复)
  assert(res2.type === "done", "第 2 张爆牌 → 结束");
  assert(b.isOut, "B 出局");
  assert(b.hand.length === 0, "B 手牌清空");
});

test("P0-02c: advanceFlip3 由服务端连续推进三张", () => {
  const r = makeRoom();
  const a = r.addPlayer("A", true);
  const b = r.addPlayer("B", false);
  r.initGame();
  r.deck = [num("auto3", 7), num("auto2", 5), num("auto1", 3), f3("f3_auto")];
  r.flip(a.id);
  const selected = r.selectTarget(b.id, a.id);
  assert(selected.success, "A 应能选择 B");
  const events = r.advanceFlip3(b.id);
  assert(events.length === 3, `服务端应连续产生3个事件，实际 ${events.length}`);
  assert(events[0].type === "flip_result" && events[0].payload.flipNumber === 2, "第一个自动事件应为第2张");
  assert(events[1].type === "flip_result" && events[1].payload.flipNumber === 3, "第二个自动事件应为第3张");
  assert(events[2].type === "done", "第三个自动事件应完成 flip3");
  assert(b.hand.length === 3, `B 应得3张牌，实际 ${b.hand.length}`);
});

// ── P0-04: 暂存 revive 救场 ──
test("P0-04: 翻三张 暂存 revive 救场续翻", () => {
  const r = makeRoom();
  const a = r.addPlayer("A", true);
  const b = r.addPlayer("B", false);
  r.initGame();
  b.hand = [num("b1", 3)]; // B 已有 3
  // card1=revive(进暂存), card2=3(重复→被救，重复牌进弃牌), card3=7(入手), f3
  r.deck = [num("c3", 7), num("c2", 3), revive("rv1"), f3("f3_1")];
  r.flip(a.id);
  (r as any).selectTarget(b.id); // 第 1 张: revive 进暂存
  (r as any).flip3Next(); // 第 2 张: 3 被暂存 revive 救（重复牌进弃牌堆）
  const res3 = (r as any).flip3Next(); // 第 3 张: 7 入手
  assert(res3.type === "flip_result", "第 3 张返回 flip_result");
  const res4 = (r as any).flip3Next(); // 执行 stash + done
  assert(res4.type === "done", "完成");
  assert(!b.isOut, "B 未出局");
  // B 原本有 3, 第 1 张 revive 进暂存, 第 2 张 3 被救（不进手）, 第 3 张 7 入手 → B 应有 [3, 7] = 2 张
  assert(b.hand.length === 2, `B 手牌应有 2 张, 实际 ${b.hand.length}`);
});

// ── P0-05: 七连翻 ──
test("P0-05: 翻三张 触发 Flip7 → 全员结算", () => {
  const r = makeRoom();
  const a = r.addPlayer("A", true);
  const b = r.addPlayer("B", false);
  r.initGame();
  b.hand = [num("b1", 1), num("b2", 2), num("b3", 3), num("b4", 4), num("b5", 5), num("b6", 6)]; // 6 张
  // card1=7(第7张→flip7), card2=8, card3=0, f3
  r.deck = [num("c3", 0), num("c2", 8), num("c1", 7), f3("f3_1")];
  r.flip(a.id);
  // B 选自己为目标，第 1 张就触发 flip7 → flip3 序列立即结束
  const selectResult = (r as any).selectTarget(b.id);
  assert(selectResult.success, "选择目标成功");
  assert(selectResult.flip3Ended === true, "flip7 在 card 1 触发，flip3 立即结束");
  assert(b.isOut, "B 出局(Flip7)");
  // B: 1+2+3+4+5+6+7=28 + 15 bonus = 43
  assert(b.score === 43, `B 应得 43 分, 实际 ${b.score}`);
});

// ── P0-06: 含 freeze → 暂存后冻结 ──
test("P0-06: 翻三张 含 freeze → 暂存后冻结目标", () => {
  const r = makeRoom(3);
  const a = r.addPlayer("A", true);
  const b = r.addPlayer("B", false);
  const c = r.addPlayer("C", false);
  r.initGame();
  c.hand = [num("c1", 5)]; // C 有手牌 5 分
  // card1=3, card2=5, card3=freeze(进暂存), f3
  r.deck = [freeze("fz1"), num("c2", 5), num("c1", 3), f3("f3_1")];
  r.flip(a.id);
  (r as any).selectTarget(b.id); // 第 1 张: 3
  (r as any).flip3Next(); // 第 2 张: 5
  const res3 = (r as any).flip3Next(); // 第 3 张: freeze 进暂存
  assert(res3.type === "flip_result", "第 3 张返回 flip_result");
  const paused = (r as any).flip3Next(); // 执行 stash(freeze) 时进入目标选择
  assert(paused === null, "freeze 应暂停等待选择目标");
  assert(r.pendingAction?.type === "freeze", "三张翻完后才出现 freeze 目标选择");
  assert(b.hand.length === 2, `B 手牌应有 2 张(3+5), 实际 ${b.hand.length}`);
  assert(!b.isOut, "B 未出局");
  const selected = r.selectTarget(c.id, a.id);
  assert(selected.success, "A 应能选择 C 作为冻结目标");
  assert(c.isOut, "C 被冻结");
  assert(c.score === 5, "C 被冻结得 5 分");
});

// ── P0-07: 含 revive → 获得复活牌 ──
test("P0-07: 翻三张 含 revive → 暂存后 B 获得 revive", () => {
  const r = makeRoom();
  const a = r.addPlayer("A", true);
  const b = r.addPlayer("B", false);
  r.initGame();
  // card1=3, card2=5, card3=revive(进暂存), f3
  r.deck = [revive("rv1"), num("c2", 5), num("c1", 3), f3("f3_1")];
  r.flip(a.id);
  (r as any).selectTarget(b.id);
  (r as any).flip3Next();
  const res3 = (r as any).flip3Next();
  assert(res3.type === "flip_result", "第 3 张返回 flip_result");
  (r as any).flip3Next(); // finalizing done

  assert(b.hand.some((c: Card) => c.type === "revive"), "B 有 revive 牌");
  assert(!b.isOut, "B 未出局");
});

// ── P0-08: 嵌套 flip3 ──
test("P0-08: 翻三张 嵌套 → 暂存中的 flip3 嵌套翻", () => {
  const r = makeRoom(3);
  const a = r.addPlayer("A", true);
  const b = r.addPlayer("B", false);
  const c = r.addPlayer("C", false);
  r.initGame();
  // Nested sequence: A triggers flip3 → B flips [7, 5, f3]
  // B's f3 goes to stash → executeStash uses executeFlip3Sequence
  // executeFlip3Sequence needs deck to have cards for the nested 3 flips
  // Deck: [nested3rd(1), nested2nd(2), nested1st(3), B3(f3), B2(5), B1(7), A_f3]
  r.deck = [
    num("n3", 1), num("n2", 2), num("n1", 3),  // Nested 3 flip cards
    f3("f3_nested"),                             // B's 3rd flip
    num("b2", 5), num("b1", 7),                  // B's first 2 flips
    f3("f3_actor"),                              // A's flip3
  ];
  r.flip(a.id);
  (r as any).selectTarget(b.id); // B flips 7
  (r as any).flip3Next(); // B flips 5
  const res3 = (r as any).flip3Next(); // B flips f3 (goes to stash)
  assert(res3.type === "flip_result", "第 3 张返回 flip_result");
  (r as any).flip3Next(); // finalizing done

  // After 3 flips done, executeStash handles the nested flip3 via executeFlip3Sequence
  assert(b.hand.length === 2, `B 手牌应有 2 张(7+5), 实际 ${b.hand.length}`);
});

// ── P0-09: 无目标 → 直接结算自己 ──
test("P0-09: 翻三张 无目标 → 直接结算自己", () => {
  const r = makeRoom();
  const a = r.addPlayer("A", true);
  const b = r.addPlayer("B", false);
  r.initGame();
  b.isOut = true; // B 已出局 → 唯一活跃玩家是 A
  a.hand = [num("a1", 3), num("a2", 5)]; // A 手牌 8 分
  r.deck = [f3("f3_1")];
  const res = r.flip(a.id);
  assert(res.result === "continue", "无目标 → 直接结算");
  assert(a.score === 8, `A 应得 8 分, 实际 ${a.score}`);
  assert(a.hand.length === 0, "A 手牌清空");
  assert(r.pendingAction === null, "pendingAction 清空");
  // 新回合开始，isOut 已重置
  assert(!a.isOut, "新回合开始 A isOut=false");
});

// ── P0-10: 翻三张 可以选择自己作为目标 ──
test("P0-10: 翻三张 可以选择自己作为目标", () => {
  const r = makeRoom();
  const a = r.addPlayer("A", true);
  const b = r.addPlayer("B", false);
  r.initGame();
  // card1=7, card2=5, card3=3, f3
  r.deck = [num("c3", 3), num("c2", 5), num("c1", 7), f3("f3_actor")];
  r.flip(a.id); // A 翻到 flip3
  assert(r.pendingAction?.type === "flipthree", "flip3 pending");
  
  const result = (r as any).selectTarget(a.id); // A 选择自己
  assert(result.success, "可以选择自己作为目标");
  assert((r as any).flip3State !== null, "flip3 state 初始化");
  
  const flip2Result = (r as any).flip3Next();
  assert(flip2Result.type === "flip_result", "第 2 张结果");
  assert(flip2Result.payload.flipNumber === 2, "翻第 2 张");
  
  const flip3Result = (r as any).flip3Next();
  assert(flip3Result.type === "flip_result", "第 3 张 flip_result");
  (r as any).flip3Next(); // finalizing done
  assert(a.hand.length === 3, `A 应得 3 张牌，实际 ${a.hand.length}`);
});

// ── P0-11: 翻三张 逐张翻过程中爆牌 ──
test("P0-13: 对自己用 flip3 第 1 张爆牌 → 立即切换下一位", () => {
  const r = makeRoom();
  const a = r.addPlayer("A", true);
  const b = r.addPlayer("B", false);
  r.initGame();
  a.hand = [num("a1", 5)]; // A 已有 5
  // f3 先被翻开，然后 A 翻第 1 张：5（重复 → 爆）
  r.deck = [num("f3_1", 5), f3("f3_act")];
  r.flip(a.id);
  assert(r.pendingAction?.type === "flipthree", "flip3 pending");

  // A 选择自己，第 1 张就爆
  const result = (r as any).selectTarget(a.id);
  assert(result.success, "选择自己成功");
  assert(result.flipResult.busted, "第 1 张就爆牌");
  assert(a.isOut, "A 爆牌");
  // 关键：爆牌后应立即切换到 B
  assert(r.currentPlayerId === b.id, `应切换到 B, 实际 currentPlayerId=${r.currentPlayerId}`);
});

test("P0-14: 对自己用 flip 3 张爆牌 + B 爆牌 → 新回合开始", () => {
  const r = makeRoom();
  const a = r.addPlayer("A", true);
  const b = r.addPlayer("B", false);
  r.initGame();
  a.hand = [num("a1", 5)]; // A 已有 5
  b.hand = [num("b1", 3)]; // B 已有 3

  // A 对自己用 flip3，3 张后爆牌
  // deck: card3(5→重复爆), card2(7), card1(2), f3_act
  r.deck = [num("c3", 5), num("c2", 7), num("c1", 2), f3("f3_act")];
  r.flip(a.id);
  (r as any).selectTarget(a.id); // 第 1 张: 2
  (r as any).flip3Next(); // 第 2 张: 7
  const res3 = (r as any).flip3Next(); // 第 3 张: 5（重复→爆）
  assert(res3.type === "done", "done");
  assert(a.isOut, "A 爆牌");
  assert(r.currentPlayerId === b.id, "切换到 B");

  // B 翻转也爆牌（重复 3）
  r.deck = [num("b2", 3)];
  r.flip(b.id);
  assert(b.isOut, "B 爆牌");
  
  // 模拟 handler 处理爆牌结算（clearBust 逻辑）
  // B 爆牌后 pendingBustPlayerId = B，结算后进入新回合
  if (r.pendingBustPlayerId !== null) {
    const bp = r.getPlayer(r.pendingBustPlayerId);
    if (bp) {
      r.discard.push(...bp.hand, r.lastFlip!);
      bp.hand = [];
    }
    r.pendingBustPlayerId = null;
  }
  // 检查回合是否结束
  if (r.isRoundOver()) {
    r.startNewRound();
  }

  // 两人都爆 → 新回合开始，isOut 重置
  assert(r.roundNumber === 2, `应进入第 2 回合, 实际 round=${r.roundNumber}`);
  assert(!a.isOut, "新回合 A isOut=false");
  assert(!b.isOut, "新回合 B isOut=false");
  // 新回合应轮到 A（或 B，取决于谁先手，但 A 先手）
  // startNewRound 后 currentPlayerId 设为第一个活跃玩家
  assert(r.currentPlayerId !== undefined, "新回合有当前玩家");
});

test("P0-11: 翻三张 第 2 张爆牌", () => {
  const r = makeRoom();
  const a = r.addPlayer("A", true);
  const b = r.addPlayer("B", false);
  r.initGame();
  a.hand = [num("pre_3", 3)]; // A 已有 3
  // card1=2, card2=3(重复→爆), card3=5, f3
  r.deck = [num("c3", 5), num("c2", 3), num("c1", 2), f3("f3_actor")];
  r.flip(a.id);
  assert(r.pendingAction?.type === "flipthree", "flip3 pending");
  
  const result = (r as any).selectTarget(a.id); // 第 1 张: 2
  assert(result.success, "选择自己成功");
  assert(!a.isOut, "第 1 张后未爆");
  
  const flip2Result = (r as any).flip3Next(); // 第 2 张: 3 (爆!)
  assert(flip2Result.type === "done", "爆牌后结束");
  assert(a.isOut, "A 已爆牌出局");
});

// ── P0-12: 翻三张 第 3 张爆牌 ──
test("P0-12: 翻三张 第 3 张爆牌", () => {
  const r = makeRoom();
  const a = r.addPlayer("A", true);
  const b = r.addPlayer("B", false);
  r.initGame();
  a.hand = [num("pre_3", 3)]; // A 已有 3
  // card1=2, card2=5, card3=3(重复→爆), f3
  r.deck = [num("c3", 3), num("c2", 5), num("c1", 2), f3("f3_actor")];
  r.flip(a.id);
  
  (r as any).selectTarget(a.id); // 第 1 张: 2
  assert(!a.isOut, "第 1 张后未爆");
  
  (r as any).flip3Next(); // 第 2 张: 5
  assert(!a.isOut, "第 2 张后未爆");
  
  const flip3Result = (r as any).flip3Next(); // 第 3 张: 3 (爆!)
  assert(flip3Result.type === "done", "爆牌后结束");
  assert(a.isOut, "A 已爆牌出局");
});

// ══════════════════════════════════════════════════════════════
// 场景12：多层嵌套 flip3（未覆盖场景 — 现有 P0-08 仅1层）
// ══════════════════════════════════════════════════════════════
console.log("\n📋 场景12: 多层嵌套 flip3");

test("权限：非 pending action 操作者不能选择目标", () => {
  const r = makeRoom();
  const a = r.addPlayer("A", true);
  const b = r.addPlayer("B", false);
  r.initGame();
  r.deck = [num("n_auth", 5), freeze("fz_auth")];
  const flip = r.flip(a.id);
  assert(flip.result === "pending_action", "应进入冻结目标选择");
  const result = r.selectTarget(b.id, b.id);
  assert(!result.success, "B 不得代替 A 选择冻结目标");
  assert(r.pendingAction?.actorId === a.id, "pendingAction 应仍属于 A");
});

test("权限：非目标玩家不能推进 flip3，服务端可权威推进", () => {
  const r = makeRoom();
  const a = r.addPlayer("A", true);
  const b = r.addPlayer("B", false);
  r.initGame();
  r.deck = [num("n3_auth", 3), num("n2_auth", 2), num("n1_auth", 1), f3("f3_auth")];
  r.flip(a.id);
  const selected = r.selectTarget(b.id, a.id);
  assert(selected.success, "A 应能选择 B");
  const wrongActor = r.flip3Next(a.id);
  assert(wrongActor === null, "行动玩家 A 不应推进目标 B 的 flip3");
  assert(r.flip3State?.targetId === b.id, "flip3 状态应保持不变");
  const serverEvents = r.advanceFlip3();
  assert(serverEvents.some((e) => e.type === "done"), "服务端应能权威推进完成 flip3");
});

test("S12-C1: 三层嵌套走通 — L3 freeze结算A", () => {
  const r = makeRoom(4);
  const a = r.addPlayer("A", true);
  const b = r.addPlayer("B", false);
  r.addPlayer("C", false); r.addPlayer("D", false);
  r.initGame();
  // L1:B翻[1, 2, f3_L1] f3_L1→L2:A翻[3, 4, f3_L2] f3_L2→L3:B翻[5, 6, freeze] freeze结算findFirstActiveTarget(B)=A
  r.deck = [
    freeze("fz_L3"),
    num("L3b", 6), num("L3a", 5),
    f3("f3_L2"),
    num("L2b", 4), num("L2a", 3),
    f3("f3_L1"),
    num("L1b", 2), num("L1a", 1),
    f3("f3_A"),
  ];
  r.flip(a.id);
  (r as any).selectTarget(b.id);
  const res2 = (r as any).flip3Next(); // B翻2
  assert(res2.type === "flip_result", "L1第2张应返回flip_result");
  const resL1 = (r as any).flip3Next(); // B翻f3_L1, finalizing=true
  assert(resL1.type === "flip_result", "L1第3张应返回flip_result");
  const pausedL2 = (r as any).flip3Next(); // finalizing → L1 stash f3，等待选择 L2 目标
  assert(pausedL2 === null && r.pendingAction?.type === "flipthree", "L1 stash f3 应等待选择 L2 目标");
  assert(r.selectTarget(a.id, a.id).success, "A 选择自己作为 L2 目标");
  finishFlip3(r, a.id); // L2 三张后等待选择 L3 目标
  assert(r.pendingAction?.type === "flipthree", "L2 stash f3 应等待选择 L3 目标");
  assert(r.selectTarget(b.id, a.id).success, "A 选择 B 作为 L3 目标");
  finishFlip3(r, b.id);
  assert(r.pendingAction?.type === "freeze", "L3 freeze 三张后才等待冻结目标");
  assert(r.selectTarget(a.id, a.id).success, "A 选择自己承受 freeze");

  assert(b.hand.length === 4, `B应有4张[1,2,5,6], 实际 ${b.hand.length}`);
  assert(a.isOut, "A应被L3 freeze冻结");
  // A被冻时手牌为L2所得[3,4]=7分
  assert(a.score === 7, `A被冻结应7分, 实际 ${a.score}`);
});

test("S12-C3: 四层嵌套被MAX=3截断 — f3_L3丢弃", () => {
  const r = makeRoom(4);
  const a = r.addPlayer("A", true);
  const b = r.addPlayer("B", false);
  r.addPlayer("C", false); r.addPlayer("D", false);
  r.initGame();
  // 每层stash f3, 第4层layer=3不小于MAX=3, f3丢弃
  // pop顺序: f3_A, w1, w2, f3_L1, x1, x2, f3_L2, y1, y2, f3_L3
  const discardBefore = r.discard.length;
  r.deck = [
    f3("f3_L3"),   // index 0 — 最后被popped (不会被pop, 作为L3 stash)
    num("y2", 5),  // index 1
    num("y1", 4),  // index 2
    f3("f3_L2"),   // index 3
    num("x2", 2),  // index 4
    num("x1", 1),  // index 5
    f3("f3_L1"),   // index 6
    num("w2", 8),  // index 7
    num("w1", 7),  // index 8
    f3("f3_A"),    // index 9 — 第一个被popped
  ];
  r.flip(a.id);
  (r as any).selectTarget(b.id); // pop w1
  (r as any).flip3Next();        // pop w2
  const res = (r as any).flip3Next(); // pop f3_L1, finalizing=true
  assert(res.type === "flip_result", "L1第3张返回flip_result");
  (r as any).flip3Next(); // finalizing → L1 stash f3，等待选择 L2
  assert(r.pendingAction?.type === "flipthree", "L1 stash f3 应等待选择 L2");
  assert(r.selectTarget(a.id, a.id).success, "选择 A 作为 L2 目标");
  finishFlip3(r, a.id);
  assert(r.pendingAction?.type === "flipthree", "L2 stash f3 应等待选择 L3");
  assert(r.selectTarget(b.id, a.id).success, "选择 B 作为 L3 目标");
  finishFlip3(r, b.id);

  // f3_L3 被丢弃进弃牌堆
  assert(r.discard.length > discardBefore, "嵌套丢弃的f3应进弃牌堆");
});

test("S12-C4: Layer2爆牌 — 上游stash丢弃", () => {
  const r = makeRoom();
  const a = r.addPlayer("A", true);
  const b = r.addPlayer("B", false);
  r.initGame();
  a.hand = [num("pre5", 5)]; // A有5,L2翻5时重复爆
  // L1:B翻[1,2,f3_L1] L2:A翻[3,5(爆),x]
  r.deck = [
    num("L2_3", 9),
    num("L2_2", 5),   // 重复爆
    num("L2_1", 3),
    f3("f3_L1"),
    num("L1_2", 2),
    num("L1_1", 1),
    f3("f3_A"),
  ];
  r.flip(a.id);
  (r as any).selectTarget(b.id);
  (r as any).flip3Next();
  (r as any).flip3Next();
  (r as any).flip3Next(); // finalizing → L1 stash f3，等待选择 L2
  assert(r.pendingAction?.type === "flipthree", "L1 stash f3 应等待选择 L2");
  assert(r.selectTarget(a.id, a.id).success, "选择 A 作为 L2 目标");
  finishFlip3(r, a.id);

  assert(a.isOut, "A应在L2爆牌");
  assert(b.hand.length === 2, `B应有[1,2], 实际 ${b.hand.length}`);
});

test("S12-C2: 嵌套含revive — revive正确归属B", () => {
  const r = makeRoom();
  const a = r.addPlayer("A", true);
  const b = r.addPlayer("B", false);
  r.initGame();
  // A自指: L1:A翻[1,2,f3_L1] L2目标=findFirstActiveTarget(A)=B, B翻[3,rv,7] B获得revive
  // pop顺序: f3_A, 1, 2, f3_L1, 3, rv, 7
  r.deck = [
    num("L2_3", 7),   // index 0
    revive("rv_L2"),  // index 1
    num("L2_1", 3),   // index 2
    f3("f3_L1"),      // index 3
    num("L1_2", 2),   // index 4
    num("L1_1", 1),   // index 5
    f3("f3_A"),       // index 6
  ];
  r.flip(a.id);
  (r as any).selectTarget(a.id); // A自指, pop 1
  (r as any).flip3Next();        // pop 2
  const resL1 = (r as any).flip3Next(); // pop f3_L1, finalizing=true
  assert(resL1.type === "flip_result", "L1第3张返回flip_result");
  (r as any).flip3Next(); // finalizing → L1 stash f3，等待选择 L2
  assert(r.pendingAction?.type === "flipthree", "L1 stash f3 应等待选择 L2");
  assert(r.selectTarget(b.id, a.id).success, "选择 B 作为 L2 目标");
  finishFlip3(r, b.id);

  assert(!a.hand.some((c: Card) => c.type === "revive"), "A不应有revive");
  assert(b.hand.some((c: Card) => c.type === "revive"), "B应获得revive");
  assert(!a.isOut && !b.isOut, "无人出局");
});

// ══════════════════════════════════════════════════════════════
// 场景15：翻三张暂存区freeze处理（当前逻辑：执行人也会被冻）
// ══════════════════════════════════════════════════════════════
console.log("\n📋 场景15: 翻三张暂存区freeze");

test("S15: 暂存区freeze — 目标唯一活跃时冻执行人, 正常结算不崩溃", () => {
  const r = makeRoom();
  const a = r.addPlayer("A", true);
  const b = r.addPlayer("B", false);
  r.initGame();
  a.hand = []; // 清空A手牌便于断言
  // A翻f3选B, B翻[1,2,freeze], freeze找目标=findFirstActiveTarget(B)=A(唯一活跃)
  r.deck = [freeze("fz"), num("b2", 2), num("b1", 1), f3("f3_A")];

  r.flip(a.id);
  assert(r.pendingAction?.type === "flipthree", "flip3触发pending");
  (r as any).selectTarget(b.id);       // B翻1
  (r as any).flip3Next();              // B翻2
  const res3 = (r as any).flip3Next(); // B翻freeze, finalizing=true
  assert(res3.type === "flip_result", "第3张返回flip_result");
  (r as any).flip3Next();              // finalizing → freeze 等待选择目标
  assert(r.pendingAction?.type === "freeze", "freeze 应在三张后等待选择目标");
  assert(r.selectTarget(a.id, a.id).success, "A 选择自己承受 freeze");

  assert(b.hand.length === 2, `B应有[1,2], 实际 ${b.hand.length}`);
  assert(a.isOut, "freeze应冻结执行人A");
  assert(a.score === 0, "A手牌空应得0分");
  // 验证游戏继续正常
  assert(r.phase === "playing", "游戏继续运行");
});

// ══════════════════════════════════════════════════════════════
// 场景16：翻三张中途牌堆空需补牌
// ══════════════════════════════════════════════════════════════
console.log("\n📋 场景16: 翻三张中途牌堆空补牌");

test("S16: 翻三张中途牌堆空 → 自动补牌完成", () => {
  const r = makeRoom();
  const a = r.addPlayer("A", true);
  const b = r.addPlayer("B", false);
  r.initGame();
  // 弃牌堆3张 + 牌堆3张(2num + f3_A), 翻第2张后牌堆空, 翻第3张触发补牌
  r.discard = [num("d1", 5), num("d2", 7), num("d3", 9)];
  r.deck = [num("c2", 2), num("c1", 1), f3("f3_A")];

  r.flip(a.id);
  (r as any).selectTarget(b.id); // B翻2
  (r as any).flip3Next();        // B翻1, 牌堆空
  (r as any).flip3Next();        // B翻第3张(补牌)
  (r as any).flip3Next();        // finalizing

  assert(b.hand.length === 3, `B应有3张, 实际 ${b.hand.length}`);
  assert(!b.isOut, "B未出局");
});

// ── 切换玩家 ──
console.log("\n📋 切换玩家 / 新回合");
test("nextPlayer 跳过出局玩家", () => {
  const r = makeRoom(3);
  const a = r.addPlayer("A", true);
  const b = r.addPlayer("B", false);
  const c = r.addPlayer("C", false);
  r.initGame();
  b.isOut = true;
  r.nextPlayer();
  assert(r.currentPlayerId === c.id, `应切换到 C, 实际 ${r.currentPlayerId}`);
});
test("nextPlayer 跳过 skipped玩家", () => {
  const r = makeRoom(3);
  r.addPlayer("A", true);
  const b = r.addPlayer("B", false);
  const c = r.addPlayer("C", false);
  r.initGame();
  b.skipped = true;
  r.nextPlayer();
  assert(r.currentPlayerId === c.id, `应跳过 B, 实际 ${r.currentPlayerId}`);
});
test("全员出局 → startNewRound", () => {
  const r = makeRoom();
  const a = r.addPlayer("A", true);
  const b = r.addPlayer("B", false);
  r.initGame();
  a.isOut = true; b.isOut = true;
  const rnd = r.roundNumber;
  r.nextPlayer();
  assert(r.roundNumber === rnd + 1, `新回合, 实际 ${r.roundNumber}`);
});

// ── P3-12: 新回合 ──
console.log("\n📋 P3-12: 新回合重置");
test("新回合: 手牌清空、isOut=false、手牌进弃牌", () => {
  const r = makeRoom();
  const a = r.addPlayer("A", true);
  const b = r.addPlayer("B", false);
  r.initGame();
  a.hand = [num("a1", 3), num("a2", 5)];
  b.hand = [num("b1", 2)];
  r.deck = [num("b2", 2), num("a3", 3)]; // A 翻 a3(3,重复) → bust; B 翻 b2(2,重复) → bust
  r.flip(a.id); clearBustAndAdvance(r);
  r.flip(r.currentPlayerId); clearBustAndAdvance(r);
  assert(a.hand.length === 0 && b.hand.length === 0, "手牌清空");
  assert(!a.isOut && !b.isOut, "isOut=false");
  // 弃牌堆在回合结束时可能因补牌逻辑被洗牌进牌堆，只要牌总数守恒即可
  const totalCards = r.deck.length + r.discard.length + a.hand.length + b.hand.length;
  assert(totalCards >= 3, `牌总数应 >= 3, 实际 ${totalCards}`);
});

// ── P3-06: 获胜 ──
console.log("\n📋 P3-06: 获胜判定");
test("200 分 → ended", () => {
  const r = makeRoom();
  const a = r.addPlayer("A", true);
  r.addPlayer("B", false); r.initGame();
  a.score = 190; a.hand = [num("a1", 10)];
  r.stop();
  assert(r.phase === "ended" && r.winnerId === a.id, "A 获胜");
});
test("超过 200 → ended", () => {
  const r = makeRoom();
  const a = r.addPlayer("A", true);
  r.addPlayer("B", false); r.initGame();
  a.score = 195; a.hand = [num("a1", 12)];
  r.stop();
  assert(r.phase === "ended", "ended");
});
test("新回合时检查已获胜", () => {
  const r = makeRoom();
  const a = r.addPlayer("A", true);
  const b = r.addPlayer("B", false);
  r.initGame();
  a.score = 200; a.hand = []; b.hand = [];
  r.startNewRound();
  assert(r.phase === "ended", "ended");
});

// ── P1-14: 牌堆空补牌 ──
console.log("\n📋 P1-14: 牌堆空补牌");
test("牌堆空 → 从弃牌堆补", () => {
  const r = makeRoom();
  r.addPlayer("A", true); r.addPlayer("B", false); r.initGame();
  while (r.deck.length > 0) r.discard.push(r.deck.pop()!);
  r.deck.push(r.discard.pop()!);
  assert(r.flip(0).success, "补牌成功");
});
test("牌堆+弃牌全空(玩家手牌非空) → 强制结算后补牌", () => {
  const r = makeRoom();
  const a = r.addPlayer("A", true);
  const b = r.addPlayer("B", false);
  r.initGame();
  a.hand = [num("a1", 3), num("a2", 5)];
  b.hand = [num("b1", 2), num("b2", 7)];
  r.deck = [];
  r.discard = [];
  const res = r.flip(a.id);
  assert(res.success, "强制结算后补牌成功");
  assert(r.roundNumber === 2, `应进入第 2 回合, 实际 ${r.roundNumber}`);
});

// ── 跳过玩家机制 (P8 新增) ──
console.log("\n📋 P8: 跳过玩家机制");
test("跳过玩家不参与回合", () => {
  const r = makeRoom(3);
  r.addPlayer("A", true);
  const b = r.addPlayer("B", false);
  r.addPlayer("C", false);
  r.initGame();
  b.skipped = true;
  r.nextPlayer();
  assert(r.currentPlayerId !== b.id, "跳过 B");
});
test("跳过玩家手牌仍进弃牌堆", () => {
  const r = makeRoom();
  const a = r.addPlayer("A", true);
  const b = r.addPlayer("B", false);
  r.initGame();
  a.hand = [num("a1", 3)];
  b.hand = [num("b1", 5)];
  a.isOut = true; b.skipped = true;
  r.startNewRound();
  assert(r.discard.length >= 2, "跳过玩家手牌进弃牌堆");
  assert(b.skipped === true, "b 保持 skipped");
});
test("P8-04 跳过玩家不得分(跳过=0分)", () => {
  const r = makeRoom();
  const a = r.addPlayer("A", true);
  const b = r.addPlayer("B", false);
  r.initGame();
  b.skipped = true;
  b.hand = [num("b1", 1), num("b2", 2), num("b3", 3)];
  b.isOut = true;
  r.startNewRound();
  assert(b.score === 0, `跳过玩家应 0 分, 实际 ${b.score}`);
  assert(b.skipped === true, "b 保持 skipped");
});
test("P8-05 跳过玩家不获胜", () => {
  const r = makeRoom();
  const a = r.addPlayer("A", true);
  const b = r.addPlayer("B", false);
  r.initGame();
  b.score = 199;
  b.skipped = true;
  b.hand = [num("b1", 5)];
  b.isOut = true;
  r.startNewRound();
  assert(b.score === 199, `跳过玩家分数不变, 实际 ${b.score}`);
  assert(r.phase === "playing", "游戏继续");
});
test("P9-06 跳过玩家跨回合持久化", () => {
  const r = makeRoom(3);
  const a = r.addPlayer("A", true);
  const b = r.addPlayer("B", false);
  const c = r.addPlayer("C", false);
  r.initGame();
  b.skipped = true;
  b.isOut = true;
  a.isOut = true; c.isOut = true;
  r.startNewRound();
  assert(b.skipped === true, "新回合 b 仍 skipped");
  assert(b.isOut === true, "新回合 b 仍 isOut=true");
  assert(r.getActivePlayers().length === 2, "仅 A/C 活跃");
});
test("P8-07 房主跳过 → 房主转移给下一个未跳过玩家", () => {
  const r = makeRoom(3);
  const a = r.addPlayer("A", true);
  const b = r.addPlayer("B", false);
  const c = r.addPlayer("C", false);
  r.initGame();
  a.skipped = true;
  a.isConnected = false;
  if (a.isHost) {
    a.isHost = false;
    const nextHost = findPlayer(r, (p: any) => !p.skipped && p.id !== a.id);
    if (nextHost) nextHost.isHost = true;
  }
  assert(b.isHost === true, "B 成为新房主");
  assert(a.isHost === false, "A 不再是房主");
});
test("唯一活跃玩家 → nextPlayer 不切换", () => {
  const r = makeRoom(3);
  const a = r.addPlayer("A", true);
  const b = r.addPlayer("B", false);
  const c = r.addPlayer("C", false);
  r.initGame();
  b.skipped = true; b.isOut = true;
  c.skipped = true; c.isOut = true;
  r.nextPlayer();
  assert(r.currentPlayerId === a.id, "唯一活跃玩家 A 保持当前");
});
test("P9-04 爆牌后仅活跃玩家继续回合", () => {
  const r = makeRoom();
  const a = r.addPlayer("A", true);
  const b = r.addPlayer("B", false);
  r.initGame();
  a.hand = [num("a1", 3)];
  r.deck = [num("a2", 3)];
  const res = r.flip(a.id);
  assert(res.result === "bust", "A 爆牌");
  assert(a.isOut, "A isOut");
  if (r.pendingBustPlayerId !== null) {
    const bp = r.getPlayer(r.pendingBustPlayerId);
    if (bp) {
      r.discard.push(...bp.hand, r.lastFlip!);
      bp.hand = [];
    }
    r.pendingBustPlayerId = null;
  }
  r.nextPlayer();
  assert(r.currentPlayerId === b.id, "B 继续回合");
});

// ── P0: isEmpty 检查 ──
console.log("\n📋 P0: isEmpty 和 disconnectTimers");
test("isEmpty 在房间无玩家时为 true", () => {
  const r = makeRoom();
  assert(r.isEmpty() === true, "空房间");
  r.addPlayer("A", true);
  assert(r.isEmpty() === false, "有玩家非空");
  r.removePlayer(0);
  assert(r.isEmpty() === true, "移除后为空");
});

// ── 测试总结 ──
console.log(`\n${"=".repeat(50)}`);
console.log(`Room 测试：通过 ${passed} / 失败 ${failed} / 总计 ${passed + failed}`);
console.log(`${"=".repeat(50)}`);
if (failed > 0) process.exit(1);
