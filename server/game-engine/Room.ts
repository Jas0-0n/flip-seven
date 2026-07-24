// ============================================================
// server/game-engine/Room.ts — 房间类
//
// 重要重构：players 使用 Map<number, Player> 存储，ID 自增且终身不变，
// 彻底解决 removePlayer 后 currentPlayerId / firstOutPlayerId /
// pendingBustPlayerId 因数组索引重排而失效的问题。
// ============================================================
import type { Card, Player, GameState, PendingAction, Flip3ExecutionResult, Flip3FlipRecord, StashExecRecord } from "@/types";
import { buildDeck, shuffle, refillDeck } from "@/utils/buildDeck";
import { FEATURE_FLAGS } from "@/config/featureFlags";
import {
  calculateRoundScore,
  isFlipSeven,
  isDuplicate,
  hasReviveCard,
  consumeReviveCard,
} from "@/utils/calculateScore";

const WIN_SCORE = 200;
const FLIP_SEVEN_BONUS = 15;
const MAX_PLAYER_COUNT = 4;
const MAX_FLIPTHREE_NESTING = 3;

export class Room {
  roomCode: string;
  playerCount: 2 | 3 | 4;
  /** Map<ID, Player> — ID 终身唯一，不随进出重排 */
  players: Map<number, Player> = new Map();
  /** 自增 ID 计数器 */
  private nextPlayerId = 0;
  phase: GameState["phase"] = "waiting";
  deck: Card[] = [];
  discard: Card[] = [];
  currentPlayerId: number = 0;
  roundNumber = 1;
  lastFlip: Card | null = null;
  /** 谁翻了最近那张牌（用于前端动画判断） */
  lastFlipPlayerId: number | null = null;
  /** 最近翻牌结果（用于前端区分普通/bust/flip7） */
  lastFlipResult: GameState["lastFlipResult"] = null;
  pendingAction: PendingAction | null = null;
  history: GameState["history"] = [];
  winnerId: number | null = null;
  /** 上一轮最先出局的玩家 ID（决定下一轮先手） */
  firstOutPlayerId: number | null = null;
  /** 本轮每个玩家翻到的牌 */
  private roundFlippedCards: Map<number, Card[]> = new Map();
  /** 等待客户端确认爆牌（延迟清空手牌） */
  pendingBustPlayerId: number | null = null;
  /** 断线超时定时器映射（playerId → timer） */
  disconnectTimers: Map<number, ReturnType<typeof setTimeout>> = new Map();
  /** 翻三张执行结果（用于前端动画） */
  flip3ExecutionResult: Flip3ExecutionResult | null = null;
  /** 翻三张逐张翻牌状态机 */
  flip3State: {
    actorId: number;
    targetId: number;
    layer: number;
    flipNumber: number; // 1 | 2 | 3
    stash: any[];
    flips: any[];
  } | null = null;
  /** 翻三张第3张已翻完，等待下一次 flip3_next 触发 done */
  flip3Finalizing: boolean = false;
  /** 当前 flip3 的施放者，用于完成事件保留角色信息 */
  flip3ActorId: number | null = null;
  /** flip3 暂存区等待目标选择时的可恢复上下文 */
  flip3StashContext: {
    result: Flip3ExecutionResult;
    target: Player;
    layer: number;
    index: number;
    action: "freeze" | "revive" | "flipthree";
  } | null = null;
  /** 玩家完成暂存区选择后，等待 socket 广播完成事件 */
  flip3DonePendingBroadcast = false;
  createdAt = Date.now();
  updatedAt = Date.now();

  constructor(roomCode: string, playerCount: 2 | 3 | 4) {
    this.roomCode = roomCode;
    this.playerCount = playerCount;
  }

  // ── 玩家管理 ──

  /** 获取下一个自增 ID 并分配 */
  private allocateId(): number {
    return this.nextPlayerId++;
  }

  addPlayer(nickname: string, isHost: boolean): Player {
    const id = this.allocateId();
    const player: Player = {
      id,
      nickname,
      hand: [],
      score: 0,
      isHost,
      isReady: isHost, // 房主自动准备
      isConnected: true,
      disconnectedAt: null,
      hasBusted: false,
      endReason: null,
      isOut: false,
      skipped: false,
    };
    this.players.set(id, player);
    return player;
  }

  /**
   * 移除玩家（ID 不变、其他玩家 ID 不变）。
   * 清除该玩家的断线超时定时器，避免重连后误标 skip。
   */
  removePlayer(id: number): void {
    this.players.delete(id);
    // 清除断线定时器
    const timer = this.disconnectTimers.get(id);
    if (timer) {
      clearTimeout(timer);
      this.disconnectTimers.delete(id);
    }
    // 清理 pendingBustPlayerId 引用
    if (this.pendingBustPlayerId === id) {
      this.pendingBustPlayerId = null;
    }
    // 清理 firstOutPlayerId 引用（如果离开的是上一轮最先出局的玩家）
    if (this.firstOutPlayerId === id) {
      this.firstOutPlayerId = null;
    }
    // 如果当前操作玩家离开，顺延到下一个可用玩家（不重排）
    if (this.currentPlayerId === id) {
      this.advanceToNextActive();
    }
  }

  /** 房间是否已空 */
  isEmpty(): boolean {
    return this.players.size === 0;
  }

  getPlayer(id: number): Player | undefined {
    return this.players.get(id);
  }

  getHost(): Player | null {
    for (const p of this.players.values()) {
      if (p.isHost) return p;
    }
    return null;
  }

  getAllReady(): boolean {
    if (this.players.size === 0) return false;
    for (const p of this.players.values()) {
      if (!p.isReady) return false;
    }
    return true;
  }

  getActivePlayers(): Player[] {
    const result: Player[] = [];
    for (const p of this.players.values()) {
      if (!p.isOut && !p.skipped) result.push(p);
    }
    return result;
  }

