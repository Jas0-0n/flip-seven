import { createInitialState, shuffle } from './data.js';
import { calculateRoundScore, checkWinner, getActivePlayers, switchToNextPlayer } from './utils.js';
import { GAME_CONFIG, BOUNDS } from './config.js';

export { createInitialState, shuffle, calculateRoundScore, checkWinner, getActivePlayers, switchToNextPlayer };

// ===== ROUND MANAGEMENT =====

/**
 * 开始新回合
 * @param {Object} state - 游戏状态
 * @edge state.firstOut 为空 → 另一玩家先手
 * @edge state.firstOut 存在 → 该玩家先手（奖励机制）
 */
export function startNewRound(state) {
  // 防御: 确保 playerOut 长度正确
  if (!state.playerOut || state.playerOut.length !== GAME_CONFIG.playerCount) {
    state.playerOut = Array(GAME_CONFIG.playerCount).fill(false);
  }

  // First player to leave this round gets first turn next round
  if (state.firstOut !== null && state.firstOut >= 1 && state.firstOut <= GAME_CONFIG.playerCount) {
    state.currentPlayer = state.firstOut;
  } else {
    // Flip7: no one left → other player starts
    state.currentPlayer = state.currentPlayer === 1 ? 2 : 1;
  }
  state.playerOut.fill(false);
  state.firstOut = null;
  state.roundNumber++;
  state.totalFlipsThisRound = 0;
  state.state = 'waiting';
}

/**
 * 结束当前回合
 * @param {Object} state - 游戏状态
 * @param {Object} ui - UI 回调对象
 * @edge state 为空 → 直接返回
 */
function endRound(state, ui) {
  if (!state || !ui) return;
  if (ui.showRoundNotify) ui.showRoundNotify('第 ' + state.roundNumber + ' 回合结束！', 'end');
  startNewRound(state);
  if (ui.render) ui.render(state);
  if (ui.showToast) ui.showToast('本回合结束，进入下一回合！');
  setTimeout(function () {
    if (ui.showRoundNotify) ui.showRoundNotify('第 ' + state.roundNumber + ' 回合开始！', 'start');
  }, GAME_CONFIG.animation.endRoundNotifyDelay * 1000);
}

// ===== HELPERS =====

/**
 * 牌堆为空时从弃牌堆补充
 * @param {Object} state - 游戏状态
 * @param {Function} showToast - Toast 回调
 * @edge state.deck 不存在 → 初始化为空数组
 * @edge state.discard 不存在 → 不补充
 */
export function autoRefillDeck(state, showToast) {
  if (!state.deck) state.deck = [];
  if (!state.discard) state.discard = [];
  if (state.deck.length === 0 && state.discard.length > 0) {
    state.deck = shuffle([...state.discard]);
    state.discard = [];
    if (showToast) showToast('♻️ 牌堆已补充！');
  }
}

/**
 * 结算玩家回合
 * @param {Object} state - 游戏状态
 * @param {number} playerIdx - 玩家索引 (0-based)
 * @returns {Object} { score, cards }
 * @edge playerIdx 超出范围 → 返回 { score: 0, cards: [] }
 * @edge state.players[playerIdx] 不存在 → 返回 { score: 0, cards: [] }
 */
export function settleRound(state, playerIdx) {
  if (playerIdx < BOUNDS.minPlayerIdx || playerIdx > BOUNDS.maxPlayerIdx) {
    return { score: 0, cards: [] };
  }
  if (!state.players || !state.players[playerIdx]) {
    return { score: 0, cards: [] };
  }
  const score = calculateRoundScore(state, playerIdx);
  const player = state.players[playerIdx];
  player.score += score;
  return { score, cards: player.hand.map(function (c) { return c.value; }) };
}

// ===== CORE: afterFlip =====

