// ============================================================
// utils.js — 纯函数工具集
// ============================================================
import { GAME_CONFIG, BOUNDS } from './config.js';

/**
 * 计算玩家回合得分
 * @param {Object} state - 游戏状态
 * @param {number} playerIdx - 玩家索引 (0-based)
 * @returns {number} 得分
 * @edge playerIdx 超出范围 → 返回 0
 * @edge 手牌为空 → 返回 0
 * @edge 手牌含非法卡牌 → 忽略该卡
 */
export function calculateRoundScore(state, playerIdx) {
  // 边界: 玩家索引合法性
  if (playerIdx < BOUNDS.minPlayerIdx || playerIdx > BOUNDS.maxPlayerIdx) return 0;
  if (!state.players || !state.players[playerIdx]) return 0;

  const player = state.players[playerIdx];
  if (!player.hand || player.hand.length === 0) return 0;

  let hasX2 = false;
  let sum = 0;

  for (const card of player.hand) {
    if (!card) continue; // 边界: 非法卡牌
    if (card.type === 'number') {
      sum += card.value;
    } else if (card.type === 'special') {
      if (card.effect === 'double') hasX2 = true;
      else if (typeof card.effect === 'number') sum += card.effect;
    }
  }
  return hasX2 ? sum * 2 : sum;
}

/**
 * 检查玩家是否获胜
 * @param {Object} state - 游戏状态
 * @param {number} playerIdx - 玩家索引 (0-based)
 * @returns {boolean}
 * @edge playerIdx 超出范围 → 返回 false
 */
export function checkWinner(state, playerIdx) {
  if (playerIdx < BOUNDS.minPlayerIdx || playerIdx > BOUNDS.maxPlayerIdx) return false;
  if (!state.players || !state.players[playerIdx]) return false;
  return state.players[playerIdx].score >= GAME_CONFIG.winScore;
}

/**
 * 获取存活玩家索引列表
 * @param {Object} state - 游戏状态
 * @returns {Array<number>} 存活玩家索引数组
 * @edge state.playerOut 为空 → 返回空数组
 * @edge 全部出局 → 返回空数组
 */
export function getActivePlayers(state) {
  const active = [];
  if (!state.playerOut) return active;
  for (let i = 0; i < GAME_CONFIG.playerCount; i++) {
    if (!state.playerOut[i]) active.push(i);
  }
  return active;
}

/**
 * 切换到下一个存活玩家
 * @param {Object} state - 游戏状态
 * @edge 只剩 1 人 → 不切换（直接返回）
 * @edge 当前玩家不在存活列表 → 切到第一个存活玩家
 */
export function switchToNextPlayer(state) {
  const active = getActivePlayers(state);
  if (active.length <= 1) return;

  const curIdx = state.currentPlayer - 1;
  const pos = active.indexOf(curIdx);
  // 边界: 当前玩家不在存活列表 → 从第一个开始
  if (pos === -1) {
    state.currentPlayer = active[0] + 1;
    return;
  }
  state.currentPlayer = active[(pos + 1) % active.length] + 1;
}
