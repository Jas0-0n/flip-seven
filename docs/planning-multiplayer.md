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

### Phase 1：本地多人（~300 行，~5.5h）

| 改变项 | 文件 | 内容 | 工时 |
|---|---|---|---|
| 配置动态化 | `config.js` | `playerCount: 4`，`maxPlayerIdx` → `playerCount - 1` | 0.25h |
| 修复 2 玩家硬编码 | `game.js` | Flip 7 被动结算改为遍历所有存活玩家；`startNewRound` 先手逻辑改为动态遍历 | 1h |
| 动态生成玩家区 | `index.html` | 玩家区改为 JS 模板字符串拼接，生成 `playerCount` 个 `playerAreaN` | 1.5h |
| CSS 自适应布局 | `styles/main.css` | flex-wrap/grid 布局适配 2/3/4 人，响应式断点，头像颜色 `.p1`~`.p4` | 1.5h |
| css 样式 | `ui.js` | 确认动态引用正确，添加头像颜色类 | 0.25h |
| 集成调试 | 全文件 | 确保原有 2 人场景不破坏，回归测试 | 1h |

**关键实现细节：**

```javascript
// game.js - Flip 7 被动结算修复（原来）
otherIdx = playerIdx === 0 ? 1 : 0;

// game.js - Flip 7 被动结算修复（改后）
getActivePlayers().forEach(idx => {
  if (idx !== playerIdx) {
    calculateRoundScore(idx);
    discardHand(idx);
    state.playerOut[idx] = true;
  }
});
```

```html
<!-- index.html - 动态玩家区生成容器 -->
<div id="game-area"></div>

<!-- JS 模板 -->
function renderPlayerAreas() {
  const container = document.getElementById('game-area');
  container.innerHTML = Array.from({length: GAME_CONFIG.playerCount}, (_, i) => `
    <div class="player-area p${i+1}" id="playerArea${i+1}">
      <div class="player-info">
        <img class="avatar" src="" />
        <span class="nickname">Player ${i+1}</span>
        <span class="score" id="score${i+1}">0</span>
      </div>
      <div class="hand" id="hand${i+1}"></div>
    </div>
  `).join('');
}
```

---

### Phase 2：房间系统（~300 行，~6h）

**新增 `room.js` + 大厅 UI，单页 + 视图切换架构：**

```
index.html 结构：
├── <div id="view-lobby">    ← 大厅（创建/加入房间）
├── <div id="view-room">     ← 房间 Lobby（玩家列表、准备）
└── <div id="view-game">     ← 游戏页面（现有）
```

```javascript
// ui.js - 视图切换
function switchView(viewName) {
  document.querySelectorAll('.view').forEach(el => el.style.display = 'none');
  document.getElementById(`view-${viewName}`).style.display = 'block';
}
```

**房间状态：**
```
state: { roomCode, hostId, players[], status, gameState }
```

**核心流程：**
- 创建房间 → 生成 6 位房间码（字母+数字，去除 0/O/1/I 防混淆），`activeRooms` Set 冲突检测
- 加入房间 → 输入房间码 + 昵称
- Lobby → 显示玩家列表、准备状态；房主点击开始时校验 `allPlayersReady`
- 房主断开 → `reassignHost()` 转移给下一个玩家，或自动解散房间
- 房主点击开始 → 所有设备切换到游戏页面

**房间码生成：**
```javascript
// server.js
const activeRooms = new Set();

function generateRoomCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // 去掉 0/O/1/I
  let attempts = 0;
  let code;
  do {
    code = Array.from({length: 6}, () => chars[Math.floor(Math.random() * chars.length)]).join('');
    attempts++;
    if (attempts > 100) throw new Error('房间码池耗尽');
  } while (activeRooms.has(code));
  activeRooms.add(code);
  return code;
}

function dissolveRoom(code) {
  activeRooms.delete(code);
}
```

---

### Phase 3：在线联机（~400 行含 server.js，~1.5d）

**架构：Player-Host P2P over WebSocket**

- `server.js`：静态文件 + 房间管理（创建/加入/离开/房主迁移）
- 逻辑 100% 在浏览器，一个玩家当前设备做 Host，其他人发操作指令
- `network.js`：WebSocket 封装 + 自动重连

**牌堆同步方案：**

```
┌──────────────────────────────────────────────────┐
│                    Host 设备                       │
│  ┌─────────────────────────────────────────────┐ │
│  │ deck[]（唯一权威）                           │ │
│  │ 负责 shuffle() + deal()                      │ │
│  │ 每个 action 后广播 action + 具体牌面         │ │
│  └─────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────┘
        ↓ state_sync（全量）
┌──────────────────────────────────────────────────┐
│                   非 Host 设备                     │
│  ┌─────────────────────────────────────────────┐ │
│  │ shadow deck[]（只读，不信任本地牌堆）       │ │
│  │ 点击 flip → 发"flip 请求" → 等 Host 确认    │ │
│  │ 只做动画展示，不独立结算                     │ │
│  └─────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────┘
```

**断线重连：**

| 场景 | 行为 |
|---|---|
| 非 Host 断线重连 | 重连 → 发 `request_full_sync` → Host 回复完整 state → 直接替换 |
| Host 断线重连 | server 触发 `host_reassign` → 新 Host 生成新 deck → 广播 `host_changed` + state_sync |

**消息协议：**
```
C→S: { type: "action", action: "flip|stop|target_selected", payload }
S→C: { type: "state_sync", state } | { type: "player_joined|left", ... }
```

---

### Phase 4：体验优化（按需）

- 断线保留 30s 重连窗口，超时自动 STOP（不可回滚）
- 移动端布局：竖屏优先，当前玩家高亮展示完整手牌；其他玩家折叠为头像+分数
- 房主设置可调（胜利分数、2-4 位玩家）

---

## Result

| 阶段 | 产出 | 可独立交付 |
|---|---|---|
| Phase 1 | 本地 4 人热座可用 | ✅  playable |
| Phase 2 | 完整大厅+房间流程 | ✅ 封闭体验 |
| Phase 3 | 跨设备实时联机 | ✅ 上线 |
| Phase 4 | 生产级稳定性 | 优化 |

---

## 关键决策

1. **不做前后端分离**：游戏逻辑保留在浏览器，服务端仅做消息中继，game.js/data.js/ui.js 几乎不动
2. **Player-Host 模式而非权威服务器**：避免重写游戏逻辑，现有架构复用最大化
3. **全量状态同步**：状态 <2KB，简单可靠，无需增量 diff
4. **最小 WebSocket**：选原生 `ws` 库而非 Socket.io，服务端 ~100 行
5. **单页 + 视图切换**：复用现有 SPA 架构，三个视图（大厅/Lobby/游戏）通过 display 切换，无需路由层
6. **牌堆 Host 权威**：牌堆只存在于 Host 设备内存中，非 Host 不独立决定牌面，断线重连必须请求全量 state_sync