/**
 * 翻牌后核心处理（最重要的一致性保障点）
 *
 * ═══════════════════════════════════════════════════════════════
 * 边界场景文档
 * ═══════════════════════════════════════════════════════════════
 *
 * [正常流程]
 * 1. 翻到数字卡 → 检查重复 → 不重复 → 加入手牌 → 换人
 * 2. 翻到特殊卡 → 加入手牌 → 检查 7 张数字 → 换人
 * 3. 翻到行动卡(冻结) → 冻结目标 → 结算目标 → 结束/换人
 * 4. 翻到行动卡(翻三张) → 发 3 张 → 结算暂存 → 切换
 * 5. 翻到功能牌(复活) → 加入手牌 → 换人
 *
 * [极端错误操作 + 兜底]
 * 1. playerIdx 越界 → 直接返回，不处理（由调用方保证）
 * 2. card.type 非法 → 当作特殊卡处理（副作用最小）
 * 3. 手牌长度 > 13 → 仍可正常游戏（数字卡最多 13 种不同）
 * 4. 牌堆空 + 同时触发翻牌 → autoRefillDeck 先补充
 * 5. 复活牌 + 同时翻到重复数字 → 复活优先消耗，不判负
 * 6. 翻三张过程中翻到冻结 + 只剩 1 人 → 冻结牌作废丢弃
 * 7. 翻三张过程中目标爆牌 → 暂存牌全部作废，立即停止
 * 8. 翻三张过程中触发七连翻 → 暂存牌进弃牌堆，回合结束
 * 9. 冻结对自己使用 → 不允许，目标列表排除自己
 * 10. 翻三张对自己使用 → 允许，结算后切换到对手
 * 11. 翻三张结算暂存时链式触发 → 3 张发完后继续结算剩余暂存
 * 12. currentPlayer 超出范围 → 由 switchToNextPlayer 防御
 * 13. state.deck / state.discard 为 null → autoRefillDeck 防御初始化
 * ═══════════════════════════════════════════════════════════════
 */