  /** 按 sorted id 迭代所有玩家（用于保持确定性顺序） */
  forEachPlayer(fn: (player: Player) => void): void {
    const ids = Array.from(this.players.keys()).sort((a, b) => a - b);
    for (const id of ids) {
      const p = this.players.get(id);
      if (p) fn(p);
    }
  }

  // ── 游戏控制 ──

  initGame(): void {
    this.deck = shuffle(buildDeck());
    this.discard = [];
    this.roundNumber = 1;
    this.currentPlayerId = 0;
    this.winnerId = null;
    this.phase = "playing";
    this.firstOutPlayerId = null;
    this.roundFlippedCards.clear();
    this.pendingBustPlayerId = null;
    this.lastFlip = null;
    this.lastFlipPlayerId = null;
    this.lastFlipResult = null;

    for (const player of this.players.values()) {
      player.hand = [];
      player.score = 0;
      player.hasBusted = false;
      player.endReason = null;
      player.isOut = false;
    }
  }

  /** 翻牌 */
  flip(currentPlayerId: Card | number): {
    success: boolean;
    result: "continue" | "bust" | "flip7" | "pending_action";
    card?: Card;
    message: string;
  } {
    // 如果牌堆为空，从弃牌堆补充
    if (this.deck.length === 0 && this.discard.length > 0) {
      this.deck = refillDeck(this.discard);
      this.discard = [];
    }

    // 牌堆和弃牌堆都空（所有牌在玩家手里）→ 强制结算所有玩家再开始新一轮
    if (this.deck.length === 0) {
      for (const player of this.players.values()) {
        if (!player.isOut && player.hand.length > 0) {
          const score = calculateRoundScore(player.hand);
          player.score += score;
          player.endReason = "deck_end";
          player.isOut = true;
          if (this.firstOutPlayerId === null) this.firstOutPlayerId = player.id;
          const flippedCards = this.roundFlippedCards.get(player.id) ?? [];
          this.discard.push(...player.hand);
          this.history.push({
            round: this.roundNumber,
            playerId: player.id,
            actions: ["stop"],
            scoreGained: score,
            isBust: false,
            isFlip7: false,
            isRevive: false,
            triggerCard: undefined,
            flippedCards: [...flippedCards],
          });
          player.hand = [];
        } else if (player.hand.length > 0) {
          this.discard.push(...player.hand);
          player.hand = [];
        }
      }
      this.deck = refillDeck(this.discard);
      this.discard = [];
      this.startNewRound();
      if (this.deck.length === 0) {
        return { success: false, result: "continue", message: "牌堆已空" };
      }
    }

    const card = this.deck.pop()!;
    this.lastFlip = card;

    if (this.deck.length === 0 && this.discard.length > 0) {
      this.deck = refillDeck(this.discard);
      this.discard = [];
    }

    const player = this.players.get(this.currentPlayerId);
    if (!player) {
      return { success: false, result: "continue", message: "当前玩家不存在" };
    }

    // 记录翻牌来源
    this.lastFlipPlayerId = player.id;

    if (!this.roundFlippedCards.has(player.id)) {
      this.roundFlippedCards.set(player.id, []);
    }
    this.roundFlippedCards.get(player.id)!.push(card);

    // 数字牌：检查重复
    if (card.type === "number" && isDuplicate(card, player.hand)) {
      if (hasReviveCard(player.hand)) {
        const { newHand, consumed } = consumeReviveCard(player.hand);
        player.hand = newHand;
        if (consumed) this.discard.push(consumed);
        this.discard.push(card);
        this.lastFlipResult = "continue";
        this.nextPlayer();
        return { success: true, result: "continue", card, message: `${player.nickname} 使用复活牌抵消！` };
      }
      player.hasBusted = true;
      player.endReason = "bust";
      player.isOut = true;
      this.pendingBustPlayerId = player.id;
      if (this.firstOutPlayerId === null) {
        this.firstOutPlayerId = player.id;
      }
      const flippedCards = this.roundFlippedCards.get(player.id) ?? [];
      this.history.push({
        round: this.roundNumber,
        playerId: player.id,
        actions: ["bust"],
        scoreGained: 0,
        isBust: true,
        isFlip7: false,
        isRevive: false,
        triggerCard: card,
        flippedCards: [...flippedCards],
      });
      this.lastFlipResult = "bust";
      return { success: true, result: "bust", card, message: `${player.nickname} 判负！` };
    }

    // 复活牌
    if (card.type === "revive") {
      const alreadyHasRevive = player.hand.some((c) => c.type === "revive");
      if (alreadyHasRevive) {
        const validTargets = [];
        for (const p of this.players.values()) {
          if (
            p.id !== player.id &&
            !p.isOut &&
            !p.skipped &&
            !p.hand.some((c) => c.type === "revive")
          ) {
            validTargets.push(p);
          }
        }
        if (validTargets.length > 0) {
          this.discard.push(card);
          this.pendingAction = { type: "revive", actorId: player.id, targetId: null };
          this.lastFlipResult = "pending_action";
          return { success: true, result: "pending_action", card, message: `${player.nickname} 已有复活牌，请选择一名玩家送出` };
        }
        this.discard.push(card);
        this.lastFlipResult = "continue";
        this.nextPlayer();
        return { success: true, result: "continue", card, message: `${player.nickname} 的复活牌进入弃牌堆` };
      }
      player.hand.push(card);
      this.lastFlipResult = "continue";
      this.nextPlayer();
      return { success: true, result: "continue", card, message: `${player.nickname} 获得复活牌` };
    }

    // 行动牌（冻结/翻三张）：需要选择目标
    if (card.type === "freeze" || card.type === "flipthree") {
      const otherPlayers = [];
      for (const p of this.players.values()) {
        if (p.id !== player.id && !p.isOut && !p.skipped) {
          otherPlayers.push(p);
        }
      }
      if (otherPlayers.length === 0) {
        const score = calculateRoundScore(player.hand);
        player.score += score;
        const flippedCards = this.roundFlippedCards.get(player.id) ?? [];
        if (flippedCards.length > 0) this.discard.push(...flippedCards);
        this.discard.push(...player.hand);
        player.hand = [];
        player.isOut = true;
        this.history.push({
          round: this.roundNumber,
          playerId: player.id,
          actions: ["stop"],
          scoreGained: score,
          isBust: false,
          isFlip7: false,
          isRevive: false,
          triggerCard: card,
          flippedCards: [...flippedCards],
        });
        this.checkWin(player.id);
        this.lastFlipResult = "continue";
        this.nextPlayer();
        return {
          success: true,
          result: "continue",
          card,
          message: `${player.nickname} 的${card.type === "freeze" ? "冻结牌" : "翻三张"}因无目标可用，直接结算 ${score} 分`,
        };
      }
      player.hand.push(card);
      this.pendingAction = { type: card.type, actorId: player.id, targetId: null };
      this.lastFlipResult = "pending_action";
      return { success: true, result: "pending_action", card, message: "请选择目标玩家" };
    }

    // 其他牌直接加入手牌
    player.hand.push(card);

    // 检查 Flip 7
    if (isFlipSeven(player.hand)) {
      const triggerPlayer = player;
      for (const p of this.players.values()) {
        if (p.id !== triggerPlayer.id && !p.isOut && p.hand.length > 0) {
          const score = calculateRoundScore(p.hand);
          p.score += score;
          p.endReason = "deck_end";
          p.isOut = true;
          if (this.firstOutPlayerId === null) this.firstOutPlayerId = p.id;
          const pFlippedCards = this.roundFlippedCards.get(p.id) ?? [];
          if (pFlippedCards.length > 0) this.discard.push(...pFlippedCards);
          this.discard.push(...p.hand);
          p.hand = [];
          this.history.push({
            round: this.roundNumber,
            playerId: p.id,
            actions: ["stop"],
            scoreGained: score,
            isBust: false,
            isFlip7: false,
            scoredByFlip7: true,
            isRevive: false,
            triggerCard: undefined,
            flippedCards: [...pFlippedCards],
          });
        }
      }
      const triggerScore = calculateRoundScore(triggerPlayer.hand);
      const triggerFlippedCards = this.roundFlippedCards.get(triggerPlayer.id) ?? [];
      if (triggerFlippedCards.length > 0) this.discard.push(...triggerFlippedCards);
      this.discard.push(...triggerPlayer.hand);
      triggerPlayer.hand = [];
      triggerPlayer.isOut = true;
      if (this.firstOutPlayerId === null) this.firstOutPlayerId = triggerPlayer.id;
      this.history.push({
        round: this.roundNumber,
        playerId: triggerPlayer.id,
        actions: ["flip7"],
        scoreGained: triggerScore + FLIP_SEVEN_BONUS,
        isBust: false,
        isFlip7: true,
        isRevive: false,
        triggerCard: card,
        flippedCards: [...triggerFlippedCards],
      });
      triggerPlayer.score += triggerScore + FLIP_SEVEN_BONUS;
      this.checkWin(triggerPlayer.id);
      this.lastFlipResult = "flip7";
      this.nextPlayer();
      return {
        success: true,
        result: "flip7",
        card,
        message: `${triggerPlayer.nickname} 七连翻！所有玩家得分，额外 +${FLIP_SEVEN_BONUS} 奖励`,
      };
    }

    this.lastFlipResult = "continue";
    this.nextPlayer();
    return { success: true, result: "continue", card, message: "" };
  }

