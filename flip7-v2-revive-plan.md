# Flip 7 V2 — 复活牌实现计划

## 1. Summary
在 v2 冻结牌基础上，新增功能牌「复活」。测试阶段先加 10 张，仅修改 `flip7-v1.html`，不新建独立模块。

## 2. 规则确认（来自用户）

| 问题 | 答案 |
|------|------|
| 抵消 Bust 后手牌保留？ | ✅ 保留 |
| 抵消后切换玩家还是继续翻？ | ✅ 切换玩家 |
| 复活牌数量（测试阶段） | 10 张 |
| 一次 Bust 消耗几张复活牌？ | 1 张 |
| 手牌 7 张时还能继续翻吗？ | ❌ 不能，7 张时已停止翻牌 |

## 3. Proposed Changes

### 3.1 牌组数据（flip7-v1.html）
在 `buildDeck()` 末追加 10 张复活牌：
```
{ type: 'revive', value: 'revive', effect: 'revive', id: 'rv1' }
{ type: 'revive', value: 'revive', effect: 'revive', id: 'rv2' }
...
{ type: 'revive', value: 'revive', effect: 'revive', id: 'rv10' }
```
- 牌组总数：88 → 98 张

### 3.2 状态结构（flip7-v1.html）
无需新增状态字段。复活牌效果是**即时消费型**（翻到重复牌时自动在手牌中查找并消耗一张），不需要持久化状态。

### 3.3 翻牌流程改造（flip7-v1.html）
在 `afterFlip(card, playerIdx)` 的 Bust 判定分支中插入复活逻辑：

```
if isBust:
  // 检查手牌中是否有复活牌
  const reviveIdx = player.hand.findIndex(c => c.type === 'revive')
  if reviveIdx >= 0:
    // 有复活牌：抵消 Bust
    const revivedCard = player.hand[reviveIdx]
    player.hand.splice(reviveIdx, 1)  // 移除一张复活牌
    state.discard.push(revivedCard)    // 复活牌进弃牌堆
    state.discard.push(card)           // 刚翻开的重复牌进弃牌堆
    // 记录历史
    state.history.push({
      round: state.roundNumber,
      playerId: state.currentPlayer,
      cards: [card.value],
      score: 0,
      bust: false,
      special: false,
      flip7: false,
      revive: true,  // 新增标记
      text: 'P' + state.currentPlayer + ' 🛡️ 复活牌抵消！'
    })
    showToast('复活牌抵消了判负！')
    // 切换玩家
    switchToNextPlayer()
    state.roundNumber++
    state.state = 'waiting'
    render()
    return
  else:
    // 无复活牌：正常 Bust
    ...（原有逻辑）
```

### 3.4 计分规则（flip7-v1.html）
`calculateRoundScore` 无需修改。复活牌虽然在手牌中，但不参与计分（`type === 'revive'` 不在 number/special 分支内，自然跳过）。

### 3.5 UI 更新（flip7-v1.html）

#### 3.5.1 卡牌样式
新增 `.card-revive`：
```css
.card-revive {
  background: linear-gradient(135deg, #f472b6, #ec4899, #db2777);
  color: #831843;
  border-color: #db2777;
  box-shadow: 0 0 8px rgba(219, 39, 119, 0.5);
}
```

#### 3.5.2 卡片标签
- `cardClass(card)` 增加 `revive` 类型判断
- `miniCardHTML(card)` 增加 `'revive'` 标签文本
- `showFlipCard()` 翻牌动画标签增加 `'revive'` 分支

#### 3.5.3 历史记录高亮
- 新增 `revive` class，用于历史记录中的卡片高亮

### 3.6 PRD 更新（flip7-v1-prd.md）
- 3.2 牌组总数：88 → 98
- 3.3 节：行动牌（冻结）保留，新增 3.4 节：功能牌（复活）
- 4.2 节：翻牌规则增加复活牌处理流程
- 7.1 节：卡牌对象增加复活牌示例
- 9. 边界情况：增加复活牌相关场景

## 4. Assumptions & Decisions
- 复活牌数量：测试阶段 10 张
- 复活牌放置在手牌中，不参与重复验证
- 一次 Bust 只消耗一张复活牌
- 消耗后：重复牌 + 一张复活牌进入弃牌堆，手牌保留
- 抵消后切换玩家回合
- 手牌 7 张时不能继续翻牌，不存在"第 8 张触发复活"的情况

## 5. Verification Steps
1. 牌组总数显示为 98
2. 正常翻牌时复活牌可被翻到
3. 翻到复活牌后进入手牌，显示粉色样式
4. 手牌有复活牌时，翻到重复牌触发抵消
5. 抵消后：重复牌 + 一张复活牌进弃牌堆
6. 抵消后手牌保留其他牌
7. 抵消后切换玩家回合
8. 手牌有多张复活牌时，一次只消耗一张
9. 无复活牌时，Bust 正常判负
10. PRD 文档与实现一致

## 6. Todo List
- [ ] 3.1 牌组数据（+10 张复活牌）
- [ ] 3.3 翻牌流程改造（Bust + 复活抵消）
- [ ] 3.5 UI 更新（样式/标签/历史高亮）
- [ ] 3.6 PRD 更新
- [ ] 本地 commit（等待用户确认后再 push）
