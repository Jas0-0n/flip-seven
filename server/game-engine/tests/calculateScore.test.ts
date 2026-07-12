// ============================================================
// Unit tests for calculateScore.ts — pure functions
// Run: npx tsx server/game-engine/tests/calculateScore.test.ts
// ============================================================

import {
  calculateRoundScore,
  isFlipSeven,
  isDuplicate,
  hasReviveCard,
  consumeReviveCard,
} from "@/utils/calculateScore";
import { FEATURE_FLAGS } from "@/config/featureFlags";
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

function num(id: string, value: number): Card {
  return { type: "number", value, id } as Card;
}

function score(id: string, value: string, effect: number): Card {
  return { type: "score", value, effect, id } as Card;
}

function dbl(id: string): Card {
  return { type: "double", value: "x2", effect: "multiply", id } as Card;
}

function revive(id: string): Card {
  return { type: "revive", value: "revive", effect: "revive", id } as Card;
}

function freeze(id: string): Card {
  return { type: "freeze", value: "freeze", effect: "freeze", id } as Card;
}

function flipthree(id: string): Card {
  return { type: "flipthree", value: "flipthree", effect: "flipthree", id } as Card;
}

// Enable score & double cards for tests
FEATURE_FLAGS.ENABLE_SCORE_CARDS = true;
FEATURE_FLAGS.ENABLE_DOUBLE_CARD = true;

// ── P9-01 / P2-01: calculateRoundScore 基础 ──
console.log("\n📋 calculateRoundScore 基础");
test("手牌 {1,2,3} = 6 分", () => {
  assert(calculateRoundScore([num("a", 1), num("b", 2), num("c", 3)]) === 6, "应为 6");
});
test("手牌 {1,3,5} = 9 分", () => {
  assert(calculateRoundScore([num("a", 1), num("b", 3), num("c", 5)]) === 9, "应为 9");
});
test("手牌 {7} = 7 分", () => {
  assert(calculateRoundScore([num("a", 7)]) === 7, "应为 7");
});
test("手牌 {0,5} = 5 分（0 不计分）", () => {
  assert(calculateRoundScore([num("a", 0), num("b", 5)]) === 5, "应为 5");
});
test("空牌 = 0 分", () => {
  assert(calculateRoundScore([]) === 0, "应为 0");
});
test("单张 {5} = 5 分", () => {
  assert(calculateRoundScore([num("a", 5)]) === 5, "应为 5");
});

// ── P2-01: 累加所有数字牌 ──
console.log("\n📋 calculateRoundScore 复杂");
test("手牌 {1,2,3,4,5,6,7} = 28", () => {
  const hand = [
    num("a", 1), num("b", 2), num("c", 3), num("d", 4),
    num("e", 5), num("f", 6), num("g", 7),
  ];
  assert(calculateRoundScore(hand) === 28, "应为 28");
});
test("含 freeze 牌不计分", () => {
  assert(calculateRoundScore([num("a", 5), freeze("f")]) === 5, "应为 5");
});
test("含 flipthree 牌不计分", () => {
  assert(calculateRoundScore([num("a", 5), flipthree("ft")]) === 5, "应为 5");
});
test("含 revival 牌不计分", () => {
  assert(calculateRoundScore([num("a", 5), revive("r")]) === 5, "应为 5");
});

// ── P2-07: 分数调整牌（FLAG ON 时） ──
console.log("\n📋 calculateRoundScore 分数调整牌");
test("手牌 {+2} = 2 分", () => {
  assert(calculateRoundScore([score("sp2", "+2", 2)]) === 2, "应为 2");
});
test("手牌 {+4} = 4 分", () => {
  assert(calculateRoundScore([score("sp4", "+4", 4)]) === 4, "应为 4");
});
test("手牌 {+10} = 10 分", () => {
  assert(calculateRoundScore([score("sp10", "+10", 10)]) === 10, "应为 10");
});
test("手牌 {5, +4} = 9 分（数字+调整）", () => {
  assert(calculateRoundScore([num("a", 5), score("sp4", "+4", 4)]) === 9, "应为 9");
});
test("手牌 {1,2,3,+6} = 12 分", () => {
  assert(calculateRoundScore([num("a",1), num("b",2), num("c",3), score("sp6", "+6", 6)]) === 12, "应为 12");
});

// ── P2-07: 加倍牌效果 ──
console.log("\n📋 calculateRoundScore 加倍牌");
test("手牌 {double} 单独 = 0 分", () => {
  assert(calculateRoundScore([dbl("dx")]) === 0, "应为 0");
});
test("手牌 {5, double} = 10 分（加倍）", () => {
  assert(calculateRoundScore([num("a", 5), dbl("dx")]) === 10, "应为 10");
});
test("手牌 {3,5,double} = 16 分（加倍）", () => {
  assert(calculateRoundScore([num("a", 3), num("b", 5), dbl("dx")]) === 16, "应为 16");
});