  /** STOP */
  stop(): { score: number; playerId: number } {
    const player = this.players.get(this.currentPlayerId);
    if (!player || player.isOut) return { score: 0, playerId: this.currentPlayerId };

    const score = calculateRoundScore(player.hand);
    player.score += score;
    player.endReason = "stop";
    player.isOut = true;
    if (this.firstOutPlayerId === null) {
      this.firstOutPlayerId = player.id;
    }
    const flippedCards = this.roundFlippedCards.get(player.id) ?? [];
    this.discard.push(...player.hand);
    player.hand = [];

    this.history.push({
      round: this.roundNumber,
      playerId: player.id,
      actions: ["stop"],
      scoreGained: score,
      isBust: false,
      isFlip7: false,
      isRevive: false,
      flippedCards: [...flippedCards],
    });

    this.checkWin(player.id);
    // 自动切换到下一个活跃玩家（如果游戏未结束）
    if (this.phase === "playing") {
      this.nextPlayer();
    }
    return { score, playerId: player.id };
  }

  /** 选择冻结/翻三张/复活目标 */
  selectTarget(targetId: number, actorId?: number): { success: boolean; message: string } {
    if (!this.pendingAction) return { success: false, message: "没有待决策动作" };
    if (actorId !== undefined && this.pendingAction.actorId !== actorId) {
      return { success: false, message: "不能操作其他玩家的行动" };
    }
    if (actorId !== undefined && this.currentPlayerId !== actorId) {
      return { success: false, message: "还没轮到该玩家" };
    }
    const target = this.players.get(targetId);
    if (!target) return { success: false, message: "目标不存在" };
    // 普通 freeze/revive 不能选自己；flip3 暂存区会在下面按上下文单独校验。
    if (!this.flip3StashContext &&
        (this.pendingAction.type === "freeze" || this.pendingAction.type === "revive") &&
        target.id === this.pendingAction.actorId) {
      return { success: false, message: "不能选择自己" };
    }
    if (target.isOut) return { success: false, message: "目标已出局" };
    if (target.skipped) return { success: false, message: "目标已跳过" };

    const actor = this.players.get(this.pendingAction.actorId);
    if (!actor) return { success: false, message: "行动者不存在" };

    // flip3 暂存区的功能牌：选择目标后恢复暂存区执行，不能走普通回合结算。
    if (this.flip3StashContext) {
      const context = this.flip3StashContext;
      if (context.action === "revive" && target.hand.some(c => c.type === "revive")) {
        return { success: false, message: "该玩家已有复活牌" };
      }
      if (context.action !== "flipthree" && target.id === context.result.targetId) {
        return { success: false, message: "不能选择自己" };
      }
      this.pendingAction = null;
      this.flip3StashContext = null;
      const stashCard = context.result.stash[context.index];
      const execRec: StashExecRecord = { card: stashCard, action: "scored" };
      if (context.action === "freeze") {
        const score = calculateRoundScore(target.hand);
        target.score += score;
        target.endReason = "freeze";
        target.isOut = true;
        if (this.firstOutPlayerId === null) this.firstOutPlayerId = target.id;
        this.discard.push(...target.hand);
        target.hand = [];
        this.history.push({ round: this.roundNumber, playerId: target.id, actions: ["freeze"], scoreGained: score, isBust: false, isFlip7: false, isRevive: false, triggerCard: stashCard, flippedCards: [] });
        this.checkWin(target.id);
        execRec.action = "freeze";
        execRec.freezeTargetId = target.id;
      } else if (context.action === "revive") {
        target.hand.push(stashCard);
        execRec.action = "revive_transferred";
        execRec.reviveTargetId = target.id;
      } else {
        execRec.action = "flip3_nested";
        // 嵌套 flip3 必须使用玩家刚刚选择的目标执行；不要在暂存区里自动挑选目标。
        execRec.nestedResult = this.executeFlip3Sequence(target.id, context.layer + 1);
        context.result.stashExecuted.push(execRec);
        // 嵌套 flip3 自己的暂存区可能继续产生 pendingAction。
        // 此时必须暂停上层结算，不能过早 nextPlayer 或覆盖 pendingAction。
        if (this.flip3StashContext && this.pendingAction) {
          return { success: true, message: "嵌套翻三张等待选择目标" };
        }
      }
      if (context.action !== "flipthree") context.result.stashExecuted.push(execRec);
      const completed = context.result.busted || context.result.flip7Triggered || this.executeStash(context.result, context.target, context.layer, context.index + 1);
      this.flip3DonePendingBroadcast = completed;
      if (completed) {
        this.flip3ExecutionResult = context.result;
        this.history.push({
          round: this.roundNumber,
          playerId: context.result.targetId,
          actions: ["flipthree"],
          scoreGained: 0,
          isBust: context.result.busted,
          isFlip7: context.result.flip7Triggered,
          isRevive: false,
          triggerCard: context.result.flips[0]?.card,
          flippedCards: context.result.flips.map((f: any) => f.card),
        });
        if (this.phase === "playing") this.nextPlayer();
      }
      return { success: true, message: completed ? "翻三张暂存区执行完成" : "已选择目标，继续执行翻三张" };
    }

    this.pendingAction.targetId = targetId;

    // 复活牌：送给目标玩家
    if (this.pendingAction.type === "revive") {
      if (target.hand.some((c) => c.type === "revive")) {
        return { success: false, message: "该玩家已有复活牌" };
      }
      target.hand.push({ type: "revive", value: "revive", effect: "revive", id: `rv_gift_${Date.now()}` });
      this.pendingAction = null;
      this.checkWin(target.id);
      if (this.phase === "playing") {
        this.nextPlayer();
      }
      return { success: true, message: `${actor.nickname} 将复活牌送给了 ${target.nickname}` };
    }

    if (this.pendingAction.type === "freeze") {
      const flippedCards = this.roundFlippedCards.get(target.id) ?? [];
      const score = calculateRoundScore(target.hand);
      target.score += score;
      target.endReason = "freeze";
      target.isOut = true;
      if (this.firstOutPlayerId === null) this.firstOutPlayerId = target.id;
      if (flippedCards.length > 0) this.discard.push(...flippedCards);
      this.discard.push(...target.hand);
      target.hand = [];
      this.history.push({
        round: this.roundNumber,
        playerId: target.id,
        actions: ["freeze"],
        scoreGained: score,
        isBust: false,
        isFlip7: false,
        isRevive: false,
        triggerCard: { type: "freeze", value: "freeze", effect: "freeze", id: `freeze_${this.pendingAction.actorId}` },
        flippedCards: [...flippedCards],
      });
      const consumedFreezeCards = actor.hand.filter((c) => c.type === "freeze");
      actor.hand = actor.hand.filter((c) => c.type !== "freeze");
      this.discard.push(
        ...consumedFreezeCards.map((c) => ({ ...c, id: `${c.id}_consumed` }))
      );
      this.pendingAction = null;
      this.checkWin(target.id);

      // 冻结会立即结束当前行动者的回合，切换到下一位活跃玩家
      if (this.phase === "playing") {
        this.nextPlayer();
      }

      return { success: true, message: `${target.nickname} 被冻结！结算 ${score} 分` };
    }

    // 翻三张牌：只翻第1张，然后进入逐张状态机
    if (this.pendingAction.type === "flipthree") {
      // 消耗 actor 手中的 flip3 牌
      actor.hand = actor.hand.filter((c) => c.type !== "flipthree");
      
      // 初始化逐张翻牌状态机
      this.flip3ActorId = actor.id;
      // flip3 已经进入自动状态机：不再把上一张普通功能牌的
      // pending_action 结果暴露给前端，避免中途再次显示目标选择。
      this.lastFlipResult = null;
      this.flip3Finalizing = false;
      this.flip3ExecutionResult = null;
      this.flip3State = {
        actorId: actor.id,
        targetId: target.id,
        layer: 1,
        flipNumber: 1,
        stash: [],
        flips: []
      };
      this.pendingAction = null;
      
      // 翻第1张
      const flipResult = this.flip3FlipOne(target.id, this.flip3State);
      console.log(`[游戏] ${actor.nickname}对${target.nickname}使用翻三张`);

      // 如果第 1 张就爆牌或触发 flip7，立即结束整个 flip3 序列
      if (flipResult.busted || flipResult.flip7Triggered) {
        this.flip3ExecutionResult = {
          targetId: this.flip3State.targetId,
          layer: this.flip3State.layer,
          flips: this.flip3State.flips,
          stash: this.flip3State.stash,
          stashExecuted: [],
          busted: flipResult.busted || false,
          flip7Triggered: flipResult.flip7Triggered || false,
          flipsDone: this.flip3State.flips.length
        };
        this.flip3State = null;
        
        // 记录历史
        this.history.push({
          round: this.roundNumber,
          playerId: target.id,
          actions: ["flipthree"],
          scoreGained: 0,
          isBust: flipResult.busted || false,
          isFlip7: flipResult.flip7Triggered || false,
          isRevive: false,
          triggerCard: this.flip3ExecutionResult.flips[0]?.card,
          flippedCards: this.flip3ExecutionResult.flips.map((f: any) => f.card),
        });
        
        // 切换下一玩家
        if (this.phase === "playing") {
          this.nextPlayer();
        }
        
        // 返回标志，表示 flip3 序列已在此结束（不需要再调用 flip3_next）
        return { 
          success: true, 
          message: `${target.nickname} 翻三张${flipResult.busted ? "爆牌！" : "七连翻！"}`,
          flip3Ended: true,
          flipResult 
        };
      }
      
      // 翻牌序列继续，返回第1张结果，供 handlers.ts 发 flip3_flip_result 消息
      return { 
        success: true, 
        message: `${target.nickname} 翻第1张牌`, 
        flip3Ended: false,
        flipResult 
      };
    }

    return { success: false, message: `未知的 pendingAction type: ${(this.pendingAction as { type: string }).type}` };
  }