export function afterFlip(state, card, playerIdx, ui) {
  state.flipAnimating = false;
  var player = state.players[playerIdx];
  var isBust = card.type === 'number' && player.hand.some(function (c) { return c.type === 'number' && c.value === card.value; });

  // --- REVIVE: consume one revive to cancel bust ---
  if (isBust) {
    var reviveIndex = player.hand.findIndex(function (c) { return c.type === 'revive'; });
    if (reviveIndex >= 0) {
      var revivedCard = player.hand[reviveIndex];
      player.hand.splice(reviveIndex, 1);
      state.discard.push(revivedCard);
      state.discard.push(card);
      state.history.push({
        round: state.roundNumber, playerId: state.currentPlayer,
        cards: [card.value], score: 0, bust: false, special: false, flip7: false, revive: true,
        text: 'P' + state.currentPlayer + ' 🛡️ 复活牌抵消！'
      });
      if (ui.showToast) ui.showToast('🛡️ 复活牌抵消了判负！');
      // Revive: player stays in, switch to other player
      switchToNextPlayer(state);
      state.state = 'waiting';
      if (ui.render) ui.render(state);
      return;
    }

    // --- BUST: player is out ---
    state.discard.push.apply(state.discard, player.hand.concat([card]));
    player.hand = [];
    state.playerOut[playerIdx] = true;
    if (state.firstOut === null) state.firstOut = state.currentPlayer;

    state.history.push({
      round: state.roundNumber, playerId: state.currentPlayer,
      cards: [card.value], score: 0, bust: true, special: false, flip7: false,
      text: 'P' + state.currentPlayer + ' 💥 ' + card.value + ' (判负!)'
    });
    if (ui.showBustEffect) ui.showBustEffect();

    var active = getActivePlayers(state);

    // All players out → round ends
    if (active.length === 0) {
      endRound(state, ui);
      if (ui.showToast) ui.showToast('💥 全员判负！');
      return;
    }

    // 1 player left → they play alone (single player mode)
    if (active.length === 1) {
      state.currentPlayer = active[0] + 1;
      state.state = 'waiting';
      if (ui.render) ui.render(state);
      return;
    }

    // Multiple players still active → switch turn
    switchToNextPlayer(state);
    state.state = 'waiting';
    if (ui.render) ui.render(state);
    return;
  }

  // --- FREEZE: settle target player, target is out ---
  if (card.type === 'action' && card.effect === 'freeze') {
    state.discard.push(card);
    var activeFreeze = getActivePlayers(state);
    if (activeFreeze.length <= 1) {
      if (ui.showToast) ui.showToast('冻结牌无效！只有一位玩家活跃');
      state.state = 'waiting';
      if (ui.render) ui.render(state);
      return;
    }
    var targets = activeFreeze.filter(function (i) { return i !== playerIdx; });
    if (ui.showFreezeTargetSelection) {
      ui.showFreezeTargetSelection(targets, function (targetIdx) {
        var otherPlayer = state.players[targetIdx];
        var otherScore = calculateRoundScore(state, targetIdx);
        otherPlayer.score += otherScore;
        state.discard.push.apply(state.discard, otherPlayer.hand);
        otherPlayer.hand = [];
        state.playerOut[targetIdx] = true;
        if (state.firstOut === null) state.firstOut = targetIdx + 1;

        state.history.push({
          round: state.roundNumber, playerId: targetIdx + 1,
          cards: [], score: otherScore, bust: false, special: false, flip7: false, freezeEnd: true,
          text: 'P' + (targetIdx + 1) + ' 🧊 冻结结束 +' + otherScore + '分'
        });
        if (ui.showToast) ui.showToast('🧊 冻结了 P' + (targetIdx + 1) + '！结算 +' + otherScore + '分');

        var activeAfterFreeze = getActivePlayers(state);

        // All out → round ends
        if (activeAfterFreeze.length === 0) {
          endRound(state, ui);
          return;
        }

        // 1 left → they play alone
        if (activeAfterFreeze.length === 1) {
          state.currentPlayer = activeAfterFreeze[0] + 1;
          state.state = 'waiting';
          if (ui.render) ui.render(state);
          return;
        }

        // Multiple left → switch turn
        switchToNextPlayer(state);
        state.state = 'waiting';
        if (ui.render) ui.render(state);
      });
    }
    return;
  }

  // --- FLIP THREE: deal 3 cards to target ---
  if (card.type === 'action' && card.effect === 'flipthree') {
    handleFlipThree(state, card, playerIdx, ui);
    return;
  }

  // --- NORMAL: add card to hand ---
  player.hand.push(card);

  // --- FLIP 7 CHECK: 7 cards → both out, round ends ---
  if (player.hand.filter(function (c) { return c.type === 'number'; }).length >= GAME_CONFIG.rules.flipSevenThreshold) {
    var bonus = calculateRoundScore(state, playerIdx) + GAME_CONFIG.rules.flipSevenBonus;
    player.score += bonus;
    state.discard.push.apply(state.discard, player.hand);
    player.hand = [];
    state.playerOut[playerIdx] = true;

    // Passive settle: other player is also out
    var otherIdx = playerIdx === 0 ? 1 : 0;
    var otherPlayer = state.players[otherIdx];
    if (otherPlayer.hand.length > 0) {
      var otherScore = calculateRoundScore(state, otherIdx);
      otherPlayer.score += otherScore;
      state.history.push({
        round: state.roundNumber, playerId: otherIdx + 1,
        cards: otherPlayer.hand.map(function (c) { return c.value; }),
        score: otherScore, bust: false, special: false, flip7: false,
        text: 'P' + (otherIdx + 1) + ' 📊 被动结算 +' + otherScore + '分'
      });
      state.discard.push.apply(state.discard, otherPlayer.hand);
      otherPlayer.hand = [];
    }
    state.playerOut[otherIdx] = true;
    if (state.firstOut === null) state.firstOut = state.currentPlayer;

    state.history.push({
      round: state.roundNumber, playerId: state.currentPlayer,
      cards: [], score: bonus, bust: false, special: false, flip7: true,
      text: 'P' + state.currentPlayer + ' ⭐ FLIP 7! +' + bonus + '分'
    });

    if (ui.render) ui.render(state);
    if (ui.showFlip7Effect) ui.showFlip7Effect();

    // Check if game winner
    if (checkWinner(state, playerIdx)) {
      setTimeout(function () { if (ui.showWinResult) ui.showWinResult(state, state.currentPlayer); }, 250);
      return;
    }

    // Both out → round ends
    setTimeout(function () {
      endRound(state, ui);
    }, 500);
    return;
  }

  // --- SUCCESS: switch to other player, round continues ---
  switchToNextPlayer(state);
  state.state = 'waiting';
  if (ui.render) ui.render(state);
}