// ── 官方规则：加倍牌不影响分数调整牌 ──
console.log("\n📋 官方规则：加倍牌 × 分数调整牌");
test("{3,5,+4,double}: 先加倍后加 = (3+5)×2 + 4 = 20", () => {
  const hand = [num("a", 3), num("b", 5), score("sp4", "+4", 4), dbl("dx")];
  assert(calculateRoundScore(hand) === 20, `应为 20, 实际 ${calculateRoundScore(hand)}`);
});
test("{+4, double}: 只翻倍0 + 4 = 4", () => {
  const hand = [score("sp4", "+4", 4), dbl("dx")];
  assert(calculateRoundScore(hand) === 4, `应为 4, 实际 ${calculateRoundScore(hand)}`);
});
test("{0,3,4,5,+4,x2,9,10,11} 官方 case = 103", () => {
  // 官方规则：(0+3+4+5+9+10+11)×2 + 4 + 15(七连翻) = 42×2 + 4 + 15 = 103
  const hand = [
    num("n0", 0), num("n3", 3), num("n4", 4), num("n5", 5),
    score("sp4", "+4", 4),
    dbl("dx"),
    num("n9", 9), num("n10", 10), num("n11", 11),
  ];
  const result = calculateRoundScore(hand, 15);
  assert(result === 103, `应为 103, 实际 ${result}`);
});

// ── P2-06: FLIP7 bonus ──
console.log("\n📋 calculateRoundScore FLIP7 bonus");
test("纯数字 7 张 +15 = 43", () => {
  const hand = [
    num("a", 1), num("b", 2), num("c", 3), num("d", 4),
    num("e", 5), num("f", 6), num("g", 7),
  ];
  assert(calculateRoundScore(hand, 15) === 43, "应为 43");
});
test("含复活牌 +15 = 36（复活不计分）", () => {
  const hand = [
    num("a", 1), num("b", 2), num("c", 3),
    num("d", 4), num("e", 5), num("f", 6),
    revive("rv"),
  ];
  assert(calculateRoundScore(hand, 15) === 36, "应为 36");
});
test("七连翻 + 加倍：{1,2,3,4,5,6,7,double} = (28×2) + 15 = 71", () => {
  const hand = [
    num("a", 1), num("b", 2), num("c", 3), num("d", 4),
    num("e", 5), num("f", 6), num("g", 7), dbl("dx"),
  ];
  assert(calculateRoundScore(hand, 15) === 71, `应为 71, 实际 ${calculateRoundScore(hand, 15)}`);
});

// ── P9-02 / P9-03: isFlipSeven ──
console.log("\n📋 isFlipSeven");
test("7 纯数字 → true", () => {
  const hand = [
    num("a", 1), num("b", 2), num("c", 3), num("d", 4),
    num("e", 5), num("f", 6), num("g", 7),
  ];
  assert(isFlipSeven(hand) === true, "应为 true");
});
test("6 数字 + 1 复活 → false", () => {
  const hand = [
    num("a", 1), num("b", 2), num("c", 3),
    num("d", 4), num("e", 5), num("f", 6),
    revive("rv"),
  ];
  assert(isFlipSeven(hand) === false, "应为 false");
});
test("7 数字 + 1 复活 → true", () => {
  const hand = [
    num("a", 1), num("b", 2), num("c", 3), num("d", 4),
    num("e", 5), num("f", 6), num("g", 7), revive("rv"),
  ];
  assert(isFlipSeven(hand) === true, "应为 true");
});
test("空牌 → false", () => {
  assert(isFlipSeven([]) === false, "应为 false");
});
test("6 张纯数字 → false", () => {
  const hand = [
    num("a", 1), num("b", 2), num("c", 3),
    num("d", 4), num("e", 5), num("f", 6),
  ];
  assert(isFlipSeven(hand) === false, "应为 false");
});
test("含 freeze 牌 + 6 数字 → false", () => {
  const hand = [
    num("a", 1), num("b", 2), num("c", 3),
    num("d", 4), num("e", 5), num("f", 6),
    freeze("fr"),
  ];
  assert(isFlipSeven(hand) === false, "应为 false");
});

// ── P1-04: isDuplicate ──
console.log("\n📋 isDuplicate");
test("手牌已有 3，翻到 3 → bust", () => {
  const hand = [num("a", 1), num("b", 3)];
  assert(isDuplicate(num("c", 3), hand) === true, "应为 true");
});
test("手牌没有 5，翻到 5 → ok", () => {
  const hand = [num("a", 1), num("b", 3)];
  assert(isDuplicate(num("c", 5), hand) === false, "应为 false");
});
test("空牌 + 任意 → ok", () => {
  assert(isDuplicate(num("c", 7), []) === false, "应为 false");
});

// ── P1-05: hasReviveCard ──
console.log("\n📋 hasReviveCard");
test("手牌有 1 张复活 → true", () => {
  assert(hasReviveCard([num("a", 5), revive("rv")]) === true, "应为 true");
});
test("手牌无复活 → false", () => {
  assert(hasReviveCard([num("a", 5)]) === false, "应为 false");
});
test("空牌 → false", () => {
  assert(hasReviveCard([]) === false, "应为 false");
});

// ── P1-06: consumeReviveCard ──
console.log("\n📋 consumeReviveCard");
test("消耗复活牌并返回新牌", () => {
  const hand = [num("a", 5), revive("rv")];
  const result = consumeReviveCard(hand);
  assert(result.consumed !== null, "应消耗了牌");
  assert(result.newHand.length === 1, "应剩一张");
  assert(result.consumed?.id === "rv", "消耗的是复活牌");
});

test("无复活牌 → consumed null", () => {
  const hand = [num("a", 5)];
  const result = consumeReviveCard(hand);
  assert(result.consumed === null, "应返回 null");
});

// ── 测试总结 ──
console.log(`\n${"=".repeat(50)}`);
console.log(`calculateScore 测试：通过 ${passed} / 失败 ${failed} / 总计 ${passed + failed}`);
console.log(`${"=".repeat(50)}`);

if (failed > 0) process.exit(1);