  // ── 翻三张序列执行（逐张翻牌版本）──

  /**
   * 翻三张中的单张牌
   * @param targetId 目标玩家 ID
   * @param state 当前翻三张状态
   * @returns 单张翻牌结果
   */
  private flip3FlipOne(
    targetId: number, 
    state: { actorId: number; targetId: number; layer: number; flipNumber: number; stash: any[]; flips: any[] }
  ): { card: any; result: "continue" | "bust" | "flip7"; busted?: boolean; flip7Triggered?: boolean } {
    const target = this.players.get(targetId);
    if (!target) {
      return { card: null, result: "bust", busted: true };
    }

    // 确保牌堆有牌
    if (this.deck.length === 0) {
      if (this.discard.length > 0) {
        this.deck = refillDeck(this.discard);
        this.discard = [];
      } else {
        return { card: null, result: "bust", busted: true };
      }
    }

    const card = this.deck.pop()!;
    this.lastFlip = card;
    this.lastFlipPlayerId = target.id;
    // flip3 的每一张牌都属于内部自动流程，不产生普通翻牌的
    // pending_action/bust 确认状态，避免 state_sync 触发普通交互 UI。
    this.lastFlipResult = null;
    this.pendingAction = null;
    this.pendingBustPlayerId = null;

    let result: "continue" | "bust" | "flip7" = "continue";
    let busted = false;
    let flip7Triggered = false;

    const flipRec: any = {
      card,
      action: "entered_hand",
      busted: false,
      triggerFlip7: false,
    };

    if (card.type === "number") {
      if (isDuplicate(card, target.hand)) {
        // 检查暂存区 revive
        const stashReviveIdx = state.stash.findIndex(c => c.type === "revive");
        if (stashReviveIdx !== -1) {
          // 消耗暂存 revive
          const reviveCard = state.stash[stashReviveIdx];
          state.stash.splice(stashReviveIdx, 1);
          this.discard.push(card);
          flipRec.action = "bust_saved";
          state.flips.push(flipRec);
          result = "continue";
        }
        // 检查手牌 revive
        else if (hasReviveCard(target.hand)) {
          const { newHand, consumed } = consumeReviveCard(target.hand);
          target.hand = newHand;
          if (consumed) this.discard.push(consumed);
          this.discard.push(card);
          flipRec.action = "bust_saved";
          state.flips.push(flipRec);
          result = "continue";
        }
        // 无可救药 -> BUST
        else {
          target.hasBusted = true;
        target.endReason = "bust";
        target.isOut = true;
        this.discard.push(...target.hand);
        target.hand = [];
          if (this.firstOutPlayerId === null) this.firstOutPlayerId = target.id;
          flipRec.action = "bust";
          flipRec.busted = true;
          busted = true;
          state.flips.push(flipRec);
          result = "bust";
          // 暂存区全部进弃牌堆
          for (const sc of state.stash) this.discard.push(sc);
          state.stash = [];
        }
      }
      else {
        // 不重复数字 → 入手牌
        target.hand.push(card);
        flipRec.action = "entered_hand";
        state.flips.push(flipRec);
        result = "continue";
        // 检查 Flip 7
        if (isFlipSeven(target.hand)) {
          flipRec.triggerFlip7 = true;
          flip7Triggered = true;
          result = "flip7";
          // 清除暂存区
          for (const sc of state.stash) this.discard.push(sc);
          state.stash = [];
          // 执行 Flip 7 结算
          this.executeFlip7(target);
        }
      }
    }
    else {
      // 非数字牌：进入暂存区
      state.stash.push(card);
      flipRec.action = "stashed";
      state.flips.push(flipRec);
      result = "continue";
    }

    return { card, result, busted, flip7Triggered };
  }

