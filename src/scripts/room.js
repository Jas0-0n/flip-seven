// ============================================================
// room.js — 房间状态管理（纯本地模拟）
// ============================================================
import { GAME_CONFIG } from './config.js';

// 房间码字符集（去掉 0/O/1/I 防混淆）
const CODE_CHARS = '0123456789';

// 房间内活跃的房间码（防止冲突）
const activeRoomCodes = new Set();

/**
 * 生成 6 位随机房间码
 * @returns {string} 房间码
 */
export function generateRoomCode() {
  let attempts = 0;
  let code;
  do {
    code = Array.from({ length: 6 }, () =>
      CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)]
    ).join('');
    attempts++;
    if (attempts > 100) {
      // 极小概率：码池耗尽，清空后重试
      activeRoomCodes.clear();
    }
  } while (activeRoomCodes.has(code));
  activeRoomCodes.add(code);
  return code;
}

/**
 * 使用自定义房间码创建房间
 * @param {string} hostNickname 房主昵称
 * @param {number} playerCount 玩家人数
 * @param {string} roomCode 自定义房间码
 * @returns {Object|null} 成功返回房间，失败返回 null
 */
export function createRoomWithCode(hostNickname, playerCount, roomCode) {
  if (!/^\d{6}$/.test(roomCode)) {
    return null;
  }
  if (activeRoomCodes.has(roomCode)) {
    return null;
  }
  activeRoomCodes.add(roomCode);
  const room = {
    roomCode: roomCode,
    hostId: 0,
    playerCount: playerCount,
    players: [{ id: 0, nickname: hostNickname, ready: true, isHost: true }],
    status: 'lobby',
    gameState: null
  };
  return room;
}

/**
 * 加入房间
 * @param {Object} room 房间对象
 * @param {string} nickname 玩家昵称
 * @returns {Object|null} 成功返回房间，失败返回 null
 */
export function joinRoom(room, nickname) {
  if (!room) return null;
  if (room.status !== 'lobby') return null;
  if (room.players.length >= room.playerCount) return null;

  const player = {
    id: room.players.length,
    nickname: nickname,
    ready: false,
    isHost: false
  };
  room.players.push(player);
  return room;
}

/**
 * 玩家准备/取消准备
 * @param {Object} room 房间对象
 * @param {number} playerId 玩家ID
 */
export function toggleReady(room, playerId) {
  const player = room.players.find(p => p.id === playerId);
  if (player && !player.isHost) {
    player.ready = !player.ready;
  }
}

/**
 * 所有非房主玩家是否都准备了
 * @param {Object} room 房间对象
 * @returns {boolean}
 */
export function allPlayersReady(room) {
  return room.players.every(p => p.isHost || p.ready);
}

/**
 * 房主转移到下一个玩家
 * @param {Object} room 房间对象
 */
export function reassignHost(room) {
  if (room.players.length === 0) return;
  room.players[0].isHost = false;
  room.players[0].ready = false;
  room.players.push(room.players.shift());
  room.players[0].isHost = true;
  room.players[0].ready = true;
}

/**
 * 离开房间
 * @param {Object} room 房间对象
 * @param {number} playerId 玩家ID
 */
export function leaveRoom(room, playerId) {
  const idx = room.players.findIndex(p => p.id === playerId);
  if (idx === -1) return;
  room.players.splice(idx, 1);
  // 重新分配 ID
  room.players.forEach((p, i) => {
    p.id = i;
    if (i === 0) {
      p.isHost = true;
      p.ready = true;
    }
  });
  if (room.players.length === 0) {
    activeRoomCodes.delete(room.roomCode);
  }
}

/**
 * 开始游戏
 * @param {Object} room 房间对象
 */
export function startGame(room) {
  room.status = 'playing';
}
