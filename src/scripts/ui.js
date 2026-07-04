import { calculateRoundScore } from './utils.js';
import { autoRefillDeck } from './game.js';

export function showToast(msg) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.classList.add('show');
  setTimeout(() => el.classList.remove('show'), 2000);
}

export function cardClass(card) {
  if (card.type === 'number') return 'card-v' + card.value;
  const v = card.value;
  if (v === '+2') return 'card-sp-plus2';
  if (v === '+4') return 'card-sp-plus4';
  if (v === '+6') return 'card-sp-plus6';
  if (v === '+8') return 'card-sp-plus8';
  if (v === '+10') return 'card-sp-plus10';
  if (v === 'x2') return 'card-sp-x2';
  if (card.type === 'action') return 'card-action-freeze';
  if (card.type === 'revive') return 'card-revive';
  return 'card-v0';
}

export function miniCardHTML(card) {
  const label = card.type === 'number' ? '\u6570\u5b57' : (card.type === 'action' ? '\u884c\u52a8' : (card.type === 'revive' ? '\u590d\u6d3b' : '\u7279\u6b8a'));
  return '<div class="mini-card ' + cardClass(card) + '">' +
    '<span class="card-label">' + label + '</span>' +
    '<span class="card-value">' + card.value + '</span></div>';
}

export function showFlipCard(card, onDone) {
  const flipCard = document.getElementById('flipCard');
  const placeholder = document.getElementById('flipPlaceholder');
  const front = document.getElementById('flipCardFront');

  front.className = 'flip-card-front ' + cardClass(card);
  front.innerHTML = '<span class="flip-label">' + (card.type === 'number' ? '\u6570\u5b57' : (card.type === 'action' ? '\u884c\u52a8' : (card.type === 'revive' ? '\u590d\u6d3b' : '\u7279\u6b8a'))) + '</span><span class="flip-value">' + card.value + '</span>';

  placeholder.style.display = 'none';
  flipCard.style.display = '';

  flipCard.className = 'flip-card-container';
  void flipCard.offsetWidth;
  flipCard.classList.add('flipped');

  setTimeout(function () {
    flipCard.className = 'flip-card-container flipped';
    void flipCard.offsetWidth;
    flipCard.classList.add('pop');
  }, 600);

  setTimeout(onDone, 900);
}

export function hideFlipCard() {
  const flipCard = document.getElementById('flipCard');
  const placeholder = document.getElementById('flipPlaceholder');
  flipCard.className = 'flip-card-container';
  flipCard.style.display = 'none';
  placeholder.style.display = '';
}

export function flyCardToHand(card, playerIdx, onDone) {
  const flipCard = document.getElementById('flipCard');
  const target = document.getElementById('hand' + (playerIdx + 1));

  const srcRect = flipCard.getBoundingClientRect();
  const tgtRect = target.getBoundingClientRect();

  const fly = document.createElement('div');
  fly.className = 'mini-card ' + cardClass(card);
  fly.style.position = 'fixed';
  fly.style.left = srcRect.left + 'px';
  fly.style.top = srcRect.top + 'px';
  fly.style.width = '90px';
  fly.style.height = '126px';
  fly.style.zIndex = '999';
  fly.style.pointerEvents = 'none';
  fly.style.transition = 'left 0.45s cubic-bezier(0.25,0.46,0.45,0.94), top 0.45s cubic-bezier(0.25,0.46,0.45,0.94)';
  fly.innerHTML = '<span class="card-label">' + (card.type === 'number' ? '\u6570\u5b57' : (card.type === 'action' ? '\u884c\u52a8' : (card.type === 'revive' ? '\u590d\u6d3b' : '\u7279\u6b8a'))) + '</span><span class="card-value">' + card.value + '</span>';
  document.body.appendChild(fly);

  hideFlipCard();
  void fly.offsetWidth;
  fly.style.left = (tgtRect.left + tgtRect.width / 2 - 45) + 'px';
  fly.style.top = (tgtRect.top + tgtRect.height / 2 - 63) + 'px';

  setTimeout(function () {
    fly.style.transition = 'none';
    fly.style.animation = 'card-fly 0.35s ease-in forwards';
    setTimeout(function () {
      fly.remove();
      onDone();
    }, 350);
  }, 450);
}