  /** 翻三张序列：由服务端推进，返回本次应广播的事件列表。 */
  advanceFlip3(actorId?: number): Array<{
    type: "flip_result" | "done";
    payload: any;
  }> {
    const events: Array<{ type: "flip_result" | "done"; payload: any }> = [];
    let guard = 0;
    while (guard++ < 8 && (this.flip3State || this.flip3Finalizing)) {
      const result = this.flip3Next(actorId);
      if (!result) break;
      events.push(result);
      if (result.type === "done") break;
    }
    return events;
  }

  /** 翻三张的下一张（保留给旧客户端/单步测试；新协议使用 advanceFlip3）
   * @returns 结果，供 handlers.ts 发 flip3_flip_result 或 flipthree_done
   */
  flip3Next(actorId?: number): {
    type: "flip_result";
    payload: { targetId: number; flipNumber: 1 | 2 | 3; card: any; result: "continue" | "bust" | "flip7"; busted?: boolean; flip7Triggered?: boolean };
  } | {
    type: "done";
    payload: { targetId: number; byPlayer: number; executionResult: any };
  } | null {
    // ── 检查是否在 finalizing 状态（第3张已翻完，等待执行 stash + done）──
    if (this.flip3Finalizing) {
      const finalResult = this.flip3ExecutionResult;
      if (actorId !== undefined && finalResult?.targetId !== actorId) return null;
      this.flip3Finalizing = false;
      if (finalResult) {
        const actor = this.players.get(finalResult.targetId);
        const stashCompleted = actor
          ? this.executeStash(finalResult, actor, finalResult.layer || 1)
          : true;
        // 暂存区遇到 freeze/revive/嵌套 flip3 时暂停，等待施放者选择目标。
        if (!stashCompleted) {
          return null;
        }
        // 记录历史
        this.history.push({
          round: this.roundNumber,
          playerId: finalResult.targetId,
          actions: ["flipthree"],
          scoreGained: 0,
          isBust: finalResult.busted,
          isFlip7: finalResult.flip7Triggered,
          isRevive: false,
          triggerCard: finalResult.flips[0]?.card,
          flippedCards: finalResult.flips.map((f: any) => f.card),
        });
        // 切换下一玩家
        if (this.phase === "playing") {
          this.nextPlayer();
        }
      }
      console.log(`[翻三张] 完成: busted=${finalResult?.busted || false}, flip7=${finalResult?.flip7Triggered || false}, flipsDone=${finalResult?.flips.length || 0}`);
      return {
        type: "done",
        payload: {
          targetId: finalResult?.targetId ?? 0,
          byPlayer: this.flip3ActorId ?? 0,
          executionResult: finalResult
        }
      };
    }

    if (!this.flip3State) {
      return null;
    }

    const state = this.flip3State;
    if (actorId !== undefined && state.targetId !== actorId) return null;
    const targetPlayerId = state.targetId;
    const actor = this.players.get(targetPlayerId);

    // 如果 actor 已出局，直接结束
    if (!actor) {
      this.flip3ExecutionResult = {
        targetId: state.targetId,
        layer: state.layer,
        flips: state.flips,
        stash: state.stash,
        stashExecuted: [],
        busted: true,
        flip7Triggered: false,
        flipsDone: state.flips.length
      };
      this.flip3State = null;
      this.history.push({
        round: this.roundNumber,
        playerId: state.targetId,
        actions: ["flipthree"],
        scoreGained: 0,
        isBust: true,
        isFlip7: false,
        isRevive: false,
        triggerCard: state.flips[0]?.card,
        flippedCards: state.flips.map((f: any) => f.card),
      });
      if (this.phase === "playing") this.nextPlayer();
      console.log(`[翻三张] 完成: busted=true, flipsDone=${state.flips.length}`);
      return {
        type: "done",
        payload: { targetId: state.targetId, byPlayer: this.flip3ActorId ?? 0, executionResult: this.flip3ExecutionResult }
      };
    }

    // 翻下一张
    state.flipNumber++;
    const flipResult = this.flip3FlipOne(state.targetId, state);

    // 爆牌或触发7 → 立即结束
    if (flipResult.busted || flipResult.flip7Triggered) {
      this.flip3ExecutionResult = {
        targetId: state.targetId,
        layer: state.layer,
        flips: state.flips,
        stash: state.stash,
        stashExecuted: [],
        busted: flipResult.busted || false,
        flip7Triggered: flipResult.flip7Triggered || false,
        flipsDone: state.flips.length
      };
      this.flip3State = null;
      this.history.push({
        round: this.roundNumber,
        playerId: state.targetId,
        actions: ["flipthree"],
        scoreGained: 0,
        isBust: flipResult.busted || false,
        isFlip7: flipResult.flip7Triggered || false,
        isRevive: false,
        triggerCard: state.flips[0]?.card,
        flippedCards: state.flips.map((f: any) => f.card),
      });
      if (this.phase === "playing") this.nextPlayer();
      console.log(`[翻三张] 完成: busted=${flipResult.busted || false}, flip7=${flipResult.flip7Triggered || false}, flipsDone=${state.flips.length}`);
      return {
        type: "done",
        payload: { targetId: state.targetId, byPlayer: this.flip3ActorId ?? 0, executionResult: this.flip3ExecutionResult }
      };
    }

    // 第3张翻完（没爆牌没触发7）→ 先返回 flip_result，标记 finalizing
    if (state.flipNumber >= 3) {
      this.flip3ExecutionResult = {
        targetId: state.targetId,
        layer: state.layer,
        flips: state.flips,
        stash: state.stash,
        stashExecuted: [],
        busted: false,
        flip7Triggered: false,
        flipsDone: state.flips.length
      };
      this.flip3Finalizing = true;
      this.flip3State = null;
      return {
        type: "flip_result",
        payload: {
          targetId: state.targetId,
          flipNumber: state.flipNumber as 1 | 2 | 3,
          card: flipResult.card,
          result: "continue",
          busted: false,
          flip7Triggered: false
        }
      };
    }

    // 继续翻下一张
    return {
      type: "flip_result",
      payload: {
        targetId: state.targetId,
        flipNumber: state.flipNumber as 1 | 2 | 3,
        card: flipResult.card,
        result: flipResult.result,
        busted: flipResult.busted,
        flip7Triggered: flipResult.flip7Triggered
      }
    };
  }