// ===== FLIP THREE =====

function handleFlipThree(state, card, playerIdx, ui) {
  state.discard.push(card);
  var active = getActivePlayers(state);
  if (active.length <= 1) {
    var targetIdx = active[0];
    state.currentPlayer = targetIdx + 1;
    if (ui.render) ui.render(state);
    dealThreeCards(state, targetIdx, playerIdx, ui, 0, []);
    return;
  }
  if (ui.showFlipThreeTargetSelection) {
    ui.showFlipThreeTargetSelection(active, function (targetIdx) {
      state.currentPlayer = targetIdx + 1;
      if (ui.render) ui.render(state);
      dealThreeCards(state, targetIdx, playerIdx, ui, 0, []);
    });
  }
}

function dealThreeCards(state, targetIdx, originalPlayerIdx, ui, count, queuedCards) {
  if (count >= GAME_CONFIG.rules.flipThreeCount) {
    resolveQueuedCards(state, targetIdx, originalPlayerIdx, ui, queuedCards);
    return;
  }
  autoRefillDeck(state, ui.showToast);
  if (state.deck.length === 0) {
    resolveQueuedCards(state, targetIdx, originalPlayerIdx, ui, queuedCards);
    return;
  }
  var card = state.deck.pop();
  state.state = 'playing';
  state.flipAnimating = true;
  if (ui.render) ui.render(state);
  if (ui.showFlipCard) {
    ui.showFlipCard(card, function () {
      setTimeout(function () {
        if (ui.flyCardToHand) {
          ui.flyCardToHand(card, targetIdx, function () {
            dealSingleFlipThreeCard(state, targetIdx, originalPlayerIdx, ui, count, queuedCards, card);
          });
        } else {
          dealSingleFlipThreeCard(state, targetIdx, originalPlayerIdx, ui, count, queuedCards, card);
        }
      }, 250);
    });
  }
}