export function render(state) {
  autoRefillDeck(state, showToast);
  const p1 = state.players[0], p2 = state.players[1];

  document.getElementById('roundInfo').textContent = '\u7b2c ' + state.roundNumber + ' \u56de\u5408';

  const area1 = document.getElementById('playerArea1');
  const area2 = document.getElementById('playerArea2');
  area1.classList.toggle('active', state.currentPlayer === 1 && !state.playerOut[0]);
  area2.classList.toggle('active', state.currentPlayer === 2 && !state.playerOut[1]);
  area1.classList.toggle('out', state.playerOut[0]);
  area2.classList.toggle('out', state.playerOut[1]);

  document.getElementById('score1').textContent = p1.score;
  document.getElementById('score2').textContent = p2.score;

  const rs1 = document.getElementById('roundScore1');
  const rs2 = document.getElementById('roundScore2');
  rs1.textContent = p1.hand.length > 0 ? '\u672c\u8f6e\u9884\u4f30: ' + calculateRoundScore(state, 0) + '\u5206' : '';
  rs2.textContent = p2.hand.length > 0 ? '\u672c\u8f6e\u9884\u4f30: ' + calculateRoundScore(state, 1) + '\u5206' : '';

  document.getElementById('hand1').innerHTML = p1.hand.map(c => miniCardHTML(c)).join('');
  document.getElementById('hand2').innerHTML = p2.hand.map(c => miniCardHTML(c)).join('');
  document.getElementById('handCount1').textContent = '(' + p1.hand.length + '\u5f39)';
  document.getElementById('handCount2').textContent = '(' + p2.hand.length + '\u5f39)';

  document.getElementById('deckCount').textContent = state.deck.length;
  document.getElementById('discardCount').textContent = state.discard.length;
  const dv = document.getElementById('discardVisual');
  if (state.discard.length > 0) {
    dv.innerHTML = miniCardHTML(state.discard[state.discard.length - 1]);
    dv.style.border = 'none'; dv.style.background = 'none';
  } else {
    dv.innerHTML = '<span>\u5f03\u724c\u5806</span>';
    dv.style.border = '2px dashed var(--text-muted)'; dv.style.background = 'var(--bg-surface)';
  }

  const btnGo = document.getElementById('btnGo');
  const btnStop = document.getElementById('btnStop');
  if (state.state === 'ended') {
    btnGo.style.display = 'none'; btnStop.style.display = 'none';
  } else {
    btnGo.style.display = ''; btnStop.style.display = '';
    const canAct = !state.flipAnimating;
    btnGo.disabled = !canAct;
    btnStop.disabled = !canAct;
    btnGo.textContent = 'GO \u7ffb\u724c';
  }

  document.getElementById('historyChips').innerHTML = state.history.slice(-12).map(function (h) {
    var cls = 'history-chip';
    if (h.bust) cls += ' bust';
    else if (h.flip7) cls += ' flip7';
    else if (h.freezeEnd) cls += ' freeze-end';
    else if (h.revive) cls += ' revive';
    else if (h.special) cls += ' special';
    return '<span class="' + cls + '">' + h.text + '</span>';
  }).join('');
}

export function showRoundNotify(text, type) {
  const el = document.createElement('div');
  el.className = 'round-notify ' + type;
  el.textContent = text;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 2200);
}

