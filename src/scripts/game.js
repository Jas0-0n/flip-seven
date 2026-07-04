import { createInitialState, shuffle } from './data.js';
import { calculateRoundScore, checkWinner, getActivePlayers, switchToNextPlayer } from './utils.js';

export { createInitialState, shuffle, calculateRoundScore, checkWinner, getActivePlayers, switchToNextPlayer };

export function autoRefillDeck(state, showToast) {
  if (state.deck.length === 0 && state.discard.length > 0) {
    state.deck = shuffle([...state.discard]);
    state.discard = [];
    if (showToast) showToast('♻️ 牌堆已补充！');
  }
}

export function startNewRound(state) {
  if (state.firstOut !== null) {
    state.currentPlayer = state.firstOut;
  } else {
    state.currentPlayer = state.currentPlayer === 1 ? 2 : 1;
  }
  state.playerOut = [false, false];
  state.firstOut = null;
  state.roundNumber++;
  state.totalFlipsThisRound = 0;
  state.state = 'waiting';
}

export function settleRound(state, playerIdx, calculateRoundScore) {
  const score = calculateRoundScore(state, playerIdx);
  const player = state.players[playerIdx];
  player.score += score;
  return { score, cards: player.hand.map(c => c.value) };
}

export function afterFlip(state, card, playerIdx, ui) {
  state.flipAnimating = false;
  const player = state.players[playerIdx];
  const isBust = card.type === 'number' && player.hand.some(c => c.type === 'number' && c.value === card.value);

  if (isBust) {
    const reviveIndex = player.hand.findIndex(c => c.type === 'revive');
    if (reviveIndex >= 0) {
      const revivedCard = player.hand[reviveIndex];
      player.hand.splice(reviveIndex, 1);
      state.discard.push(revivedCard);
      state.discard.push(card);
      state.history.push({
        round: state.roundNumber, playerId: state.currentPlayer,
        cards: [card.value], score: 0, bust: false, special: false, flip7: false, revive: true,
        text: 'P' + state.currentPlayer + ' 🛡️ 复活牌抵消！'
      });
      if (ui.showToast) ui.showToast('🛡️ 复活牌抵消了判负！');
      switchToNextPlayer(state);
      state.roundNumber++;
      state.state = 'waiting';
      if (ui.render) ui.render(state);
      return;
    }

    state.discard.push(...player.hand, card);
    player.hand = [];
    state.playerOut[playerIdx] = true;
    if (state.firstOut === null) state.firstOut = state.currentPlayer;

    state.history.push({
      round: state.roundNumber, playerId: state.currentPlayer,
      cards: [card.value], score: 0, bust: true, special: false, flip7: false,
      text: 'P' + state.currentPlayer + ' 💥 ' + card.value + ' (判负!)'
    });

    const active = getActivePlayers(state);
    if (active.length === 0) {
      if (ui.showRoundNotify) ui.showRoundNotify('第 ' + state.roundNumber + ' 回合结束！', 'end');
      startNewRound(state);
      if (ui.render) ui.render(state);
      if (ui.showBustEffect) ui.showBustEffect();
      if (ui.showToast) ui.showToast('💥 全员判负！下一轮开始');
      setTimeout(() => { if (ui.showRoundNotify) ui.showRoundNotify('第 ' + state.roundNumber + ' 回合开始！', 'start'); }, 1500);
      return;
    }
    if (active.length === 1) {
      state.currentPlayer = active[0] + 1;
      state.roundNumber++;
      state.state = 'waiting';
      if (ui.render) ui.render(state);
      if (ui.showBustEffect) ui.showBustEffect();
      return;
    }

    switchToNextPlayer(state);
    state.roundNumber++;
    state.state = 'waiting';
    if (ui.render) ui.render(state);
    if (ui.showBustEffect) ui.showBustEffect();
    return;
  }

  if (card.type === 'action' && card.effect === 'freeze') {
    state.discard.push(card);
    const active = getActivePlayers(state);
    if (active.length <= 1) {
      if (ui.showToast) ui.showToast('冻结牌无效！只有一位玩家活跃');
      state.roundNumber++;
      state.state = 'waiting';
      if (ui.render) ui.render(state);
      return;
    }
    const targets = active.filter(i => i !== playerIdx);
    if (ui.showFreezeTargetSelection) {
      ui.showFreezeTargetSelection(targets, targetIdx => {
        const otherPlayer = state.players[targetIdx];
        const otherScore = calculateRoundScore(state, targetIdx);
        otherPlayer.score += otherScore;
        state.discard.push(...otherPlayer.hand);
        otherPlayer.hand = [];
        state.history.push({
          round: state.roundNumber, playerId: targetIdx + 1,
          cards: [], score: otherScore, bust: false, special: false, flip7: false, freezeEnd: true,
          text: 'P' + (targetIdx + 1) + ' 🧊 冻结结束 +' + otherScore + '分'
        });
        if (ui.showToast) ui.showToast('🧊 冻结了 P' + (targetIdx + 1) + '！结算 +' + otherScore + '分，开始新一回合');
        if (ui.showRoundNotify) ui.showRoundNotify('第 ' + state.roundNumber + ' 回合结束！', 'end');
        setTimeout(() => {
          startNewRound(state);
          if (ui.render) ui.render(state);
          if (ui.showRoundNotify) ui.showRoundNotify('第 ' + state.roundNumber + ' 回合开始！', 'start');
        }, 1500);
      });
    }
    return;
  }

  player.hand.push(card);

  if (player.hand.length >= 7) {
    const bonus = calculateRoundScore(state, playerIdx) + 15;
    player.score += bonus;
    state.discard.push(...player.hand);
    player.hand = [];

    const otherIdx = playerIdx === 0 ? 1 : 0;
    const otherPlayer = state.players[otherIdx];
    if (otherPlayer.hand.length > 0) {
      const otherScore = calculateRoundScore(state, otherIdx);
      otherPlayer.score += otherScore;
      state.history.push({
        round: state.roundNumber, playerId: otherIdx + 1,
        cards: otherPlayer.hand.map(c => c.value), score: otherScore, bust: false, special: false, flip7: false,
        text: 'P' + (otherIdx + 1) + ' 📊 被动结算 +' + otherScore + '分'
      });
      state.discard.push(...otherPlayer.hand);
      otherPlayer.hand = [];
    }

    state.history.push({
      round: state.roundNumber, playerId: state.currentPlayer,
      cards: [], score: bonus, bust: false, special: false, flip7: true,
      text: 'P' + state.currentPlayer + ' ⭐ FLIP 7! +' + bonus + '分'
    });

    if (ui.render) ui.render(state);
    if (ui.showFlip7Effect) ui.showFlip7Effect();
    if (checkWinner(state, playerIdx)) {
      setTimeout(() => { if (ui.showWinResult) ui.showWinResult(state, state.currentPlayer); }, 1000);
      return;
    }
    setTimeout(() => { if (ui.showRoundNotify) ui.showRoundNotify('第 ' + state.roundNumber + ' 回合结束！', 'end'); }, 500);
    setTimeout(() => {
      startNewRound(state);
      if (ui.render) ui.render(state);
      if (ui.showRoundNotify) ui.showRoundNotify('第 ' + state.roundNumber + ' 回合开始！', 'start');
    }, 2500);
    return;
  }

  state.roundNumber++;
  state.state = 'waiting';
  const act = getActivePlayers(state);
  if (act.length > 1) switchToNextPlayer(state);
  if (ui.render) ui.render(state);
}

