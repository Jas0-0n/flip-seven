// ============================================================
// server/game-engine/env-check.ts — 启动环境检查
// ============================================================
import { Room } from "./Room";

export function checkEnvironment(): { ok: boolean; errors: string[] } {
  const errors: string[] = [];

  try {
    const testRoom = new Room("ENV_CHECK", 2);
    // 使用 Map API: players.size
    if (testRoom.players.size !== 0) {
      errors.push("新房间 players 应为空");
    }

    // 测试 addPlayer 自增 ID
    const p1 = testRoom.addPlayer("test1", true);
    if (p1.id !== 0) errors.push("第一个玩家 ID 应为 0");

    const p2 = testRoom.addPlayer("test2", false);
    if (p2.id !== 1) errors.push("第二个玩家 ID 应为 1");

    const p3 = testRoom.addPlayer("test3", false);
    if (p3.id !== 2) errors.push("第三个玩家 ID 应为 2（自增）");

    // 测试 removePlayer 不重排 ID
    testRoom.removePlayer(p2.id);
    if (testRoom.getPlayer(p1.id)?.id !== 0) errors.push("removePlayer 不应重排 p1 ID");
    if (testRoom.getPlayer(p3.id)?.id !== 2) errors.push("removePlayer 不应重排 p3 ID");

    // 验证 Map.size
    if (testRoom.players.size !== 2) errors.push(`移除后 players.size 应为 2, 实际 ${testRoom.players.size}`);
  } catch (e: any) {
    errors.push(`环境检查异常: ${e.message}`);
  }

  return { ok: errors.length === 0, errors };
}