  /**
   * 执行翻三张序列（可递归嵌套）—— 保留供暂存区执行嵌套 flip3 使用
   * @param targetId 目标玩家 ID
   * @param layer 当前层数（1-based）
   * @returns 执行结果
   */
  private executeFlip3Sequence(targetId: number, layer: number): Flip3ExecutionResult {
    const result: Flip3ExecutionResult = {
      targetId,
      layer,
      flips: [],
      stash: [],
      stashExecuted: [],
      busted: false,
      flip7Triggered: false,
      flipsDone: 0,
    };

    const target = this.players.get(targetId);
    if (!target) { result.busted = true; return result; }

    for (let k = 1; k <= 3; k++) {
      // 确保牌堆有牌
      if (this.deck.length === 0) {
        if (this.discard.length > 0) {
          this.deck = refillDeck(this.discard);
          this.discard = [];
        } else {
          // 无牌可翻 -> 强制结束
          result.busted = true;
          break;
        }
      }

      const card = this.deck.pop()!;
      this.lastFlip = card;
      this.lastFlipPlayerId = target.id;

      const flipRec: Flip3FlipRecord = {
        card,
        action: "entered_hand",
        busted: false,
        triggerFlip7: false,
      };

      if (card.type === "number") {
        if (isDuplicate(card, target.hand)) {
          // 检查暂存区 revive（D2：暂存 revive 可救爆牌）
          const stashReviveIdx = result.stash.findIndex(c => c.type === "revive");
          if (stashReviveIdx !== -1) {
            // 消耗暂存 revive
            result.stash.splice(stashReviveIdx, 1);
            this.discard.push(card);
            flipRec.action = "bust_saved";
            result.flips.push(flipRec);
            continue;
          }
          // 检查手牌 revive
          if (hasReviveCard(target.hand)) {
            const { newHand, consumed } = consumeReviveCard(target.hand);
            target.hand = newHand;
            if (consumed) this.discard.push(consumed);
            this.discard.push(card);
            flipRec.action = "bust_saved";
            result.flips.push(flipRec);
            continue;
          }
          // 无可救药 -> BUST
          target.hasBusted = true;
          target.endReason = "bust";
          target.isOut = true;
          // 翻三张爆牌直接清空手牌（同步流程，无需等待客户端确认）
          this.discard.push(...target.hand);
          target.hand = [];
          if (this.firstOutPlayerId === null) this.firstOutPlayerId = target.id;
          flipRec.action = "bust";
          flipRec.busted = true;
          result.busted = true;
          result.flips.push(flipRec);
          result.flipsDone = k;
          // 暂存区全部进弃牌堆
          for (const sc of result.stash) this.discard.push(sc);
          result.stash = [];
          break;
        }
        // 不重复数字 -> 入手牌
        target.hand.push(card);
        flipRec.action = "entered_hand";
        result.flips.push(flipRec);
        // 检查 Flip 7
        if (isFlipSeven(target.hand)) {
          flipRec.triggerFlip7 = true;
          result.flip7Triggered = true;
          result.flipsDone = k;
          // 清除暂存区
          for (const sc of result.stash) this.discard.push(sc);
          result.stash = [];
          // 执行 Flip 7 结算（得分 + 全员结算）
          this.executeFlip7(target);
          break;
        }
      } else if (card.type === "score" || card.type === "double") {
        // 加分牌 -> 入暂存
        result.stash.push(card);
        flipRec.action = "stashed";
        result.flips.push(flipRec);
      } else {
        // freeze / flip3 / revive -> 入暂存
        result.stash.push(card);
        flipRec.action = "stashed";
        result.flips.push(flipRec);
      }

      result.flipsDone = k;
    }

    // 如果已爆牌或 Flip7，直接返回
    if (result.busted || result.flip7Triggered) return result;

    // 3 翻完成且未爆牌 -> 执行暂存区（FIFO）
    this.executeStash(result, target, layer);

    return result;
  }

