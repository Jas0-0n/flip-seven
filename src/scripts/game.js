import { createInitialState, shuffle } from './data.js';
import { calculateRoundScore, checkWinner, getActivePlayers, switchToNextPlayer } from './utils.js';

export { createInitialState, shuffle, calculateRoundScore, checkWinner, getActivePlayers, switchToNextPlayer };

// ===== ROUND MANAGEMENT =====

export function startNewRound(state) {
  // First player to leave this round gets first turn next round
  if (state.firstOut !== null) {
    state.currentPlayer = state.firstOut;
  } else {
    // Flip7: no one left → other player starts
    state.currentPlayer = state.currentPlayer === 1 ? 2 : 1;
  }
  state.playerOut = [false, false];
  state.firstOut = null;
  state.roundNumber++;
  state.totalFlipsThisRound = 0;
  state.state = 'waiting';
}

function endRound(state, ui) {
  if (ui.showRoundNotify) ui.showRoundNotify('第 ' + state.roundNumber + ' 回合结束！', 'end');
  startNewRound(state);
  if (ui.render) ui.render(state);
  if (ui.showToast) ui.showToast('本回合结束，进入下一回合！');
  setTimeout(function () {
    if (ui.showRoundNotify) ui.showRoundNotify('第 ' + state.roundNumber + ' 回合开始！', 'start');
  }, 750);
}

// ===== HELPERS =====

export function autoRefillDeck(state, showToast) {
  if (state.deck.length === 0 && state.discard.length > 0) {
    state.deck = shuffle([...state.discard]);
    state.discard = [];
    if (showToast) showToast('♻️ 牌堆已补充！');
  }
}

export function settleRound(state, playerIdx) {
  const score = calculateRoundScore(state, playerIdx);
  const player = state.players[playerIdx];
  player.score += score;
  return { score, cards: player.hand.map(function (c) { return c.value; }) };
}

// ===== CORE: afterFlip =====

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
  if (player.hand.filter(function (c) { return c.type === 'number'; }).length >= 7) {
    var bonus = calculateRoundScore(state, playerIdx) + 15;
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
  if (count >= 3) {
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
  if (numberCards.length >= 7) {
    state.discard.push.apply(state.discard, queuedCards);
    var bonus = calculateRoundScore(state, targetIdx) + 15;
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
