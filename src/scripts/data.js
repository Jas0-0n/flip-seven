// ============================================================
// data.js — 牌组构建 + 初始状态
// ============================================================
import { GAME_CONFIG } from './config.js';

/**
 * 根据 GAME_CONFIG 构建牌组（数据驱动）
 * @returns {Array} 卡牌数组
 */
export function buildDeck() {
  const cfg = GAME_CONFIG.deck;
  const deck = [];
  let id = 0;

  // 数字卡
  for (let v = 0; v <= cfg.numberMax; v++) {
    const count = v === 0 ? 1 : v;
    for (let i = 0; i < count; i++) {
      deck.push({ type: 'number', value: v, effect: null, id: 'n' + (id++) });
    }
  }

  // 特殊卡
  for (const sp of cfg.specials) {
    deck.push({ type: 'special', value: sp.value, effect: sp.effect, id: 'sp' + sp.value });
  }

  // 行动牌
  for (const key of Object.keys(cfg.actions)) {
    const action = cfg.actions[key];
    for (let i = 0; i < action.count; i++) {
      deck.push({ type: 'action', value: action.value, effect: action.effect, id: key[0] + 'f' + i });
    }
  }

  // 功能牌
  for (let i = 0; i < cfg.revives.count; i++) {
    deck.push({ type: 'revive', value: cfg.revives.value, effect: cfg.revives.effect, id: 'rv' + i });
  }

  return deck;
}

export function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

export function createInitialState() {
  const cfg = GAME_CONFIG;
  return {
    players: Array.from({ length: cfg.playerCount }, (_, i) => ({
      id: i + 1,
      hand: [],
      score: 0,
      roundScore: null
    })),
    currentPlayer: Math.floor(Math.random() * cfg.playerCount) + 1,
    state: 'waiting',
    deck: shuffle(buildDeck()),
    discard: [],
    roundNumber: 1,
    totalFlipsThisRound: 0,
    history: [],
    flipAnimating: false,
    playerOut: Array(cfg.playerCount).fill(false),
    firstOut: null
  };
}
