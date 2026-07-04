# Flip-7 多人联机扩展 — Planning

---

## Situation

Flip-7 是纯前端热座扑克游戏，已完成核心玩法逻辑。当前状态：

- **架构：** 纯静态页面，无后端。index.html 内嵌全局 state → game.js 处理逻辑 → ui.js 渲染
- **数据驱动：** 已提取 `config.js`（GAME_CONFIG/CARD_IMAGES/BOUNDS），牌组、动画、规则全部配置化
- **已有基础：** `playerCount` 已配置化；`render()` 已用 `forEach` 循环；`switchToNextPlayer()` / `getActivePlayers()` 已支持 N 玩家

**硬编码的 2 玩家假设：**

| 位置 | 问题 |
|---|---|
| `game.js:259` | Flip 7 被动结算：`otherIdx = playerIdx === 0 ? 1 : 0`，翻三张路径同 |
| `game.js:26` | 无人出局时先手：`currentPlayer === 1 ? 2 : 1` |
| `config.js:110` | `maxPlayerIdx: 1` 写死 |
| `index.html:21-74` | 玩家区 HTML 硬编码 `playerArea1/2`、`hand1/2`、`score1/2` |
| `CSS:180-181` | 头像颜色 `.p1/.p2` 写死 |

---

## Task

**目标：** 支持 2~4 人本地热座 → 房间系统 → 跨设备联机

**非目标：** 服务器权威逻辑、反作弊、持久化存储、账号系统、通用 API

---

## Action

### Phase 1：本地多人（~150 行改动，~3h）

| 文件 | 改变内容 |
|---|---|
| `config.js` | `playerCount: 4`，`maxPlayerIdx` → `playerCount - 1` |
| `game.js` | 修复 Flip 7 被动结算：遍历所有存活的其他玩家，逐一 `calculateRoundScore` + 弃牌 + 出局标记；修复 `startNewRound` 先手逻辑 |
| `index.html` | 玩家区改为 JS 动态生成（`playerCount` 个 `playerAreaN`），统一容器布局 |
| `ui.js` | `render()` 已兼容，确认动态引用正确；添加头像颜色 `.p1`~`.p4` |
| `CSS` | 自适应布局（flex-wrap/grid），适配 2/3/4 人数；头像颜色类 `.p1`~`.p4` |
| `data.js` | 无改动 |

### Phase 2：房间系统（~300 行，~6h）

新增 `room.js` + 大厅 UI：

```
流程：大厅页面 → [创建房间 / 加入房间] → 房间Lobby → 开始游戏 → 游戏页面
状态：{ roomCode, hostId, players[], status, gameState }
```

- 创建房间 → 生成 6 位房间码（字母+数字），冲突则重试
- 加入房间 → 输入房间码 + 昵称
- Lobby → 显示玩家列表、准备状态；房主点击开始时校验 `allPlayersReady`
- 房主断开 → `reassignHost()` 转移给下一个玩家，或自动解散房间
- 房主点击开始 → 所有设备切换到游戏页面

### Phase 3：在线联机（~400 行含 server.js，~1.5d）

**架构：Player-Host P2P over WebSocket**

- `server.js`：静态文件 + 房间管理（创建/加入/离开/房主迁移）
- 逻辑 100% 在浏览器，一个玩家当前设备做 Host，其他人发操作指令
- `network.js`：WebSocket 封装 + 自动重连

**消息协议：**
```
C→S: { type: "action", action: "flip|stop|target_selected", payload }
S→C: { type: "state_sync", state } | { type: "player_joined|left", ... }
```

### Phase 4：体验优化（按需）

- 断线保留 30s 重连窗口，超时自动 STOP（不可回滚）
- 移动端布局：竖屏优先，当前玩家高亮展示完整手牌；其他玩家折叠为头像+分数
- 房主设置可调（胜利分数、2-4 位玩家）

---

## Result

| 阶段 | 产出 | 可独立交付 |
|---|---|---|
| Phase 1 | 本地 4 人热座可用 | ✅ 可玩 |
| Phase 2 | 完整大厅+房间流程 | ✅ 封闭体验 |
| Phase 3 | 跨设备实时联机 | ✅ 上线 |
| Phase 4 | 生产级稳定性 | 优化 |

---

## 关键决策

1. **不做前后端分离**：游戏逻辑保留在浏览器，服务端仅做消息中继，game.js/data.js/ui.js 几乎不动
2. **Player-Host 模式而非权威服务器**：避免重写游戏逻辑，现有架构复用最大化
3. **全量状态同步**：状态 <2KB，简单可靠，无需增量 diff
4. **最小 WebSocket**：选原生 `ws` 库而非 Socket.io，服务端 ~100 行