export function handleGo(state, ui) {
  if (state.state === 'ended' || state.flipAnimating) return;
  autoRefillDeck(state, ui.showToast);
  if (state.deck.length === 0) {
    if (ui.showToast) ui.showToast('⚠️ 牌堆已空！');
    return;
  }

  const card = state.deck.pop();
  const playerIdx = state.currentPlayer - 1;
  state.totalFlipsThisRound++;
  state.state = 'playing';
  state.flipAnimating = true;
  if (ui.render) ui.render(state);

  if (ui.showFlipCard) {
    ui.showFlipCard(card, () => {
      setTimeout(() => {
        if (ui.flyCardToHand) {
          ui.flyCardToHand(card, playerIdx, () => {
            afterFlip(state, card, playerIdx, ui);
          });
        } else {
          afterFlip(state, card, playerIdx, ui);
        }
      }, 500);
    });
  }
}

export function handleStop(state, ui, calculateRoundScore) {
  if (state.flipAnimating || state.state === 'ended') return;
  const playerIdx = state.currentPlayer - 1;
  const player = state.players[playerIdx];
  if (player.hand.length === 0) {
    if (ui.showToast) ui.showToast('⚠️ 手牌为空，无法结算！');
    return;
  }

  const { score, cards } = settleRound(state, playerIdx, calculateRoundScore);
  state.history.push({
    round: state.roundNumber, playerId: state.currentPlayer,
    cards, score, bust: false, special: false, flip7: false,
    text: 'P' + state.currentPlayer + ' ✋ ' + (cards.join(',') || '空') + ' → +' + score + '分'
  });
  state.discard.push(...player.hand);
  player.hand = [];
  if (ui.hideFlipCard) ui.hideFlipCard();
  state.totalFlipsThisRound = 0;

  if (checkWinner(state, playerIdx)) {
    state.state = 'ended';
    if (ui.render) ui.render(state);
    setTimeout(() => { if (ui.showWinResult) ui.showWinResult(state, state.currentPlayer); }, 500);
    return;
  }

  state.playerOut[playerIdx] = true;
  if (state.firstOut === null) state.firstOut = state.currentPlayer;

  const active = getActivePlayers(state);
  if (active.length === 0) {
    if (ui.showRoundNotify) ui.showRoundNotify('第 ' + state.roundNumber + ' 回合结束！', 'end');
    startNewRound(state);
    if (ui.render) ui.render(state);
    if (ui.showToast) ui.showToast('本回合结束，进入下一回合！');
    setTimeout(() => { if (ui.showRoundNotify) ui.showRoundNotify('第 ' + state.roundNumber + ' 回合开始！', 'start'); }, 1500);
    return;
  }

  if (active.length === 1) {
    state.currentPlayer = active[0] + 1;
  } else {
    switchToNextPlayer(state);
  }
  state.roundNumber++;
  state.state = 'waiting';
  if (ui.render) ui.render(state);
}

export function resetGame(state, ui, showRoundNotify) {
  const newState = createInitialState();
  Object.assign(state, newState);
  if (ui.render) ui.render(state);
  if (ui.showToast) ui.showToast('🔄 新游戏已开始！');
  if (showRoundNotify) showRoundNotify('第 1 回合开始！', 'start');
}
