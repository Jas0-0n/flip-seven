// ============================================================
// ui.js — DOM 渲染 / 动画 / 弹窗
// ============================================================
import { GAME_CONFIG, CARD_IMAGES } from './config.js';

const A = GAME_CONFIG.animation;

// ===== 图片映射辅助 =====

function cardImageKey(card) {
  if (card.type === 'number') return 'number-' + card.value;
  return card.value;
}

function cardImageSrc(card) {
  return CARD_IMAGES[cardImageKey(card)] || '';
}

// ===== 辅助函数 =====

function cardLabel(card) {
  if (card.type === 'number') return '\u6570\u5b57';
  if (card.type === 'action') return card.effect === 'flipthree' ? '\u7ffb\u4e09' : '\u51bb\u7ed3';
  if (card.type === 'revive') return '\u590d\u6d3b';
  return '\u7279\u6b8a';
}

function cardClass(card) {
  const v = card.value;
  if (card.type === 'number') return 'card-n' + v;
  if (card.type === 'special') {
    if (v === '+2') return 'card-sp-plus2';
    if (v === '+4') return 'card-sp-plus4';
    if (v === '+6') return 'card-sp-plus6';
    if (v === '+8') return 'card-sp-plus8';
    if (v === '+10') return 'card-sp-plus10';
    if (v === 'x2') return 'card-sp-x2';
  }
  if (card.type === 'action') {
    if (card.effect === 'flipthree') return 'card-action-flipthree';
    return 'card-action-freeze';
  }
  if (card.type === 'revive') return 'card-revive';
  return 'card-v0';
}

export function miniCardHTML(card) {
  const src = cardImageSrc(card);
  const fallback = cardLabel(card);
  return '<div class="mini-card ' + cardClass(card) + '">' +
    (src
      ? '<img src="' + src + '" alt="' + fallback + '" class="mini-card-img" />'
      : '<span class="card-value-text">' + fallback + '</span>') +
    '</div>';
}

// ===== 翻转卡片 =====

/**
 * 展示翻牌动画
 * @param {Object} card - 卡牌对象
 * @param {Function} onDone - 回调
 * @edge card 为空 → 不显示
 * @edge onDone 为空 → 不回调
 */
export function showFlipCard(card, onDone) {
  if (!card) return;
  const flipCard = document.getElementById('flipCard');
  const placeholder = document.getElementById('flipPlaceholder');
  const front = flipCard.querySelector('.flip-card-front');

  flipCard.style.display = 'flex';
  front.className = 'flip-card-front ' + cardClass(card);
  
  const src = cardImageSrc(card);
  front.innerHTML = src
    ? '<img src="' + src + '" alt="card" class="flip-card-img" />'
    : '<span class="card-value-text">' + cardLabel(card) + '</span>';

  placeholder.style.display = 'none';
  flipCard.className = 'flip-card-container';
  void flipCard.offsetWidth;
  flipCard.classList.add('flipped');

  setTimeout(function () {
    flipCard.className = 'flip-card-container flipped';
    void flipCard.offsetWidth;
    flipCard.classList.add('pop');
  }, A.flipToFront * 1000);

  setTimeout(onDone || function () {}, A.flipCallback * 1000);
}

export function hideFlipCard() {
  const flipCard = document.getElementById('flipCard');
  const placeholder = document.getElementById('flipPlaceholder');
  flipCard.className = 'flip-card-container';
  flipCard.style.display = 'none';
  placeholder.style.display = '';
}

/**
 * 飞行到手牌动画
 * @param {Object} card - 卡牌对象
 * @param {number} playerIdx - 目标玩家索引
 * @param {Function} onDone - 回调
 */
export function flyCardToHand(card, playerIdx, onDone) {
  const fly = document.createElement('div');
  fly.className = 'flying-card ' + cardClass(card);

  const handRect = document.getElementById('hand' + (playerIdx + 1)).getBoundingClientRect();
  const flipRect = document.getElementById('flipCard').getBoundingClientRect();

  // 起点：翻牌区域中心
  const startX = flipRect.left + flipRect.width / 2 - 45;
  const startY = flipRect.top + flipRect.height / 2 - 63;
  // 终点：手牌区域中心
  const endX = handRect.left + handRect.width / 2 - 45;
  const endY = handRect.top + handRect.height / 2 - 63;

  fly.style.left = startX + 'px';
  fly.style.top = startY + 'px';
  fly.style.width = '90px';
  fly.style.height = '126px';
  fly.style.zIndex = '999';
  fly.style.pointerEvents = 'none';
  fly.style.transition = 'left ' + A.flyTransition + 's cubic-bezier(0.25,0.46,0.45,0.94), top ' + A.flyTransition + 's cubic-bezier(0.25,0.46,0.45,0.94)';
  fly.innerHTML = '<img src="' + cardImageSrc(card) + '" alt="card" class="flying-card-img" />';
  document.body.appendChild(fly);

  hideFlipCard();

  // 强制重排，触发从起点到终点的过渡
  void fly.offsetWidth;
  fly.style.left = endX + 'px';
  fly.style.top = endY + 'px';

  setTimeout(function () {
    fly.style.transition = 'none';
    fly.style.animation = 'card-fly ' + A.flyImplode + 's ease-in forwards';
    setTimeout(function () {
      fly.remove();
      if (onDone) onDone();
    }, A.flyImplode * 1000);
  }, A.flyTransition * 1000);
}

