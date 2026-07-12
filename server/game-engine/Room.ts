// ============================================================
// server/game-engine/Room.ts — 房间类
//
// 重要重构：players 使用 Map<number, Player> 存储，ID 自增且终身不变，
// 彻底解决 removePlayer 后 currentPlayerId / firstOutPlayerId /
// pendingBustPlayerId 因数组索引重排而失效的问题。
// ============================================================
import type { Card, Player, GameState, PendingAction } from "@/types";
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

    for (const player of this.players.values()) {
      player.hand = [];
      player.score = 0;
      player.hasBusted = false;
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
        return { success: true, result: "continue", card, message: `${player.nickname} 使用复活牌抵消！` };
      }
      player.hasBusted = true;
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
          return { success: true, result: "pending_action", card, message: `${player.nickname} 已有复活牌，请选择一名玩家送出` };
        }
        this.discard.push(card);
        return { success: true, result: "continue", card, message: `${player.nickname} 的复活牌进入弃牌堆` };
      }
      player.hand.push(card);
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
        return {
          success: true,
          result: "continue",
          card,
          message: `${player.nickname} 的${card.type === "freeze" ? "冻结牌" : "翻三张"}因无目标可用，直接结算 ${score} 分`,
        };
      }
      player.hand.push(card);
      this.pendingAction = { type: card.type, actorId: player.id, targetId: null };
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
      return {
        success: true,
        result: "flip7",
        card,
        message: `${triggerPlayer.nickname} 七连翻！所有玩家得分，额外 +${FLIP_SEVEN_BONUS} 奖励`,
      };
    }

    return { success: true, result: "continue", card, message: "" };
  }

  /** STOP */
  stop(): { score: number; playerId: number } {
    const player = this.players.get(this.currentPlayerId);
    if (!player || player.isOut) return { score: 0, playerId: this.currentPlayerId };

    const score = calculateRoundScore(player.hand);
    player.score += score;
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
    return { score, playerId: player.id };
  }

  /** 选择冻结/翻三张/复活目标 */
  selectTarget(targetId: number): { success: boolean; message: string } {
    if (!this.pendingAction) return { success: false, message: "没有待决策动作" };
    const target = this.players.get(targetId);
    if (!target) return { success: false, message: "目标不存在" };
    if (target.id === this.pendingAction.actorId) return { success: false, message: "不能选择自己" };
    if (target.isOut) return { success: false, message: "目标已出局" };
    if (target.skipped) return { success: false, message: "目标已跳过" };

    const actor = this.players.get(this.pendingAction.actorId);
    if (!actor) return { success: false, message: "行动者不存在" };

    this.pendingAction.targetId = targetId;

    // 复活牌：送给目标玩家
    if (this.pendingAction.type === "revive") {
      if (target.hand.some((c) => c.type === "revive")) {
        return { success: false, message: "该玩家已有复活牌" };
      }
      target.hand.push({ type: "revive", value: "revive", effect: "revive", id: `rv_gift_${Date.now()}` });
      this.pendingAction = null;
      return { success: true, message: `${actor.nickname} 将复活牌送给了 ${target.nickname}` };
    }

    if (this.pendingAction.type === "freeze") {
      const flippedCards = this.roundFlippedCards.get(target.id) ?? [];
      const score = calculateRoundScore(target.hand);
      target.score += score;
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
      actor.hand = actor.hand.filter((c) => c.type !== "freeze");
      this.discard.push(...actor.hand.filter((c) => c.type === "freeze").map(c => ({ ...c, id: `${c.id}_consumed` })));
      this.pendingAction = null;
      this.checkWin(target.id);
      return { success: true, message: `${target.nickname} 被冻结！结算 ${score} 分` };
    }

    // TODO: 未来翻三张逻辑（当前简化实现：结算目标玩家）
    if (this.pendingAction.type === "flipthree") {
      const flippedCards = this.roundFlippedCards.get(target.id) ?? [];
      const score = calculateRoundScore(target.hand);
      target.score += score;
      target.isOut = true;
      if (this.firstOutPlayerId === null) this.firstOutPlayerId = target.id;
      if (flippedCards.length > 0) this.discard.push(...flippedCards);
      this.discard.push(...target.hand);
      target.hand = [];
      this.history.push({
        round: this.roundNumber,
        playerId: target.id,
        actions: ["flipthree"],
        scoreGained: score,
        isBust: false,
        isFlip7: false,
        isRevive: false,
        triggerCard: { type: "flipthree", value: "flipthree", effect: "flipthree", id: `f3_${this.pendingAction.actorId}` },
        flippedCards: [...flippedCards],
      });
      actor.hand = actor.hand.filter((c) => c.type !== "flipthree");
      this.pendingAction = null;
      this.checkWin(target.id);
      return { success: true, message: `${target.nickname} 被翻三张结算 ${score} 分` };
    }

    return { success: false, message: `未知的 pendingAction type: ${(this.pendingAction as { type: string }).type}` };
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
      pendingAction: this.pendingAction,
      history: this.history,
      winnerId: this.winnerId,
      createdAt: this.createdAt,
      updatedAt: Date.now(),
    };
  }
}