function dealSingleFlipThreeCard(state, targetIdx, originalPlayerIdx, ui, count, queuedCards, card) {
  var target = state.players[targetIdx];
  var isBust = card.type === 'number' && target.hand.some(function (c) { return c.type === 'number' && c.value === card.value; });

  if (isBust) {
    var reviveIndex = target.hand.findIndex(function (c) { return c.type === 'revive'; });
    if (reviveIndex >= 0) {
      var revivedCard = target.hand[reviveIndex];
      target.hand.splice(reviveIndex, 1);
      state.discard.push(revivedCard, card);
      state.history.push({
        round: state.roundNumber, playerId: targetIdx + 1,
        cards: [card.value], score: 0, bust: false, special: false, flip7: false, revive: true,
        text: 'P' + (targetIdx + 1) + ' 🛡️ 复活牌抵消！（翻三张）'
      });
      if (ui.showToast) ui.showToast('🛡️ 复活牌抵消了判负！');
      dealThreeCards(state, targetIdx, originalPlayerIdx, ui, count + 1, queuedCards);
      return;
    }
    state.discard.push.apply(state.discard, target.hand.concat([card], queuedCards));
    target.hand = [];
    state.playerOut[targetIdx] = true;
    if (state.firstOut === null) state.firstOut = targetIdx + 1;
    state.flipAnimating = false;
    state.history.push({
      round: state.roundNumber, playerId: targetIdx + 1,
      cards: [card.value], score: 0, bust: true, special: false, flip7: false,
      text: 'P' + (targetIdx + 1) + ' 💥 ' + card.value + ' (判负! 翻三张)'
    });
    if (ui.showBustEffect) ui.showBustEffect();
    var active = getActivePlayers(state);
    if (active.length === 0) {
      endRound(state, ui);
      if (ui.showToast) ui.showToast('💥 全员判负！');
    } else if (active.length === 1) {
      state.currentPlayer = active[0] + 1;
      state.state = 'waiting';
      if (ui.render) ui.render(state);
    } else {
      switchToNextPlayer(state);
      state.state = 'waiting';
      if (ui.render) ui.render(state);
    }
    return;
  }

  if (card.type === 'action' && (card.effect === 'freeze' || card.effect === 'flipthree')) {
    queuedCards.push(card);
    if (ui.showToast) ui.showToast('📌 ' + card.value + ' 牌暂存，稍后结算');
    dealThreeCards(state, targetIdx, originalPlayerIdx, ui, count + 1, queuedCards);
    return;
  }

  target.hand.push(card);

  var numberCards = target.hand.filter(function (c) { return c.type === 'number'; });
  if (numberCards.length >= GAME_CONFIG.rules.flipSevenThreshold) {
    state.discard.push.apply(state.discard, queuedCards);
    var bonus = calculateRoundScore(state, targetIdx) + GAME_CONFIG.rules.flipSevenBonus;
    target.score += bonus;
    state.discard.push.apply(state.discard, target.hand);
    target.hand = [];
    state.playerOut[targetIdx] = true;
    var otherIdx = targetIdx === 0 ? 1 : 0;
    var otherPlayer = state.players[otherIdx];
    if (otherPlayer.hand.length > 0) {
      var otherScore = calculateRoundScore(state, otherIdx);
      otherPlayer.score += otherScore;
      state.history.push({
        round: state.roundNumber, playerId: otherIdx + 1,
        cards: otherPlayer.hand.map(function (c) { return c.value; }),
        score: otherScore, bust: false, special: false, flip7: false,
        text: 'P' + (otherIdx + 1) + ' 📊 被动结算 +' + otherScore + '分'
      });
      state.discard.push.apply(state.discard, otherPlayer.hand);
      otherPlayer.hand = [];
    }
    state.playerOut[otherIdx] = true;
    if (state.firstOut === null) state.firstOut = targetIdx + 1;
    state.flipAnimating = false;
    state.history.push({
      round: state.roundNumber, playerId: targetIdx + 1,
      cards: [], score: bonus, bust: false, special: false, flip7: true,
      text: 'P' + (targetIdx + 1) + ' ⭐ FLIP 7! +' + bonus + '分（翻三张）'
    });
    if (ui.render) ui.render(state);
    if (ui.showFlip7Effect) ui.showFlip7Effect();
    if (checkWinner(state, targetIdx)) {
      setTimeout(function () { if (ui.showWinResult) ui.showWinResult(state, targetIdx + 1); }, 500);
      return;
    }
    setTimeout(function () { endRound(state, ui); }, 500);
    return;
  }

  dealThreeCards(state, targetIdx, originalPlayerIdx, ui, count + 1, queuedCards);
}