// ===== 渲染 =====

export function render(state) {
  document.getElementById('roundInfo').textContent = '第 ' + state.roundNumber + ' 回合';
  document.getElementById('deckCount').textContent = state.deck.length;
  document.getElementById('discardCount').textContent = state.discard.length;

  state.players.forEach(function (player, i) {
    const playerNum = i + 1;
    const hand = document.getElementById('hand' + playerNum);
    const score = document.getElementById('score' + playerNum);
    const handCount = document.getElementById('handCount' + playerNum);
    const playerArea = document.getElementById('playerArea' + playerNum);

    hand.innerHTML = player.hand.map(miniCardHTML).join('');
    score.textContent = player.score;
    handCount.textContent = '(' + player.hand.length + '张)';

    if (state.currentPlayer === playerNum && state.state !== 'ended') {
      playerArea.classList.add('active');
    } else {
      playerArea.classList.remove('active');
    }

    if (state.playerOut[i]) {
      hand.style.opacity = '0.3';
      hand.style.filter = 'grayscale(1)';
    } else {
      hand.style.opacity = '1';
      hand.style.filter = 'none';
    }
  });

  const goBtn = document.getElementById('btnGo');
  const stopBtn = document.getElementById('btnStop');

  if (state.state === 'ended') {
    goBtn.disabled = true;
    stopBtn.disabled = true;
    goBtn.style.display = 'none';
    stopBtn.style.display = 'none';
  } else if (state.flipAnimating || state.state === 'playing') {
    goBtn.disabled = true;
    stopBtn.disabled = true;
  } else {
    goBtn.disabled = false;
    stopBtn.disabled = false;
    goBtn.style.display = '';
    stopBtn.style.display = '';
    const curIdx = state.currentPlayer - 1;
    if (state.players[curIdx] && state.players[curIdx].hand.length === 0) {
      stopBtn.disabled = true;
    }
  }

  // ===== 翻牌记录 =====
  var historyEl = document.getElementById('historyChips');
  if (historyEl) {
    historyEl.innerHTML = state.history.slice(-12).map(function (h) {
      var cls = 'history-chip';
      if (h.bust) cls += ' bust';
      else if (h.flip7) cls += ' flip7';
      else if (h.freezeEnd) cls += ' freeze-end';
      else if (h.revive) cls += ' revive';
      else if (h.special) cls += ' special';
      return '<span class="' + cls + '">' + h.text + '</span>';
    }).join('');
  }
}

// ===== 通知 =====

export function showToast(msg) {
  const el = document.createElement('div');
  el.className = 'toast';
  el.textContent = msg;
  document.body.appendChild(el);
  setTimeout(function () { el.classList.add('show'); }, 10);
  setTimeout(function () { el.classList.remove('show'); }, A.toast * 1000);
}

/**
 * 回合通知
 * @param {string} text - 通知文字
 * @param {string} type - 'start' 或 'end'
 */
export function showRoundNotify(text, type) {
  const el = document.createElement('div');
  el.className = 'round-notify ' + type;
  el.textContent = text;
  document.body.appendChild(el);
  setTimeout(function () { el.remove(); }, A.roundNotifyRemove * 1000);
}

// ===== Bust 特效 =====

export function showBustEffect() {
  document.body.classList.add('shake');
  setTimeout(function () { document.body.classList.remove('shake'); }, A.bustShake * 1000);

  const overlay = document.createElement('div');
  overlay.className = 'bust-overlay';
  document.body.appendChild(overlay);
  setTimeout(function () { overlay.remove(); }, A.bustOverlayRemove * 1000);

  const text = document.createElement('div');
  text.className = 'bust-text';
  text.textContent = '💥 BUST!';
  document.body.appendChild(text);
  setTimeout(function () { text.remove(); }, A.bustTextRemove * 1000);

  if (navigator.vibrate) navigator.vibrate([100, 50, 100, 50, 200]);
}

// ===== Flip 7 特效 =====

