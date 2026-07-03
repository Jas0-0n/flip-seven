/**
 * Flip 7 — 核心规则纯函数模块（v1）
 *
 * 目标：把“可独立验证的规则逻辑”抽离成无副作用的纯函数，
 * 方便单测，也让原型 / 小游戏 / 后端共用同一套规则。
 */

/**
 * 生成一副新牌（78 张：12~1 按数量递减，外加 1 张 0）
 * @returns {number[]}
 */
export function buildDeck() {
  const deck = [];
  for (let v = 12; v >= 1; v--) {
    for (let i = 0; i < v; i++) deck.push(v);
  }
  deck.push(0);
  return deck;
}

/**
 * Fisher-Yates 洗牌，返回新数组
 * @param {number[]} arr
 * @returns {number[]}
 */
export function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * 初始化一局游戏状态
 * @returns {{ players: Player[], currentPlayerIndex: number, roundActivePlayer: number, roundNumber: number, state: string, unused: number[], discard: number[], lastFlipped: number | null, currentRoundHistory: (string | number)[], keepCurrentPlayerAfterSwitch: boolean }}
 */
export function createInitialState() {
  const unused = shuffle(buildDeck());
  return {
    players: [
      { id: 0, name: '玩家 A', score: 0, roundScore: 0, hand: [], lastRoundResult: '-' },
      { id: 1, name: '玩家 B', score: 0, roundScore: 0, hand: [], lastRoundResult: '-' }
    ],
    currentPlayerIndex: 0,
    roundActivePlayer: 0,
    roundNumber: 1,
    state: 'playing',
    unused,
    discard: [],
    lastFlipped: null,
    currentRoundHistory: [],
    keepCurrentPlayerAfterSwitch: false
  };
}

/**
 * 判定翻牌结果：判负 / 成功
 * @param {number[]} hand
 * @param {number} card
 * @returns {{ ok: boolean, reason?: string }}
 */
export function judgeCard(hand, card) {
  if (hand.includes(card)) {
    return { ok: false, reason: 'duplicate' };
  }
  return { ok: true };
}

/**
 * 执行翻牌后的状态变更（只操作数据，不碰 UI）
 *
 * @param {{ players: Player[], currentPlayerIndex: number, roundActivePlayer: number, roundNumber: number, state: string, unused: number[], discard: number[], lastFlipped: number | null, currentRoundHistory: (string | number)[], keepCurrentPlayerAfterSwitch: boolean }} state
 * @returns {{ state: GameState, outcome: 'continue' | 'bust' | 'flip7' } }
 */
export function applyFlip(state) {
  if (state.state !== 'playing') {
    throw new Error('Cannot flip when not playing');
  }
  if (state.currentPlayerIndex !== state.roundActivePlayer) {
    throw new Error('Not your turn');
  }

  const next = structuredClone(state);
  if (next.unused.length === 0 && next.discard.length === 0) {
    throw new Error('Deck exhausted');
  }

  // 无可用牌时，先补充
  if (next.unused.length === 0) {
    const newUnused = shuffle(next.discard);
    next.unused = newUnused;
    next.discard = [];
  }

  const card = next.unused.pop();
  next.lastFlipped = card;
  const player = next.players[next.currentPlayerIndex];
  const result = judgeCard(player.hand, card);

  if (!result.ok) {
    // 判负
    player.hand.forEach(c => next.discard.push(c));
    player.hand = [];
    player.roundScore = 0;
    next.currentRoundHistory.push('X');
    player.lastRoundResult = '0';
    next.state = 'waiting';
    next.keepCurrentPlayerAfterSwitch = false;
    return { state: next, outcome: 'bust' };
  }

  // 成功收入
  player.hand.push(card);
  player.roundScore += card;
  next.currentRoundHistory.push(card);

  // Flip 7 判定
  if (player.hand.length >= 7) {
    const bonus = 15;
    const totalRoundScore = player.roundScore + bonus;
    player.roundScore = totalRoundScore;
    player.score += totalRoundScore;
    player.hand.forEach(c => next.discard.push(c));
    player.hand = [];
    next.lastFlipped = null;
    next.currentRoundHistory.push('FLIP7');
    player.lastRoundResult = `+${totalRoundScore}`;
    next.state = 'flip7';
    next.keepCurrentPlayerAfterSwitch = true;
    return { state: next, outcome: 'flip7' };
  }

  return { state: next, outcome: 'continue' };
}

/**
 * 执行叫停
 * @param {{ players: Player[], currentPlayerIndex: number, roundActivePlayer: number, roundNumber: number, state: string, unused: number[], discard: number[], lastFlipped: number | null, currentRoundHistory: (string | number)[], keepCurrentPlayerAfterSwitch: boolean }} state
 * @returns {{ state: GameState, finished: boolean, winner: Player | null }}
 */