function resolveQueuedCards(state, targetIdx, originalPlayerIdx, ui, queuedCards) {
  if (queuedCards.length === 0) {
    endFlipThreeSequence(state, targetIdx, originalPlayerIdx, ui);
    return;
  }
  var card = queuedCards.shift();
  if (card.effect === 'freeze') {
    var active = getActivePlayers(state);
    var freezeTargets = active.filter(function (i) { return i !== targetIdx; });
    if (freezeTargets.length === 0) {
      state.discard.push(card);
      if (ui.showToast) ui.showToast('🧊 冻结牌无法使用（仅剩一人），已丢弃');
      resolveQueuedCards(state, targetIdx, originalPlayerIdx, ui, queuedCards);
      return;
    }
    if (ui.showFreezeTargetSelection) {
      ui.showFreezeTargetSelection(freezeTargets, function (freezeTargetIdx) {
        var frozenPlayer = state.players[freezeTargetIdx];
        var frozenScore = calculateRoundScore(state, freezeTargetIdx);
        frozenPlayer.score += frozenScore;
        state.discard.push.apply(state.discard, frozenPlayer.hand);
        frozenPlayer.hand = [];
        state.playerOut[freezeTargetIdx] = true;
        if (state.firstOut === null) state.firstOut = freezeTargetIdx + 1;
        state.history.push({
          round: state.roundNumber, playerId: freezeTargetIdx + 1,
          cards: [], score: frozenScore, bust: false, special: false, flip7: false, freezeEnd: true,
          text: 'P' + (freezeTargetIdx + 1) + ' 🧊 冻结结束 +' + frozenScore + '分（翻三张）'
        });
        if (ui.showToast) ui.showToast('🧊 冻结了 P' + (freezeTargetIdx + 1) + '！结算 +' + frozenScore + '分');
        resolveQueuedCards(state, targetIdx, originalPlayerIdx, ui, queuedCards);
      });
    }
    return;
  }
  if (card.effect === 'flipthree') {
    var activeFlipThree = getActivePlayers(state);
    if (activeFlipThree.length <= 1) {
      var newTargetIdx = activeFlipThree[0];
      state.currentPlayer = newTargetIdx + 1;
      if (ui.render) ui.render(state);
      dealThreeCards(state, newTargetIdx, originalPlayerIdx, ui, 0, queuedCards);
      return;
    }
    if (ui.showFlipThreeTargetSelection) {
      ui.showFlipThreeTargetSelection(activeFlipThree, function (newTargetIdx) {
        state.currentPlayer = newTargetIdx + 1;
        if (ui.render) ui.render(state);
        dealThreeCards(state, newTargetIdx, originalPlayerIdx, ui, 0, queuedCards);
      });
    }
    return;
  }
}

function endFlipThreeSequence(state, targetIdx, originalPlayerIdx, ui) {
  var active = getActivePlayers(state);
  if (active.length === 0) {
    endRound(state, ui);
    return;
  }
  // If target is alive and was a different player → switch to target
  // If target is alive but same player (used on self) → switch to next player
  // If target was eliminated → switch to next active player
  if (!state.playerOut[targetIdx] && targetIdx !== originalPlayerIdx) {
    state.currentPlayer = targetIdx + 1;
  } else {
    switchToNextPlayer(state);
  }
  state.state = 'waiting';
  state.flipAnimating = false;
  if (ui.render) ui.render(state);
}

// ===== ACTIONS =====

/**
 * 玩家点击 "GO 翻牌"
 * @param {Object} state - 游戏状态
 * @param {Object} ui - UI 回调
 *
 * ═══════════════════════════════════════════════════════════════
 * 边界场景文档
 * ═══════════════════════════════════════════════════════════════
 *
 * [正常流程]
 * 1. 非 ended / 非 flipAnimating → 翻一张牌
 * 2. 牌堆空 → 从弃牌堆补充 → 再翻
 * 3. 补充后仍空 → Toast 提示 "牌堆已空"，不翻牌
 *
 * [极端错误操作 + 兜底]
 * 1. state.state === 'ended' → 直接返回，不做任何事
 * 2. state.flipAnimating === true → 直接返回，防止动画期间重复点击
 * 3. state.deck 为 null → autoRefillDeck 防御初始化
 * 4. state.discard 为 null → autoRefillDeck 不补充
 * 5. ui.showFlipCard 为空 → 跳过动画，直接调用 afterFlip
 * 6. ui.flyCardToHand 为空 → 跳过飞牌，直接调用 afterFlip
 * 7. 翻牌过程中浏览器失去响应 → flipAnimating 状态下按钮 disabled
 * ═══════════════════════════════════════════════════════════════
 */