export function showFlip7Effect() {
  const overlay = document.createElement('div');
  overlay.className = 'flip7-overlay';
  overlay.innerHTML = '<div class="flip7-text">⭐ FLIP 7!</div>';
  document.body.appendChild(overlay);
  setTimeout(function () { overlay.remove(); }, A.flip7OverlayRemove * 1000);

  for (let i = 0; i < 30; i++) {
    const piece = document.createElement('div');
    piece.className = 'confetti';
    piece.style.left = (Math.random() * 100) + 'vw';
    piece.style.animation = 'confetti-fall ' + (Math.random() * 1.5 + 1) + 's linear ' + (Math.random() * 0.5) + 's forwards';
    document.body.appendChild(piece);
    setTimeout(function () { piece.remove(); }, A.confettiRemove * 1000);
  }
  if (navigator.vibrate) navigator.vibrate([50, 30, 50, 30, 50, 30, 100]);
}

// ===== 胜利弹窗 =====

/**
 * 显示胜利结果
 * @param {Object} state - 游戏状态
 * @param {number} winnerId - 获胜玩家 ID (1-based)
 * @edge state 为空 → 不显示
 * @edge winnerId 不合法 → 不显示
 */
export function showWinResult(state, winnerId) {
  if (!state || !winnerId) return;
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay win-overlay show';
  const winnerIdx = winnerId - 1;
  const score = (state.players && state.players[winnerIdx]) ? state.players[winnerIdx].score : 0;
  overlay.innerHTML = '<div class="modal win-modal">' +
    '<h1 class="win-title">🎉 玩家 ' + winnerId + ' 获胜！</h1>' +
    '<p class="win-score">最终得分：' + score + '分</p>' +
    '<button class="primary-btn" onclick="location.reload()">再来一局</button>' +
    '</div>';
  document.body.appendChild(overlay);
}

// ===== 冻结目标选择 =====

/**
 * 显示冻结目标选择弹窗
 * @param {Array<number>} targets - 可选择的玩家索引数组
 * @param {Function} onSelect - 选择回调
 * @edge targets 为空 → 不显示
 * @edge onSelect 为空 → 不回调
 */
export function showFreezeTargetSelection(targets, onSelect) {
  if (!targets || targets.length === 0) return;
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay freeze-selection-overlay show';
  let html = '<div class="modal"><h2>🧊 选择冻结目标</h2><p>选择要冻结的玩家：</p><div class="freeze-targets">';
  targets.forEach(function (idx) {
    html += '<div class="freeze-target" data-idx="' + idx + '"><div class="freeze-target-name">玩家 ' + (idx + 1) + '</div></div>';
  });
  html += '</div></div>';
  overlay.innerHTML = html;
  document.body.appendChild(overlay);
  overlay.querySelectorAll('.freeze-target').forEach(function (el) {
    el.addEventListener('click', function () {
      const targetIdx = parseInt(this.getAttribute('data-idx'));
      overlay.remove();
      if (onSelect) onSelect(targetIdx);
    });
  });
}

// ===== 翻三张目标选择 =====

/**
 * 显示翻三张目标选择弹窗
 * @param {Array<number>} targets - 可选择的玩家索引数组
 * @param {Function} onSelect - 选择回调
 * @edge targets 为空 → 不显示
 * @edge onSelect 为空 → 不回调
 */
export function showFlipThreeTargetSelection(targets, onSelect) {
  if (!targets || targets.length === 0) return;
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay freeze-selection-overlay show';
  let html = '<div class="modal"><h2>🔄 选择翻三张目标</h2><p>选择要翻三张的玩家：</p><div class="freeze-targets">';
  targets.forEach(function (idx) {
    html += '<div class="freeze-target" data-idx="' + idx + '"><div class="freeze-target-name">玩家 ' + (idx + 1) + '</div></div>';
  });
  html += '</div></div>';
  overlay.innerHTML = html;
  document.body.appendChild(overlay);
  overlay.querySelectorAll('.freeze-target').forEach(function (el) {
    el.addEventListener('click', function () {
      const targetIdx = parseInt(this.getAttribute('data-idx'));
      overlay.remove();
      if (onSelect) onSelect(targetIdx);
    });
  });
}

// ===== 规则弹窗 =====

export function showRules() {
  const overlay = document.getElementById('rulesModal');
  if (overlay) overlay.classList.add('show');
}

export function hideRules() {
  const overlay = document.getElementById('rulesModal');
  if (overlay) overlay.classList.remove('show');
}

export function initRulesModal() {
  const rulesBtn = document.getElementById('rulesBtn');
  const rulesModal = document.getElementById('rulesModal');
  const rulesClose = document.getElementById('rulesClose');

  if (rulesBtn) {
    rulesBtn.addEventListener('click', showRules);
  }
  if (rulesClose) {
    rulesClose.addEventListener('click', hideRules);
  }
  if (rulesModal) {
    rulesModal.addEventListener('click', function (e) {
      if (e.target === rulesModal) hideRules();
    });
  }
}