  /**
   * 执行暂存区（FIFO 顺序）
   */
  private executeStash(result: Flip3ExecutionResult, target: Player, layer: number, startIndex = 0): boolean {
    if (startIndex === 0) console.log(`[翻三张] 执行暂存区: ${result.stash.length}张`);
    for (let index = startIndex; index < result.stash.length; index++) {
      const stashCard = result.stash[index];
      const execRec: StashExecRecord = { card: stashCard, action: "scored" };

      if (stashCard.type === "score" || stashCard.type === "double") {
        target.hand.push(stashCard);
        execRec.action = "scored";
      } else if (stashCard.type === "revive") {
        if (!target.hand.some(c => c.type === "revive")) {
          target.hand.push(stashCard);
          execRec.action = "revive";
        } else {
          const candidates = this.getActivePlayers().filter(p => p.id !== target.id && !p.hand.some(c => c.type === "revive"));
          if (candidates.length === 0) {
            this.discard.push(stashCard);
            execRec.action = "revive_discarded";
          } else {
            this.flip3StashContext = { result, target, layer, index, action: "revive" };
            this.pendingAction = { type: "revive", actorId: this.flip3ActorId ?? result.targetId, targetId: null };
            this.lastFlipResult = "pending_action";
            return false;
          }
        }
      } else if (stashCard.type === "freeze") {
        if (!this.findFirstActiveTarget(target.id)) {
          this.discard.push(stashCard);
          execRec.action = "freeze_discarded";
        } else {
          this.flip3StashContext = { result, target, layer, index, action: "freeze" };
          this.pendingAction = { type: "freeze", actorId: this.flip3ActorId ?? result.targetId, targetId: null };
          this.lastFlipResult = "pending_action";
          return false;
        }
      } else if (stashCard.type === "flipthree") {
        if (layer >= MAX_FLIPTHREE_NESTING || !this.findFirstActiveTarget(target.id)) {
          this.discard.push(stashCard);
          execRec.action = "flip3_discarded";
        } else {
          this.flip3StashContext = { result, target, layer, index, action: "flipthree" };
          this.pendingAction = { type: "flipthree", actorId: this.flip3ActorId ?? result.targetId, targetId: null };
          this.lastFlipResult = "pending_action";
          return false;
        }
      }

      result.stashExecuted.push(execRec);
    }
    return true;
  }

