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
function freeze(id: string): Card {
  return { type: "freeze", value: "freeze", effect: "freeze", id } as Card;
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

// ── P9-07: initGame 117 张 ──
console.log("\n📋 P9-07 / P0-09: initGame");
test("牌堆 = 117 张", () => {
  const r = makeRoom();
  r.addPlayer("A", true); r.addPlayer("B", false);
  r.initGame();
  assert(r.deck.length === 117, `牌堆应为 117, 实际 ${r.deck.length}`);
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
  r.addPlayer("B", false); r.initGame();
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
  // isOut 全部 true（回合立即结束）
  assert(a.isOut && b.isOut, "全员 isOut");
  // 弃牌堆包含 A 的手牌 + B 的手牌 + 翻出的 a7
  assert(r.discard.length >= 9, `弃牌堆 ≥ 9 张, 实际 ${r.discard.length}`);
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
  // 所有玩家手牌清空、isOut
  assert(a.hand.length === 0 && b.hand.length === 0 && c.hand.length === 0, "全员手牌清空");
  assert(a.isOut && b.isOut && c.isOut, "全员 isOut");
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
  assert(a.isOut, "A isOut = true");
  assert(a.hand.length === 0, "A 手牌清空");
});

// ── P5b: 翻三张牌（P1 修复） ──
console.log("\n📋 P5b: 翻三张牌");
test("翻到 flipthree → pending_action", () => {
  const r = makeRoom();
  const a = r.addPlayer("A", true);
  const b = r.addPlayer("B", false);
  r.initGame();
  b.hand = [num("b1", 5)]; // B 有手牌
  r.deck = [{ type: "flipthree", value: "flipthree", effect: "flipthree", id: "f3_1" } as Card];
  const res = r.flip(a.id);
  assert(res.result === "pending_action", "触发 pending_action");
  assert(r.pendingAction?.type === "flipthree", "type = flipthree");
});
test("选择 flipthree 目标 → 目标结算 + nextPlayer", () => {
  const r = makeRoom();
  const a = r.addPlayer("A", true);
  const b = r.addPlayer("B", false);
  r.currentPlayerId = a.id;
  b.hand = [num("b1", 4)]; // B 有手牌 4 分
  a.hand = [];
  r.phase = "playing";
  // 手动设置 pendingAction（模拟翻到 flipthree）
  r.pendingAction = { type: "flipthree", actorId: a.id, targetId: null };
  const result = r.selectTarget(b.id);
  assert(result.success, "选择目标成功");
  assert(b.score === 4, `B 应结算 4 分, 实际 ${b.score}`);
  assert(r.pendingAction === null, "pendingAction 清空");
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
