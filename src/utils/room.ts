// ============================================================
// utils/room.ts — 邀请码生成
// ============================================================

/** 已使用的邀请码集合（内存存储，重启清空） */
const activeRoomCodes = new Set<string>();

/**
 * 生成 4 位纯数字邀请码
 */
export function generateRoomCode(): string {
  let attempts = 0;
  let code: string;

  do {
    code = String(Math.floor(1000 + Math.random() * 9000)); // 1000-9999
    attempts++;
    if (attempts > 1000) {
      throw new Error("邀请码池耗尽");
    }
  } while (activeRoomCodes.has(code));

  activeRoomCodes.add(code);
  return code;
}

/**
 * 释放邀请码（房间解散时）
 */
export function releaseRoomCode(code: string): void {
  activeRoomCodes.delete(code);
}

/**
 * 检查邀请码是否可用
 */
export function isCodeAvailable(code: string): boolean {
  return !activeRoomCodes.has(code);
}
