# Flip 7 V2 — 实现计划

## 1. Summary
在 `flip7-v1.html` 已有原型基础上，实现 v2 版本，新增「行动牌：冻结」及对应 UI 交互。仅修改 `flip7-v1.html` 与 `flip7-v1-prd.md`，不新建独立模块。

## 2. Current State Analysis
- `flip7-v1.html`：自包含单文件原型，逻辑与 UI 内联
- 牌组：数字牌 79 + 功能牌 6 = 85 张
- 状态结构：players / currentPlayer / state / deck / discard / roundNumber / totalFlipsThisRound / history / flipAnimating / playerOut / firstOut
- 关键规则：Bust、Flip 7、牌堆循环、200 分胜利

## 3. Proposed Changes

### 3.1 牌组数据（flip7-v1.html）
在 `buildDeck()` 末追加 3 张冻结牌：
- `{ type: 'action', value: 'freeze', effect: 'freeze', id: 'af1' }`
- `{ type: 'action', value: 'freeze', effect: 'freeze', id: 'af2' }`
- `{ type: 'action', value: 'freeze', effect: 'freeze', id: 'af3' }`
- 牌组总数变为 88 张

### 3.2 状态扩展（flip7-v1.html）
- `createInitialState` 新增：`frozenPlayer: null | number`
  - `null`：无人被冻结
  - `2`：玩家 2 被冻结
- 每回合重置：
  - `handleGo` / `handleStop` 正常推进时不清除（由被跳过程序自动消费）
  - `startNewRound` 追加清除：`state.frozenPlayer = null`

### 3.3 翻牌流程改造（flip7-v1.html）
在 `afterFlip(card, playerIdx)` 中插入冻结分支（在结算分支之前）：

```
if card.type === 'action' && card.effect === 'freeze':
  state.discard.push(card)        // 立即进入弃牌堆
  active = getActivePlayers()
  if active.length <= 1:
    toast('冻结牌无效，仅一位玩家存活')
    state.roundNumber++; state.state = 'waiting'; render(); return
  targets = active.filter(i => i !== playerIdx)
  showFreezeTargetSelection(targets, function(targetIdx):
    state.frozenPlayer = targetIdx + 1
    toast('已冻结 P(targetIdx+1)')
    state.currentPlayer = targetIdx + 1
    state.roundNumber++; state.state = 'waiting'; render()
    // 若切换后正好落到 frozenPlayer，立刻消费冻结并跳到下一位
    // （2 人局下会经历一幕"冻结玩家被跳过"的观感）
    autoSkipFrozenIfNeeded()
  return
```

冻结牌不进入手牌、不参与 Flip 7/Bust/计分。

### 3.4 回合切换改造（flip7-v1.html）
改造 `switchToNextPlayer()`：
```
next = 下一位活跃玩家
if next === state.frozenPlayer:
  state.frozenPlayer = null   // 消耗冻结
  next = 再下一位活跃玩家
state.currentPlayer = next
```
让冻结变成“强制跳过 1 次操作”。

### 3.5 UI 新增（flip7-v1.html）
- 冻结牌样式：`action-freeze`，视觉与功能牌区分
- 冻结选择层：`showFreezeTargetSelection(targets, callback)`
  - 支持 2 人局直接高亮对手区域，点击即选择
- 状态高亮：被冻结玩家头像 / 边框加 `frozen` class
- 动画反馈：冻结时播放提示或高亮

### 3.6 PRD 更新（flip7-v1-prd.md）
- 3.3 节：行动牌（冻结）
- 牌组总数：85 → 88
- 4.2 节：翻牌规则增加冻结牌流程
- 7.1 节：卡牌对象增加行动牌示例
- 10. 项目文件表无需变更

### 3.7 Methodology 更新（flip7-methodology.html）
- **不做修改**，v2 实现是自然演进

## 4. Assumptions & Decisions
- 冻结牌数量：3 张
- 不能对自己使用
- 跳过 1 次操作，之后自动解除
- 仅剩 1 人时冻结牌失效：进入弃牌堆，玩家继续正常翻牌
- 被冻结玩家等待期间，牌堆耗尽可正常自动补牌

## 5. Verification Steps
1. `flip7-v1.html` 中牌组总数显示为 88
2. 正常翻牌时冻结牌可被翻到
3. 翻到冻结牌后弹出目标选择
4. 选择对手后，对手下一轮被跳过并回到当前玩家
5. 冻结牌不进入手牌，不参与 Flip 7 / Bust
6. 冻结结束后状态自动清除
7. 被冻结玩家区域显示冻结状态
8. 仅剩 1 人时冻结牌自动废弃且无副作用
9. 牌堆耗尽仍可正常补牌
10. 200 分胜利判定不变
11. PRD 文档与实现一致

## 6. Todo List
- [ ] 3.1 牌组数据
- [ ] 3.2 状态扩展
- [ ] 3.3 翻牌流程改造
- [ ] 3.4 回合切换改造
- [ ] 3.5 UI 新增
- [ ] 3.6 PRD 更新
- [ ] 本地 commit（等待用户确认后再 push）