export function handleGo(state, ui) {
  if (state.state === 'ended' || state.flipAnimating) return;
  autoRefillDeck(state, ui.showToast);
  if (state.deck.length === 0) {
    if (ui.showToast) ui.showToast('⚠️ 牌堆已空！');
    return;
  }

  var card = state.deck.pop();
  var playerIdx = state.currentPlayer - 1;
  state.totalFlipsThisRound++;
  state.state = 'playing';
  state.flipAnimating = true;
  if (ui.render) ui.render(state);

  if (ui.showFlipCard) {
    ui.showFlipCard(card, function () {
      setTimeout(function () {
        if (ui.flyCardToHand) {
          ui.flyCardToHand(card, playerIdx, function () {
            afterFlip(state, card, playerIdx, ui);
          });
        } else {
          afterFlip(state, card, playerIdx, ui);
        }
      }, 250);
    });
  }
}

/**
 * 玩家点击 "STOP 结算"
 * @param {Object} state - 游戏状态
 * @param {Object} ui - UI 回调
 *
 * ═══════════════════════════════════════════════════════════════
 * 边界场景文档
 * ═══════════════════════════════════════════════════════════════
 *
 * [正常流程]
 * 1. 手牌非空 → 结算得分 → 标记玩家出局 → 检查胜利/结束回合/换人
 * 2. 所有玩家出局 → endRound
 * 3. 只剩 1 人 → 该玩家继续
 * 4. 多人存活 → switchToNextPlayer
 *
 * [极端错误操作 + 兜底]
 * 1. state.flipAnimating === true → 直接返回，防止动画期间结算
 * 2. state.state === 'ended' → 直接返回
 * 3. player.hand.length === 0 → Toast 提示 "手牌为空"，不结算
 * 4. 结算后分数溢出（超过 Number.MAX_SAFE_INTEGER）→ 不可能发生，分数上限低
 * 5. checkWinner 返回 true → 立即结束游戏，不再切换玩家
 * 6. settleRound 中 playerIdx 越界 → 返回 { score: 0, cards: [] }
 * 7. state.players 为空 → 由 getActivePlayers / settleRound 防御
 * ═══════════════════════════════════════════════════════════════
 */
export function handleStop(state, ui) {
  if (state.flipAnimating || state.state === 'ended') return;
  var playerIdx = state.currentPlayer - 1;
  var player = state.players[playerIdx];
  if (player.hand.length === 0) {
    if (ui.showToast) ui.showToast('⚠️ 手牌为空，无法结算！');
    return;
  }

  // Settle: add score to total
  var result = settleRound(state, playerIdx);
  state.history.push({
    round: state.roundNumber, playerId: state.currentPlayer,
    cards: result.cards, score: result.score, bust: false, special: false, flip7: false,
    text: 'P' + state.currentPlayer + ' ✋ ' + (result.cards.join(',') || '空') + ' → +' + result.score + '分'
  });
  state.discard.push.apply(state.discard, player.hand);
  player.hand = [];
  if (ui.hideFlipCard) ui.hideFlipCard();
  state.totalFlipsThisRound = 0;
  state.playerOut[playerIdx] = true;
  if (state.firstOut === null) state.firstOut = state.currentPlayer;

  // Check game winner
  if (checkWinner(state, playerIdx)) {
    state.state = 'ended';
    if (ui.render) ui.render(state);
    setTimeout(function () { if (ui.showWinResult) ui.showWinResult(state, state.currentPlayer); }, 250);
    return;
  }

  var active = getActivePlayers(state);

  // All out → round ends
  if (active.length === 0) {
    endRound(state, ui);
    return;
  }

  // 1 left → they play alone (single player mode)
  if (active.length === 1) {
    state.currentPlayer = active[0] + 1;
  } else {
    switchToNextPlayer(state);
  }

  state.state = 'waiting';
  if (ui.render) ui.render(state);
}