export function showBustEffect() {
  document.body.classList.add('shake');
  setTimeout(() => document.body.classList.remove('shake'), 500);
  const overlay = document.createElement('div');
  overlay.className = 'bust-overlay';
  document.body.appendChild(overlay);
  setTimeout(() => overlay.remove(), 500);
  const text = document.createElement('div');
  text.className = 'bust-text';
  text.textContent = 'BUST!';
  document.body.appendChild(text);
  setTimeout(() => text.remove(), 1200);
  if (navigator.vibrate) navigator.vibrate([100, 50, 100, 50, 200]);
}

export function showFlip7Effect() {
  const overlay = document.createElement('div');
  overlay.className = 'flip7-overlay';
  overlay.innerHTML = '<div class="flip7-text">\u2b50 FLIP 7!</div>';
  document.body.appendChild(overlay);
  setTimeout(() => overlay.remove(), 2500);
  for (let i = 0; i < 30; i++) {
    const piece = document.createElement('div');
    piece.className = 'confetti-piece';
    piece.style.left = Math.random() * 100 + 'vw';
    piece.style.top = '-10px';
    piece.style.background = ['#fbbf24', '#f59e0b', '#3b82f6', '#10b981', '#ec4899', '#a855f7'][Math.floor(Math.random() * 6)];
    piece.style.width = (Math.random() * 8 + 6) + 'px';
    piece.style.height = (Math.random() * 8 + 6) + 'px';
    piece.style.borderRadius = Math.random() > 0.5 ? '50%' : '2px';
    piece.style.animation = 'confetti-fall ' + (Math.random() * 1.5 + 1) + 's linear ' + (Math.random() * 0.5) + 's forwards';
    document.body.appendChild(piece);
    setTimeout(() => piece.remove(), 3000);
  }
  if (navigator.vibrate) navigator.vibrate([50, 30, 50, 30, 50, 30, 100]);
}

export function showWinResult(state, winner) {
  const loser = winner === 1 ? 2 : 1;
  const wScore = state.players[winner - 1].score;
  const lScore = state.players[loser - 1].score;
  for (let i = 0; i < 40; i++) {
    const piece = document.createElement('div');
    piece.className = 'confetti-piece';
    piece.style.left = Math.random() * 100 + 'vw';
    piece.style.top = '-10px';
    piece.style.background = ['#fbbf24', '#f59e0b', '#d97706', '#fcd34d'][Math.floor(Math.random() * 4)];
    piece.style.width = (Math.random() * 10 + 6) + 'px';
    piece.style.height = (Math.random() * 10 + 6) + 'px';
    piece.style.borderRadius = Math.random() > 0.5 ? '50%' : '2px';
    piece.style.animation = 'confetti-fall ' + (Math.random() * 2 + 1.5) + 's linear ' + (Math.random() * 1) + 's forwards';
    document.body.appendChild(piece);
  }
  const overlay = document.createElement('div');
  overlay.className = 'result-overlay win';
  overlay.innerHTML = '<div class="result-text">\ud83c\udfc6 \u80dc\u5229!</div><div class="result-score">\u73a9\u5bb6 ' + winner + ' \u83b7\u80dc\uff01 (' + wScore + '\u5206 vs ' + lScore + '\u5206)</div><div class="result-buttons"><button class="btn btn-go" onclick="window.__resetGame(); this.parentElement.parentElement.remove();">\u518d\u6765\u4e00\u5c40</button></div>';
  document.body.appendChild(overlay);
  if (navigator.vibrate) navigator.vibrate([100, 50, 100, 50, 200, 100, 300]);
}

export function showRules() { document.getElementById('rulesModal').classList.add('show'); }
export function hideRules() { document.getElementById('rulesModal').classList.remove('show'); }
export function initRulesModal() {
  document.getElementById('rulesModal').addEventListener('click', function (e) { if (e.target === this) hideRules(); });
}

export function showFreezeTargetSelection(targets, onSelect) {
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay freeze-selection-overlay show';
  let html = '<div class="modal"><h2>❄️ 选择冻结目标</h2><p>选择要冻结的玩家：</p><div class="freeze-targets">';
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
      onSelect(targetIdx);
    });
  });
}