  /**
   * 执行 Flip 7 结算
   */
  private executeFlip7(triggerPlayer: Player): void {
    for (const p of this.players.values()) {
      if (p.id !== triggerPlayer.id && !p.isOut && p.hand.length > 0) {
        const score = calculateRoundScore(p.hand);
        p.score += score;
        p.endReason = "flip7";
        p.isOut = true;
        if (this.firstOutPlayerId === null) this.firstOutPlayerId = p.id;
        this.discard.push(...p.hand);
        p.hand = [];
        this.history.push({
          round: this.roundNumber,
          playerId: p.id,
          actions: ["stop"],
          scoreGained: score,
          isBust: false,
          isFlip7: true,
          isRevive: false,
          scoredByFlip7: true,
          triggerCard: undefined,
          flippedCards: [],
        });
      }
    }
    const triggerScore = calculateRoundScore(triggerPlayer.hand);
    this.discard.push(...triggerPlayer.hand);
    triggerPlayer.hand = [];
    triggerPlayer.endReason = "flip7";
    triggerPlayer.isOut = true;
    if (this.firstOutPlayerId === null) this.firstOutPlayerId = triggerPlayer.id;
    this.history.push({
      round: this.roundNumber,
      playerId: triggerPlayer.id,
      actions: ["flip7"],
      scoreGained: triggerScore + FLIP_SEVEN_BONUS,
      isBust: false,
      isFlip7: true,
      isRevive: false,
      triggerCard: undefined,
      flippedCards: [],
    });
    triggerPlayer.score += triggerScore + FLIP_SEVEN_BONUS;
    this.checkWin(triggerPlayer.id);
  }

  /**
   * 在玩家中找第一个活跃的（非出局、非跳过、非 excludeId）
   */
  private findFirstActiveTarget(excludeId: number): Player | null {
    for (const p of this.players.values()) {
      if (p.id !== excludeId && !p.isOut && !p.skipped) return p;
    }
    return null;
  }

  /**
   * 找可以接收 revive 转赠的玩家（无 revive、存活、非 excludeId）
   */
  private findReviveTransferTarget(excludeId: number): Player | null {
    for (const p of this.players.values()) {
      if (p.id !== excludeId && !p.isOut && !p.skipped && !p.hand.some(c => c.type === "revive")) {
        return p;
      }
    }
    return null;
  }

  /** 切换到下一个活跃玩家 */
  nextPlayer(): void {
    const active = this.getActivePlayers();
    if (active.length === 0) {
      this.startNewRound();
      return;
    }
    this.advanceToNextActive();
  }

  /**
   * 内部方法：从 currentPlayerId 向后找下一个活跃玩家。
   * 使用 Map 遍历顺序（按 id），跳过已出局/已跳过的玩家。
   */
  private advanceToNextActive(): void {
    const allIds = Array.from(this.players.keys()).sort((a, b) => a - b);
    if (allIds.length === 0) {
      this.startNewRound();
      return;
    }
    const currentIndex = allIds.indexOf(this.currentPlayerId);
    const startIndex = currentIndex === -1 ? 0 : currentIndex + 1;
    for (let i = 0; i < allIds.length; i++) {
      const idx = (startIndex + i) % allIds.length;
      const candidate = this.players.get(allIds[idx]);
      if (candidate && !candidate.isOut && !candidate.skipped) {
        this.currentPlayerId = candidate.id;
        return;
      }
    }
    this.startNewRound();
  }

  /** 检查回合是否应该结束（所有玩家都出局了） */
  isRoundOver(): boolean {
    return this.getActivePlayers().length === 0;
  }

  /** 开始新一轮 */
  startNewRound(): void {
    // 检查是否有获胜者
    for (const p of this.players.values()) {
      if (p.score >= WIN_SCORE) {
        this.winnerId = p.id;
        this.phase = "ended";
        return;
      }
    }

    const nextStarterId = this.firstOutPlayerId;

    this.roundNumber++;
    this.pendingAction = null;
    this.lastFlip = null;
    this.lastFlipPlayerId = null;
    this.lastFlipResult = null;
    this.firstOutPlayerId = null;
    this.roundFlippedCards.clear();

    // 把玩家手牌移入弃牌堆，然后清空手牌
    for (const player of this.players.values()) {
      if (player.hand.length > 0) {
        this.discard.push(...player.hand);
      }
      player.hand = [];
      player.hasBusted = false;
      if (!player.skipped) {
        player.isOut = false;
      }
    }

    // 后续轮次由上一轮最先出局的玩家先手；兜底用房主先手
    // 注：roundNumber === 1 的死代码已移除（initGame 直接进入 playing 阶段）
    const host = this.getHost();
    if (nextStarterId !== null && this.players.has(nextStarterId)) {
      this.currentPlayerId = nextStarterId;
    } else if (host) {
      this.currentPlayerId = host.id;
    } else {
      const allIds = Array.from(this.players.keys()).sort((a, b) => a - b);
      this.currentPlayerId = allIds[0] ?? 0;
    }
  }

  /** 检查获胜者 */
  private checkWin(playerId: number): void {
    const p = this.players.get(playerId);
    if (p && p.score >= WIN_SCORE) {
      this.winnerId = playerId;
      this.phase = "ended";
    }
  }

  // ── 状态快照 ──

  getState(): GameState {
    return {
      roomCode: this.roomCode,
      phase: this.phase,
      players: Array.from(this.players.values()),
      currentPlayerId: this.currentPlayerId,
      roundNumber: this.roundNumber,
      deck: this.deck,
      discard: this.discard,
      lastFlip: this.lastFlip,
      lastFlipPlayerId: this.lastFlipPlayerId,
      lastFlipResult: this.lastFlipResult,
      pendingAction: this.pendingAction,
      flip3Active: Boolean(this.flip3State || this.flip3Finalizing || this.flip3StashContext),
      history: this.history,
      winnerId: this.winnerId,
      createdAt: this.createdAt,
      updatedAt: Date.now(),
    };
  }
}