export function applyStop(state) {
  if (state.state !== 'playing') {
    throw new Error('Cannot stop when not playing');
  }
  if (state.currentPlayerIndex !== state.roundActivePlayer) {
    throw new Error('Not your turn');
  }

  const next = structuredClone(state);
  const player = next.players[next.currentPlayerIndex];
  const earned = player.roundScore;
  player.score += earned;
  player.hand.forEach(c => next.discard.push(c));
  player.hand = [];
  player.roundScore = 0;
  next.currentRoundHistory.push('STOP');
  player.lastRoundResult = `+${earned}`;
  next.lastFlipped = null;
  next.state = 'waiting';
  next.keepCurrentPlayerAfterSwitch = false;

  const winner = player.score >= 200 ? player : null;
  return { state: next, finished: !!winner, winner };
}

/**
 * 确认切换回合
 * @param {{ players: Player[], currentPlayerIndex: number, roundActivePlayer: number, roundNumber: number, state: string, unused: number[], discard: number[], lastFlipped: number | null, currentRoundHistory: (string | number)[], keepCurrentPlayerAfterSwitch: boolean }} state
 * @returns {{ state: GameState, switched: boolean, winner: Player | null }}
 */
export function applyConfirmSwitch(state) {
  if (state.state !== 'waiting' && state.state !== 'flip7') {
    throw new Error('Cannot confirm switch in current state');
  }

  const next = structuredClone(state);

  if (next.keepCurrentPlayerAfterSwitch) {
    // Flip 7 奖励：当前玩家继续
    next.keepCurrentPlayerAfterSwitch = false;
    next.state = 'playing';
    next.roundActivePlayer = next.currentPlayerIndex;
    next.currentRoundHistory = [];
    next.lastFlipped = null;
    const winner = next.players[next.currentPlayerIndex].score >= 200
      ? next.players[next.currentPlayerIndex]
      : null;
    return { state: next, switched: false, winner };
  }

  // 普通换人
  next.currentPlayerIndex = 1 - next.currentPlayerIndex;
  next.roundActivePlayer = next.currentPlayerIndex;
  next.roundNumber += 1;
  next.lastFlipped = null;
  next.currentRoundHistory = [];
  next.state = 'playing';
  const winner = next.players[next.currentPlayerIndex].score >= 200
    ? next.players[next.currentPlayerIndex]
    : null;
  return { state: next, switched: true, winner };
}

/**
 * 重置对局（保留玩家名称）
 * @param {{ players: Player[], currentPlayerIndex: number, roundActivePlayer: number, roundNumber: number, state: string, unused: number[], discard: number[], lastFlipped: number | null, currentRoundHistory: (string | number)[], keepCurrentPlayerAfterSwitch: boolean }} state
 * @returns {GameState}
 */
export function applyReset(state) {
  const next = createInitialState();
  next.players[0].name = state.players[0].name;
  next.players[1].name = state.players[1].name;
  return next;
}

/**
 * 自动补充牌堆（供调用方在 render / tick 前执行）
 * @param {{ unused: number[], discard: number[] } &amp; Record&lt;string, any&gt;} state
 * @returns {{ unused: number[], discard: number[] } &amp; Record&lt;string, any&gt;}
 */
export function autoRefillDeck(state) {
  if (state.unused.length === 0 && state.discard.length > 0) {
    const next = structuredClone(state);
    next.unused = shuffle(next.discard);
    next.discard = [];
    return next;
  }
  return state;
}

/**
 * 简易测试辅助：断言
 */
export function assertEqual(actual, expected, label = '') {
  const actualStr = JSON.stringify(actual);
  const expectedStr = JSON.stringify(expected);
  if (actualStr !== expectedStr) {
    throw new Error(`Assertion failed${label ? `: ${label}` : ''}\nExpected: ${expectedStr}\nActual:   ${actualStr}`);
  }
}

/**
 * 类型提示（注释形式，避免运行时开销）
 *
 * @typedef {Object} Player
 * @property {number} id
 * @property {string} name
 * @property {number} score
 * @property {number} roundScore
 * @property {number[]} hand
 * @property {string} lastRoundResult
 *
 * @typedef {'ready'|'playing'|'waiting'|'flip7'|'ended'} State
 *
 * @typedef {Object} GameState
 * @property {Player[]} players
 * @property {number} currentPlayerIndex
 * @property {number} roundActivePlayer
 * @property {number} roundNumber
 * @property {State} state
 * @property {number[]} unused
 * @property {number[]} discard
 * @property {number|null} lastFlipped
 * @property {(string|number)[]} currentRoundHistory
 * @property {boolean} keepCurrentPlayerAfterSwitch
 */
