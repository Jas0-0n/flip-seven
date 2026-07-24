"use client";

import { useCallback, useState, useEffect, useRef } from "react";
import { useGameStore } from "@/store/gameStore";
import { useGameSocket } from "@/hooks/useGameSocket";
import { PlayerArea } from "./PlayerArea";
import { DeckPile } from "../atoms/DeckPile";
import { DiscardPile } from "../atoms/DiscardPile";
import { FlipCard, type FlipPhase } from "../atoms/FlipCard";
import { RoundHistory } from "../molecules/RoundHistory";
import { RoundSummary } from "../molecules/RoundSummary";
import { calculateRoundScore } from "@/utils/calculateScore";
import { getCardImage } from "@/utils";
import type { Card } from "@/types";
import {
  formatCardForFlip,
  formatHand,
  formatHandForBust,
  formatHandForFlip7,
  formatFlippedCardsForRound,
  printStashExecution,
  printFlip3Flips,
} from "@/utils/gameLogger";
import type { GameState } from "@/types";
import { socketClient } from "@/services/socket";

/** 头像颜色循环 */
const AVATAR_COLORS: Array<"blue" | "red" | "purple" | "green"> = ["blue", "red", "purple", "green"];

/**
 * 游戏主面板 — 竖直 4 人布局
 *
 * 翻牌动画流程：
 *   1. 玩家点击 GO → 显示牌背
 *   2. 3D 翻转动画 → 显示牌面
 *   3. 牌面放大 140%
 *   4. 飞向对应玩家的手牌区域
 *   5. 确认翻牌 → 切换玩家
 */
export function GameBoard() {
    const { state, selfId } = useGameStore();
    const isMyTurn = useGameStore((s) => s.isMyTurn);
    const {
        actionFlip, confirmFlip, actionStop, actionTarget, leaveRoom,
    } = useGameSocket();

    // ── 翻牌动画状态 ──
    const [flipPhase, setFlipPhase] = useState<FlipPhase>("idle");
    const [flippedCard, setFlippedCard] = useState<Card | null>(null);
    const [showScoreToast, setShowScoreToast] = useState(false);
    const [scoreToastMsg, setScoreToastMsg] = useState("");
    const [scoreToastPositive, setScoreToastPositive] = useState(true);
    const [preBustHand, setPreBustHand] = useState<Card[]>([]);
    const [flip7Score, setFlip7Score] = useState(0);
    const [otherPlayerFlip, setOtherPlayerFlip] = useState<{ playerId: number; card: Card } | null>(null);
    const [flipOwnerId, setFlipOwnerId] = useState<number | null>(null);
    const [startRect, setStartRect] = useState<DOMRect | null>(null);
    const [endRect, setEndRect] = useState<DOMRect | null>(null);
    const [hiddenCardId, setHiddenCardId] = useState<string | null>(null);
    const [hiddenCardIds, setHiddenCardIds] = useState<string[]>([]);
    const [animatingCardId, setAnimatingCardId] = useState<string | null>(null);
    const deckRef = useRef<HTMLDivElement | null>(null);
    const flipTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const flip3TimersRef = useRef<ReturnType<typeof setTimeout>[]>([]);
    const otherPlayerFlipTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const roundDisplayTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const scoreToastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const roundCheckIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const animationRunRef = useRef(0);
    const flipOwnerRef = useRef<number | null>(null);
    const flipPhaseRef = useRef<FlipPhase>("idle");
    flipPhaseRef.current = flipPhase;
    const lastHistoryLenRef = useRef(0);
    const waitingForFlipRef = useRef(false);
    const lastFlipRef = useRef<Card | null>(null);
    const flippedCardRef = useRef<Card | null>(null);
    // 保存最新的 state，供事件处理函数读取（避免闭包捕获旧 state）
    const stateRef = useRef(state);
    stateRef.current = state;
    
    // ── 用户视角行为日志相关 ──
    const prevStateRef = useRef<GameState | null>(null);
    const prevHistoryLenRef = useRef(0);
    const bustPendingRef = useRef(false);
    const flip3ActiveRef = useRef(false);
    const flip3RoundRef = useRef(0);
    const processedFlip3KeyRef = useRef<string | null>(null);
    const processedFlip3DoneKeyRef = useRef<string | null>(null);
    const flip3RunRef = useRef(0);
    
    // ── flip3 逐张翻状态 ──
    const [flip3State, setFlip3State] = useState<{
        isActive: boolean;
        targetId: number | null;
        byPlayer: number | null;
        flipNumber: number;
        lastCard: Card | null;
        isDone: boolean;
    }>({
        isActive: false,
        targetId: null,
        byPlayer: null,
        flipNumber: 0,
        lastCard: null,
        isDone: false
    });

    // ── 回合提示状态 ──
    type RoundDisplay = { type: "start"; round: number; playerName: string } | { type: "end"; round: number } | null;
    const [roundDisplay, setRoundDisplay] = useState<RoundDisplay>(null);
    const lastRoundRef = useRef(0);

    // ── 组件卸载时统一停止所有动画与提示定时器 ──
    useEffect(() => {
        return () => {
            if (flipTimerRef.current) clearTimeout(flipTimerRef.current);
            flip3TimersRef.current.forEach((timer) => clearTimeout(timer));
            flip3TimersRef.current = [];
            if (otherPlayerFlipTimerRef.current) clearTimeout(otherPlayerFlipTimerRef.current);
            if (roundDisplayTimerRef.current) clearTimeout(roundDisplayTimerRef.current);
            if (scoreToastTimerRef.current) clearTimeout(scoreToastTimerRef.current);
            if (roundCheckIntervalRef.current) clearInterval(roundCheckIntervalRef.current);
            animationRunRef.current++;
        };
    }, []);

    // ── 计算当前手牌得分 ──
    const selfPlayer = state?.players.find((p) => p.id === selfId);

    // ── 翻牌后：检测新的 history 条目并展示得分 ──
    useEffect(() => {
        if (!state) return;

        const newEntries = state.history.slice(lastHistoryLenRef.current);
        if (newEntries.length > 0) {
            const latest = newEntries[newEntries.length - 1];
            const latestPlayer = state.players.find((player) => player.id === latest.playerId);
            const latestPlayerName = latestPlayer?.nickname ?? `玩家${latest.playerId}`;
            if (latest.scoreGained > 0) {
                setScoreToastMsg(`${latestPlayerName} +${latest.scoreGained} 分`);
                setScoreToastPositive(true);
                setShowScoreToast(true);
                if (scoreToastTimerRef.current) clearTimeout(scoreToastTimerRef.current);
                scoreToastTimerRef.current = setTimeout(() => {
                    setShowScoreToast(false);
                    scoreToastTimerRef.current = null;
                }, 2500);
            } else if (latest.isBust) {
                setScoreToastMsg(`${latestPlayerName} 爆牌 +0 分`);
                setScoreToastPositive(false);
                setShowScoreToast(true);
                if (scoreToastTimerRef.current) clearTimeout(scoreToastTimerRef.current);
                scoreToastTimerRef.current = setTimeout(() => {
                    setShowScoreToast(false);
                    scoreToastTimerRef.current = null;
                }, 2500);
            }
            lastHistoryLenRef.current = state.history.length;
        }
    }, [state]);

    // ── 捕获翻牌结果（使用 lastFlipResult 决策动画） ──
    useEffect(() => {
        if (state && !state.flip3Active && waitingForFlipRef.current && state.lastFlip && lastFlipRef.current !== state.lastFlip) {
            setFlippedCard(state.lastFlip);
            flippedCardRef.current = state.lastFlip;
            lastFlipRef.current = state.lastFlip;
            // 普通抽牌才隐藏单张新牌；flip3 使用独立动画，不过滤真实手牌。
            if (!flip3ActiveRef.current) {
                setHiddenCardId(state.lastFlip.id);
            }
        }
    }, [state?.lastFlip]);

    // ── flip3 逐张翻事件处理 ──
    useEffect(() => {
        const handleFlip3FlipResult = (event: Event) => {
            const detail = (event as CustomEvent).detail;
            if (!detail?.targetId || !detail?.card) return;
            const isTarget = detail.targetId === selfId;

            // 事件去重：同一 (targetId, flipNumber) 只处理一次
            const eventKey = `${detail.targetId}_${detail.flipNumber}`;
            if (processedFlip3KeyRef.current === eventKey) return;
            processedFlip3KeyRef.current = eventKey;

            // 新一张牌到来时取消上一张的残留计时器，避免旧 reset timer 清空新流程。
            flip3TimersRef.current.forEach((timer) => clearTimeout(timer));
            flip3TimersRef.current = [];
            if (flipTimerRef.current) {
                clearTimeout(flipTimerRef.current);
                flipTimerRef.current = null;
            }
            ++flip3RunRef.current;

            // 用户视角日志
            flip3ActiveRef.current = true;
            const currentState = stateRef.current;
            flip3RoundRef.current = currentState?.roundNumber ?? 0;
            const actor = currentState?.players.find((p) => p.id === detail.byPlayer);
            const target = currentState?.players.find((p) => p.id === detail.targetId);
            const actorName = actor?.nickname ?? `玩家${detail.byPlayer}`;
            const targetName = target?.nickname ?? `玩家${detail.targetId}`;
            const round = flip3RoundRef.current;
            const cardName = formatCardForFlip(detail.card);

            // 如果是第1张，打印"对玩家B使用翻三张"
            if (detail.flipNumber === 1) {
                processedFlip3DoneKeyRef.current = null;
                waitingForFlipRef.current = false;
                console.log(`玩家${actorName}, Round${round}, 对${targetName}使用翻三张`);
            }

            // 打印翻开第N张
            let suffix = "";
            if (detail.card?.type !== "number") {
                suffix = "（暂存）";
            }
            if (detail.result === "bust" || detail.busted) {
                suffix = "，检测到爆牌，Trigger爆牌动画";
            } else if (detail.result === "flip7" || detail.flip7Triggered) {
                suffix = "，检测到七连翻，Trigger七连翻动画";
            }
            console.log(`玩家${targetName}, Round${round}, 翻开第${detail.flipNumber}张：${cardName}${suffix}`);

            setFlip3State({
                isActive: true,
                targetId: detail.targetId,
                byPlayer: detail.byPlayer,
                flipNumber: detail.flipNumber,
                lastCard: detail.card,
                isDone: false
            });

            // 目标玩家负责推进服务端流程，但所有客户端都播放同一套视觉动画。
            setHiddenCardIds((ids) => isTarget && !ids.includes(detail.card.id) ? [...ids, detail.card.id] : ids);
            flipOwnerRef.current = detail.targetId;
            setFlipOwnerId(detail.targetId);
            if (flipTimerRef.current) clearTimeout(flipTimerRef.current);

            const deckRect = deckRef.current?.getBoundingClientRect() ?? null;
            const handEl = document.querySelector(`[data-player-hand-id="${detail.targetId}"]`);
            setStartRect(deckRect);
            setEndRect(handEl?.getBoundingClientRect() ?? null);
            setFlippedCard(detail.card);
            flippedCardRef.current = detail.card;
            setFlipPhase("showing_back");

            const run = ++flip3RunRef.current;
            // flip3 动画节奏：150ms 牌背、550ms 放大、550ms 翻牌、450ms 入手。
            flipTimerRef.current = setTimeout(() => {
                if (flip3RunRef.current !== run) return;
                setFlipPhase("enlarged");
                flipTimerRef.current = setTimeout(() => {
                    if (flip3RunRef.current !== run) return;
                    setFlipPhase("flipping");
                    flipTimerRef.current = setTimeout(() => {
                        if (flip3RunRef.current !== run) return;
                        setFlipPhase("entering_hand");
                        flipTimerRef.current = setTimeout(() => {
                            if (flip3RunRef.current !== run) return;
                            setFlipPhase("idle");
                            flipOwnerRef.current = null;
                            setFlipOwnerId(null);
                            setFlippedCard(null);
                            flippedCardRef.current = null;
                            if (isTarget) {
                                setHiddenCardIds((ids) => ids.filter((id) => id !== detail.card.id));
                                // 下一张由服务端推进；客户端只负责展示动画。
                            }
                        }, 450);
                    }, 550);
                }, 550);
            }, 150);
            flip3TimersRef.current.push(flipTimerRef.current);
        };

        const handleFlipThreeDone = (event: Event) => {
            const detail = (event as CustomEvent).detail;
            if (!detail?.targetId || !detail?.executionResult) return;
            const execResult = detail.executionResult;
            const doneKey = `${detail.targetId}_${execResult?.flipsDone ?? execResult?.flips?.length ?? 0}`;
            if (processedFlip3DoneKeyRef.current === doneKey) return;
            processedFlip3DoneKeyRef.current = doneKey;
            const currentState = stateRef.current;
            const actor = currentState?.players.find((p) => p.id === detail.byPlayer);
            const target = currentState?.players.find((p) => p.id === detail.targetId);
            const actorName = actor?.nickname ?? `玩家${detail.byPlayer}`;
            const targetName = target?.nickname ?? `玩家${detail.targetId}`;
            const round = flip3RoundRef.current;

            // 打印翻三张完成信息
            if (execResult && execResult.flips && execResult.flips.length >= 1) {
                if (execResult.flips.length === 1 && (execResult.busted || execResult.flip7Triggered)) {
                    // 第1张就爆牌/七连翻（无 flip3_flip_result 事件）
                    console.log(`玩家${actorName}, Round${round}, 对${targetName}使用翻三张`);
                    printFlip3Flips(execResult.flips, targetName, currentState?.players ?? []);
                } else if (execResult.stashExecuted && execResult.stashExecuted.length > 0) {
                    // 3张翻完，有暂存区
                    console.log(`3张翻完，执行暂存区：`);
                    printStashExecution(execResult.stashExecuted, currentState?.players ?? []);
                } else {
                    // 3张翻完，无暂存区
                    // 最后一张牌已被 handleFlip3FlipResult 打印，这里不需要重复
                }
            }

            setFlip3State(prev => ({
                ...prev,
                // 服务端已经完成本次翻三张流程，立即隐藏流程提示；动画继续独立播放。
                isActive: false,
                isDone: true
            }));

            // done 只结束服务端流程提示，不打断当前牌的视觉动画。
            // 当前牌由自己的动画 run 负责归位和清理。
            const resetTimer = setTimeout(() => {
                flip3TimersRef.current = flip3TimersRef.current.filter((timer) => timer !== resetTimer);
                setFlip3State({
                    isActive: false,
                    targetId: null,
                    byPlayer: null,
                    flipNumber: 0,
                    lastCard: null,
                    isDone: false
                });
            }, 2600);
            flip3TimersRef.current.push(resetTimer);
        };

        window.addEventListener("flip3_flip_result", handleFlip3FlipResult);
        window.addEventListener("flipthree_done", handleFlipThreeDone);

        return () => {
            window.removeEventListener("flip3_flip_result", handleFlip3FlipResult);
            window.removeEventListener("flipthree_done", handleFlipThreeDone);
        };
    }, [selfId]);

    // ── 用户视角行为日志：检测 state 变化 ──
    useEffect(() => {
        if (!state) return;
        const prev = prevStateRef.current;

        if (!prev) {
            // 首次 state - 打印回合开始
            if (state.phase === "playing") {
                const startPlayer = state.players.find((p) => p.id === state.currentPlayerId);
                if (startPlayer) {
                    console.log(`第${state.roundNumber}回合开始，由${startPlayer.nickname}先手`);
                }
            }
            prevStateRef.current = state;
            prevHistoryLenRef.current = state.history.length;
            return;
        }

        // ── 检测游戏结束 ──
        if (state.phase === "ended" && state.winnerId !== null && prev.phase !== "ended") {
            const winner = state.players.find((p) => p.id === state.winnerId);
            if (winner) {
                console.log(`玩家${winner.nickname}达到${winner.score}分，游戏结束！获胜者：${winner.nickname}`);
            }
            prevStateRef.current = state;
            prevHistoryLenRef.current = state.history.length;
            return;
        }

        // ── 检测轮次变化 ──
        if (prev.roundNumber !== state.roundNumber) {
            // 打印上一轮结算
            const prevRound = prev.roundNumber;
            console.log(`\n第${prevRound}回合结束，结算结果:`);
            // 从 history 获取上一轮所有记录
            const prevRoundEntries = state.history.filter((h) => h.round === prevRound);
            for (const entry of prevRoundEntries) {
                const player = state.players.find((p) => p.id === entry.playerId);
                if (player) {
                    const cardsStr = formatFlippedCardsForRound(entry);
                    console.log(`  ${player.nickname}: [${cardsStr}]`);
                }
            }
            // 打印新回合开始
            const startPlayer = state.players.find((p) => p.id === state.currentPlayerId);
            if (startPlayer && state.phase === "playing") {
                console.log(`\n第${state.roundNumber}回合开始，由${startPlayer.nickname}先手`);
            }
            prevStateRef.current = state;
            prevHistoryLenRef.current = state.history.length;
            return;
        }

        const lastFlipChanged = state.lastFlip !== prev.lastFlip && state.lastFlip;
        const currentPlayerIdChanged = prev.currentPlayerId !== state.currentPlayerId;
        const isFlip3StateSync = Boolean(state.flip3Active || prev.flip3Active);

        // ── 检测 lastFlip 变化（非 flip3 翻牌）──
        if (lastFlipChanged && !flip3ActiveRef.current && !isFlip3StateSync) {
            const flipper = state.players.find((p) => p.id === state.lastFlipPlayerId);
            if (flipper && state.lastFlip) {
                const round = state.roundNumber;
                const cardName = formatCardForFlip(state.lastFlip);

                if (state.lastFlipResult === "pending_action") {
                    // 翻到功能牌，需选目标；冻结统一使用明确的提示，避免重复通用日志
                    const actionType = state.pendingAction?.type;
                    if (actionType === "freeze") {
                        console.log(`玩家${flipper.nickname}, Round${round}, 翻到${cardName}, 请选择冻结目标`);
                    } else {
                        const targetMsg = actionType === "revive" ? "请选择转赠目标" : "请选择目标";
                        console.log(`玩家${flipper.nickname}, Round${round}, 翻到${cardName}, ${targetMsg}`);
                    }
                } else if (state.lastFlipResult === "bust") {
                    // 爆牌 - 打印完整一行（手牌 + 触发牌标注）
                    // state 中手牌已被清空，从 prev 获取清空前的手牌
                    const prevFlipper = prev.players.find((p) => p.id === state.lastFlipPlayerId);
                    const oldHand = prevFlipper?.hand ?? [];
                    const handStr = formatHandForBust(oldHand, state.lastFlip);
                    console.log(`玩家${flipper.nickname}, Round${round}, 翻到${cardName}, 检测到爆牌，Trigger爆牌动画, ${flipper.nickname}回合结束，当前手牌[${handStr}]`);
                    bustPendingRef.current = true;
                }
                // continue 和 flip7 在 currentPlayerId 变化时处理
            }
        }

        // ── 检测 currentPlayerId 变化 ──
        if (currentPlayerIdChanged) {
            const oldPlayer = prev.players.find((p) => p.id === prev.currentPlayerId);
            const round = state.roundNumber;

            if (bustPendingRef.current) {
                // 爆牌确认后的切换 - 已打印过，跳过
                bustPendingRef.current = false;
            } else if (flip3ActiveRef.current) {
                // flip3 导致的切换 - 用 oldPlayer.hand（prev 状态，未被清空）
                if (oldPlayer) {
                    // 使用最新 state，避免暂存区结算前的旧手牌覆盖最终结果。
                    const latestPlayer = state.players.find((p) => p.id === oldPlayer.id);
                    const handStr = formatHand(latestPlayer?.hand ?? []);
                    console.log(`玩家${oldPlayer.nickname}, Round${round}, ${oldPlayer.nickname}回合结束，当前手牌[${handStr}]`);
                }
                flip3ActiveRef.current = false;
            } else if (lastFlipChanged && oldPlayer && state.lastFlip) {
                // continue 或 flip7 导致的切换
                const cardName = formatCardForFlip(state.lastFlip);

                if (state.lastFlipResult === "flip7") {
                    // 七连翻 - state 中手牌已被清空，从 prev 获取清空前的手牌
                    const handStr = formatHandForFlip7(oldPlayer.hand, state.lastFlip);
                    console.log(`玩家${oldPlayer.nickname}, Round${round}, 翻到${cardName}, 检测到七连翻，Trigger七连翻动画, ${oldPlayer.nickname}回合结束，当前手牌[${handStr}]`);
                } else {
                    // continue - 新手牌已包含翻到的牌
                    const newHand = state.players.find((p) => p.id === oldPlayer.id)?.hand ?? [];
                    const handStr = formatHand(newHand);
                    console.log(`玩家${oldPlayer.nickname}, Round${round}, 翻到${cardName}, ${oldPlayer.nickname}回合结束，当前手牌[${handStr}]`);
                }
            } else if (oldPlayer) {
                // lastFlip 没变 -> STOP
                const newHistory = state.history.slice(prevHistoryLenRef.current);
                const stopEntry = newHistory.find((h) => h.actions.includes("stop") && h.playerId === prev.currentPlayerId);
                if (stopEntry) {
                    // STOP - 用 prev 的手牌（清空前）
                    const prevHand = oldPlayer.hand;
                    const handStr = formatHand(prevHand);
                    console.log(`玩家${oldPlayer.nickname}, Round${round}, 选择STOP, ${oldPlayer.nickname}回合结束，当前手牌[${handStr}]`);
                }
            }
        }

        prevStateRef.current = state;
        prevHistoryLenRef.current = state.history.length;
    }, [state]);

    // ── 当 round 或 phase 变化时，强制重置动画（防 state_sync 竞争） ──
    useEffect(() => {
        if (!state) return;
        // currentPlayerId 会在服务端翻牌后立即切换，不能因此中断当前牌的视觉动画。
        // 只有游戏阶段离开 playing 时，才强制清理普通翻牌动画。
        const shouldCancelAnimation =
            flipPhase !== "idle" &&
            state.phase !== "playing" &&
            !flip3ActiveRef.current;

        if (shouldCancelAnimation) {
            if (flipTimerRef.current) {
                clearTimeout(flipTimerRef.current);
                flipTimerRef.current = null;
            }
            animationRunRef.current++;
            flipOwnerRef.current = null;
            setFlipOwnerId(null);
            setFlipPhase("idle");
            setFlippedCard(null);
            flippedCardRef.current = null;
            setPreBustHand([]);
            setFlip7Score(0);
            setHiddenCardId(null);
            setHiddenCardIds([]);
            setAnimatingCardId(null);
            waitingForFlipRef.current = false;
        }
    }, [state?.roundNumber, state?.phase, state?.currentPlayerId, flipPhase]);

    // ── 检测其他玩家翻牌（使用 lastFlipPlayerId 判断来源） ──
    useEffect(() => {
        if (!state?.lastFlip || !state.lastFlipPlayerId || !selfId) return;
        if (state.lastFlipPlayerId === selfId) return; // 自己翻牌走本地动画
        if (flipPhase !== "idle") return;
        if (lastFlipRef.current === state.lastFlip) return;

        setOtherPlayerFlip({ playerId: state.lastFlipPlayerId, card: state.lastFlip });
        lastFlipRef.current = state.lastFlip;

        if (otherPlayerFlipTimerRef.current) clearTimeout(otherPlayerFlipTimerRef.current);
        otherPlayerFlipTimerRef.current = setTimeout(() => {
            setOtherPlayerFlip(null);
            otherPlayerFlipTimerRef.current = null;
        }, 1500);
    }, [state?.lastFlip, state?.lastFlipPlayerId, selfId, flipPhase]);

    // ── 检测回合变化，显示回合提示 ──
    useEffect(() => {
        if (!state || state.phase !== "playing") {
            lastRoundRef.current = 0;
            return;
        }

        const currentRound = state.roundNumber;

        if (lastRoundRef.current === 0) {
            lastRoundRef.current = currentRound;
            const startPlayer = state.players.find((p) => p.id === state.currentPlayerId);
            setRoundDisplay({
                type: "start",
                round: currentRound,
                playerName: startPlayer?.nickname ?? "???",
            });
            return;
        }

        if (currentRound > lastRoundRef.current) {
            // 如果动画进行中，等动画结束后再显示
            if (flipPhase !== "idle") {
                if (roundCheckIntervalRef.current) clearInterval(roundCheckIntervalRef.current);
                const checkInterval = setInterval(() => {
                    // 读取 ref 来避免 TypeScript 闭包收窄问题
                    if (flipPhaseRef.current === "idle") {
                        clearInterval(checkInterval);
                        roundCheckIntervalRef.current = null;
                        setRoundDisplay({ type: "end", round: lastRoundRef.current });
                    }
                }, 100);
                roundCheckIntervalRef.current = checkInterval;
                if (roundDisplayTimerRef.current) clearTimeout(roundDisplayTimerRef.current);
                roundDisplayTimerRef.current = setTimeout(() => {
                    clearInterval(checkInterval);
                    roundCheckIntervalRef.current = null;
                    setRoundDisplay({ type: "end", round: lastRoundRef.current });
                }, 5000);
            } else {
                setRoundDisplay({ type: "end", round: lastRoundRef.current });
            }
        }

        lastRoundRef.current = currentRound;
    }, [state?.roundNumber, state?.phase, flipPhase]);

    // ── 回合结束提示显示完毕后，切换到回合开始提示 ──
    useEffect(() => {
        if (!state || roundDisplay?.type !== "end") return;

        if (roundDisplayTimerRef.current) clearTimeout(roundDisplayTimerRef.current);
        const timer = setTimeout(() => {
            const startPlayer = state.players.find((p) => p.id === state.currentPlayerId);
            setRoundDisplay({
                type: "start",
                round: state.roundNumber,
                playerName: startPlayer?.nickname ?? "???",
            });
        }, 3000);
        roundDisplayTimerRef.current = timer;

        return () => {
            clearTimeout(timer);
            if (roundDisplayTimerRef.current === timer) roundDisplayTimerRef.current = null;
        };
    }, [roundDisplay, state]);

    // start 提示独立计时，避免被回合结束提示的 timer 清理或覆盖。
    useEffect(() => {
        if (roundDisplay?.type !== "start") return;

        if (roundDisplayTimerRef.current) {
            clearTimeout(roundDisplayTimerRef.current);
        }

        const timer = setTimeout(() => {
            setRoundDisplay(null);
            roundDisplayTimerRef.current = null;
        }, 2000);

        roundDisplayTimerRef.current = timer;
        return () => {
            clearTimeout(timer);
            if (roundDisplayTimerRef.current === timer) {
                roundDisplayTimerRef.current = null;
            }
        };
    }, [roundDisplay]);

    // ── 翻牌操作：启动动画序列 ──
    const handleFlip = useCallback(() => {
        if (!isMyTurn() || state?.phase !== "playing") return;
        if (flipPhase !== "idle") return;

        const animationRun = ++animationRunRef.current;
        flipOwnerRef.current = selfId;
        setFlipOwnerId(selfId);
        lastHistoryLenRef.current = state?.history.length ?? 0;

        const currentHand = state?.players.find((p) => p.id === selfId)?.hand ?? [];
        setPreBustHand([...currentHand]);

        // 测量牌堆与手牌区位置
        const deckRect = deckRef.current?.getBoundingClientRect() ?? null;
        const handEl = document.querySelector(`[data-player-hand-id="${selfId}"]`);
        const handRect = handEl?.getBoundingClientRect() ?? null;
        setStartRect(deckRect);
        setEndRect(handRect);

        waitingForFlipRef.current = true;
        flippedCardRef.current = null;
        setFlippedCard(null);
        setAnimatingCardId(null);

        actionFlip();

        setFlipPhase("showing_back");

        // 普通翻牌与 flip3 使用统一节奏：150ms 牌背、550ms 放大、550ms 翻牌。
        flipTimerRef.current = setTimeout(() => {
            if (animationRunRef.current !== animationRun) return;
            setFlipPhase("enlarged");

            flipTimerRef.current = setTimeout(() => {
                if (animationRunRef.current !== animationRun) return;
                const tryFlipping = () => {
                    if (animationRunRef.current !== animationRun) return;
                    if (flippedCardRef.current) {
                        setFlipPhase("flipping");

                        flipTimerRef.current = setTimeout(() => {
                            if (animationRunRef.current === animationRun) {
                                setFlipPhase("entering_hand");
                            }
                        }, 550);
                    } else {
                        flipTimerRef.current = setTimeout(tryFlipping, 50);
                    }
                };
                tryFlipping();
            }, 550);
        }, 150);
    }, [isMyTurn, state, actionFlip, flipPhase, selfId]);

    // ── 检测 state 变化，驱动动画后续阶段（使用 lastFlipResult 决策） ──
    useEffect(() => {
        if (!state || flipPhase !== "entering_hand" || !waitingForFlipRef.current) return;

        // 归位动画持续 0.3s，等待完成后再结算
        flipTimerRef.current = setTimeout(() => {
            const cardId = flippedCardRef.current?.id ?? null;

            if (state.lastFlipResult === "bust") {
                setFlipPhase("busted");
                setHiddenCardId(null);
                setAnimatingCardId(null);
                flipTimerRef.current = setTimeout(() => {
                    setFlipPhase("idle");
                    setFlippedCard(null);
                    flippedCardRef.current = null;
                    setPreBustHand([]);
                    setHiddenCardId(null);
                    setAnimatingCardId(null);
                    waitingForFlipRef.current = false;
                    confirmFlip(); // 爆牌需要确认，服务端推进
                }, 1000);
            } else if (state.lastFlipResult === "flip7") {
                const selfNow = state.players.find((p) => p.id === selfId);
                const score = selfNow ? calculateRoundScore(selfNow.hand, 15) : 0;
                setFlip7Score(score);
                setFlipPhase("flip7");
                setHiddenCardId(null);
                setAnimatingCardId(null);
                flipTimerRef.current = setTimeout(() => {
                    setFlipPhase("idle");
                    setFlippedCard(null);
                    flippedCardRef.current = null;
                    setPreBustHand([]);
                    setFlip7Score(0);
                    setHiddenCardId(null);
                    setAnimatingCardId(null);
                    waitingForFlipRef.current = false;
                    // 不发 confirmFlip，服务端已处理新回合
                }, 2000);
            } else {
                // 普通 continue / score / double / revive
                setFlipPhase("idle");
                setFlippedCard(null);
                flippedCardRef.current = null;
                setPreBustHand([]);
                setHiddenCardId(null);
                setAnimatingCardId(cardId);
                waitingForFlipRef.current = false;
                // 短暂高亮后清除
                flipTimerRef.current = setTimeout(() => {
                    setAnimatingCardId(null);
                }, 500);
                // 不发 confirmFlip，服务端已切换玩家
            }
        }, 300);
    }, [state, flipPhase, selfId, confirmFlip]);

    // ── 手动跳过动画（只有爆牌需要确认） ──
    const handleSkipAnimation = useCallback(() => {
        if (flipTimerRef.current) clearTimeout(flipTimerRef.current);
        if (
            flipPhase === "showing_back" ||
            flipPhase === "enlarged" ||
            flipPhase === "flipping" ||
            flipPhase === "entering_hand" ||
            flipPhase === "busted" ||
            flipPhase === "flip7"
        ) {
            setFlipPhase("idle");
            setFlippedCard(null);
            flippedCardRef.current = null;
            setPreBustHand([]);
            setFlip7Score(0);
            setHiddenCardId(null);
            setAnimatingCardId(null);
            waitingForFlipRef.current = false;
            // 只有爆牌需要 confirmFlip
            if (flipPhase === "busted") {
                confirmFlip();
            }
        }
    }, [confirmFlip, flipPhase]);

    // ── STOP 结算 ──
    const handleStop = useCallback(() => {
        if (isMyTurn() && state?.phase === "playing" && flipPhase === "idle") {
            actionStop();
        }
    }, [isMyTurn, state?.phase, actionStop, flipPhase]);

    // ── 目标选择 ──
    const handleTargetSelect = useCallback(
        (targetId: number) => {
            const pa = state?.pendingAction;
            const actor = pa ? state?.players.find((p) => p.id === pa.actorId) : null;
            const target = state?.players.find((p) => p.id === targetId);

            if (!pa) {
                actionTarget(targetId);
            } else if (pa.type === "freeze") {
                if (actor && target) {
                    console.log(`玩家${actor.nickname}对玩家${target.nickname}使用了冻结`);
                }
                socketClient.send({ type: "action_freeze", payload: { targetId } });
            } else if (pa.type === "flipthree") {
                socketClient.send({ type: "action_flipthree", payload: { targetId } });
            } else if (pa.type === "revive") {
                socketClient.send({ type: "action_revive", payload: { targetId } });
            } else {
                actionTarget(targetId);
            }
            setFlipPhase("idle");
            setFlippedCard(null);
        },
        [state, actionTarget]
    );

    if (!state) {
        return (
            <div className="min-h-[100dvh] flex flex-col items-center justify-center gap-4">
                <div className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin" />
                <p className="text-[var(--text-secondary)] text-sm">等待游戏数据...</p>
                <button className="btn-arcade text-sm" onClick={leaveRoom}>
                    返回大厅
                </button>
            </div>
        );
    }

    const pendingAction = state.pendingAction;
    // flip3 选定目标后完全由内部状态机推进；只有仍处于
    // pendingAction 的初始阶段才显示一次目标选择 UI。
    const needsTargetSelection = !!(
        pendingAction &&
        pendingAction.actorId === selfId &&
        pendingAction.targetId === null &&
        !flip3ActiveRef.current
    );

    const targetablePlayers = state.players.filter(
      (p) => {
        // 只有 freeze/revive 不能选自己，flip3 可以
        if ((!pendingAction || (pendingAction.type !== "flipthree")) && p.id === selfId) return false;
        if (p.isOut || p.skipped) return false;
        // 复活牌目标：排除已有复活牌的玩家
        if (pendingAction && pendingAction.type === "revive") {
          return !p.hand.some((c: Card) => c.type === "revive");
        }
        return true;
      }
    );

    // ── 分离自己和其他玩家，按分数排序对手 ──
    const selfP = state.players.find((p) => p.id === selfId);
    const opponents = state.players
        .filter((p) => p.id !== selfId)
        .sort((a, b) => b.score - a.score);
    const topOpponent = opponents[0];        // 最高分 → ALICE（顶部）
    const middleOpponents = opponents.slice(1); // 其余 → 中间并排

    const isFlipAnimating = flipPhase !== "idle";

    return (
        <div className="min-h-[100dvh] flex flex-col p-2 safe-top safe-bottom wood-frame felt-texture">

            {/* ═══ 顶部信息栏（精简） ═══ */}
            <div className="flex items-center justify-between px-1 mb-1">
                <span className="text-xs text-[var(--text-secondary)]">
                    第 <strong className="text-[var(--pixel-gold)]">{state.roundNumber}</strong> 轮
                </span>
                <div className="flex items-center gap-2">
                    <div className="bg-[var(--wood-dark)] px-2 py-0.5 rounded-md border border-[var(--wood-light)]">
                        <span className="text-[10px] text-[var(--text-secondary)]">底池 </span>
                        <strong className="text-xs text-[var(--pixel-gold)]">{state.deck.length + state.discard.length}</strong>
                        <span className="text-[10px] text-[var(--text-secondary)]"> 分</span>
                    </div>
                    <span className="text-xs text-[var(--text-secondary)]">
                        👥 <strong className="text-[var(--pixel-gold)]">{state.players.length}</strong>
                    </span>
                </div>
                <span className="font-mono text-xs text-[var(--text-secondary)] font-bold">
                    {state.roomCode}
                </span>
            </div>

            {/* ═══ 主游戏区（竖直排列） ═══ */}
            <div className="flex-1 flex flex-col gap-1.5 min-h-0">

                {/* ── 对手 1：顶部横排（每行7张，居中） ── */}
                {topOpponent && (
                    <PlayerArea
                        player={topOpponent}
                        isActive={state.currentPlayerId === topOpponent.id}
                        position="bottom"
                        cardDisplay="faceUp"
                        cardsPerRow={7}
                        cardSize="sm"
                        avatarColor={AVATAR_COLORS[0]}
                        isTargetable={
                            needsTargetSelection &&
                            targetablePlayers.some((tp) => tp.id === topOpponent.id)
                        }
                        onSelectTarget={
                            needsTargetSelection
                                ? () => handleTargetSelect(topOpponent.id)
                                : undefined
                        }
                    />
                )}

                {/* ── 中间对手：并排（每行4张，居中） ── */}
                {middleOpponents.length > 0 && (
                    <div className="flex gap-1.5">
                        {middleOpponents.map((opp, i) => (
                            <div key={opp.id} className="flex-1 min-w-0">
                                <PlayerArea
                                    player={opp}
                                    isActive={state.currentPlayerId === opp.id}
                                    position="bottom"
                                    cardDisplay="faceUp"
                                    cardsPerRow={4}
                                    cardSize="xs"
                                    avatarColor={AVATAR_COLORS[(i + 1) % AVATAR_COLORS.length]}
                                    isTargetable={
                                        needsTargetSelection &&
                                        targetablePlayers.some((tp) => tp.id === opp.id)
                                    }
                                    onSelectTarget={
                                        needsTargetSelection
                                            ? () => handleTargetSelect(opp.id)
                                            : undefined
                                    }
                                />
                            </div>
                        ))}
                    </div>
                )}

                {/* ── 中央：Deck + Discard ── */}
                <div className="flex items-center justify-center gap-6 py-1.5">
                    <DeckPile
                        ref={deckRef}
                        count={state.deck.length}
                        onClick={handleFlip}
                        isClickable={
                            isMyTurn() &&
                            state.phase === "playing" &&
                            !pendingAction &&
                            flipPhase === "idle" &&
                            state.deck.length > 0
                        }
                        label="新牌堆"
                    />

                    <DiscardPile count={state.discard.length} label="旧牌堆" />
                </div>

                {/* ── 回合提示 + GO/STOP（靠近玩家手牌） ── */}
                <div className="mt-auto flex flex-col items-center gap-2 pt-2">
                    {/* 回合提示 */}
                    {flip3State.isActive && (
                        <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-sm font-bold bg-cyan-500/15 text-cyan-300 ring-1 ring-cyan-400/40">
                            <span className="w-2 h-2 rounded-full bg-cyan-300 animate-pulse" />
                            {flip3State.byPlayer === selfId ? "你" : state.players.find((p) => p.id === flip3State.byPlayer)?.nickname ?? "玩家"}
                            {" 对 "}
                            {state.players.find((p) => p.id === flip3State.targetId)?.nickname ?? "目标"}
                            {` 翻三张：第 ${flip3State.flipNumber}/3 张`}
                        </div>
                    )}
                    {state.phase === "playing" && !flip3State.isActive && (
                        <div className={`inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-sm font-bold ${
                            isMyTurn()
                                ? "bg-[var(--pixel-gold)]/20 text-[var(--pixel-gold)] ring-1 ring-[var(--pixel-gold)]/40"
                                : "bg-[var(--bg-card-hover)] text-[var(--text-secondary)]"
                        }`}>
                            <span className="w-2 h-2 rounded-full bg-current" />
                            {isMyTurn()
                                ? "你的回合"
                                : `${state.players.find((p) => p.id === state.currentPlayerId)?.nickname ?? "???"} 的回合中`}
                        </div>
                    )}

                    {/* GO + STOP 按钮（无目标选择时显示） */}
                    {isMyTurn() && state.phase === "playing" && !needsTargetSelection && !pendingAction && flipPhase === "idle" && (
                        <div className="flex items-center justify-center gap-3">
                            <button
                                className="btn-arcade btn-arcade-green btn-circle"
                                style={{ boxShadow: "0 0 0 3px rgba(57,255,20,0.4), 0 4px 0 var(--pixel-green-dark), 0 6px 12px rgba(0,0,0,0.3)" }}
                                onClick={handleFlip}
                                disabled={state.deck.length === 0}
                            >
                                GO!
                            </button>
                            <button
                                className="btn-arcade btn-arcade-soft animate-pulse"
                                onClick={handleStop}
                                disabled={!selfPlayer || selfPlayer.hand.length === 0}
                            >
                                STOP
                            </button>
                        </div>
                    )}

                    {/* 复活牌/行动牌目标选择提示 */}
                    {needsTargetSelection && (
                        <div className="flex flex-col items-center gap-2">
                            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full text-sm font-bold bg-purple-500/20 text-purple-400 ring-1 ring-purple-500/40">
                                <span className="w-2 h-2 rounded-full bg-purple-400 animate-pulse" />
                                {pendingAction?.type === "revive"
                                    ? "请选择一名玩家送出复活牌"
                                    : pendingAction?.type === "freeze"
                                    ? "请选择一名玩家冻结（立即结算）"
                                    : "请选择目标玩家"}
                            </div>
                            <span className="text-xs text-[var(--text-muted)]">
                                点击玩家区域选择目标
                            </span>
                        </div>
                    )}
                </div>

                {/* ── 你的手牌（YOU，底部，face-up + 横向滚动） ── */}
                {selfP && (
                    <div className="mt-auto w-full px-0">
                        <PlayerArea
                            player={selfP}
                            isSelf
                            isActive={state.currentPlayerId === selfP.id}
                            position="bottom"
                            cardDisplay="faceUp"
                            cardsPerRow={6}
                            cardSize="md"
                            avatarColor="gold"
                            isTargetable={
                                needsTargetSelection &&
                                targetablePlayers.some((tp) => tp.id === selfP.id)
                            }
                            onSelectTarget={
                                needsTargetSelection
                                    ? () => handleTargetSelect(selfP.id)
                                    : undefined
                            }
                            hiddenCardId={hiddenCardId}
                            hiddenCardIds={hiddenCardIds}
                            animatingCardId={animatingCardId}
                        />
                    </div>
                )}
            </div>

            {/* ══════════ 翻牌动画（Motion） ══════════ */}
            <FlipCard
                phase={flipOwnerId !== null ? flipPhase : "idle"}
                card={flippedCard}
                playerName={state.players.find((p) => p.id === flipOwnerId)?.nickname}
                round={state.roundNumber}
                startRect={startRect}
                endRect={endRect}
                targetCardSize="md"
                onSkip={handleSkipAnimation}
            />

            {/* ══════════ 七连翻庆祝动画 ══════════ */}
            {flipPhase === "flip7" && (
                <div className="fixed inset-0 z-50 overflow-hidden pointer-events-auto" onClick={handleSkipAnimation}>
                    {Array.from({ length: 30 }).map((_, i) => {
                        const colors = ["#FFD700", "#FF6B6B", "#4ECDC4", "#45B7D1", "#96CEB4", "#FFEAA7", "#DDA0DD", "#FF9FF3"];
                        const color = colors[i % colors.length];
                        const left = Math.random() * 100;
                        const delay = Math.random() * 0.8;
                        const duration = 1.5 + Math.random() * 1.5;
                        const size = 8 + Math.random() * 12;
                        const rotation = Math.random() * 360;
                        return (
                            <div
                                key={i}
                                className="absolute"
                                style={{
                                    left: `${left}%`,
                                    top: "-20px",
                                    width: `${size}px`,
                                    height: `${size * 0.6}px`,
                                    backgroundColor: color,
                                    borderRadius: "2px",
                                    animation: `confettiFall ${duration}s ease-in ${delay}s forwards`,
                                    transform: `rotate(${rotation}deg)`,
                                }}
                            />
                        );
                    })}
                    <div className="absolute inset-0 flex items-center justify-center">
                        <div className="text-center relative z-10">
                            <div
                                className="text-5xl sm:text-6xl font-bold mb-4"
                                style={{
                                    color: "#FFD700",
                                    textShadow: "0 0 20px #FFD700, 0 0 40px #FFA500, 0 0 60px #FF8C00",
                                    animation: "flip7TitleAppear 0.6s ease-out forwards",
                                }}
                            >
                                🎉 七连翻！
                            </div>
                            <div
                                className="text-3xl sm:text-4xl font-bold text-white"
                                style={{
                                    textShadow: "0 0 10px rgba(255,255,255,0.8)",
                                    animation: "flip7ScoreAppear 0.5s ease-out 0.4s both",
                                }}
                            >
                                +{flip7Score} 分
                            </div>
                        </div>
                    </div>
                    <p
                        className="absolute bottom-8 left-1/2 -translate-x-1/2 text-white/60 text-xs pointer-events-none"
                        style={{ animation: "flip7ScoreAppear 0.5s ease-out 1s both" }}
                    >
                        点击跳过
                    </p>
                </div>
            )}

            {/* ══════════ 爆牌动画 — 定位到爆牌玩家手牌堆中心 ══════════ */}
            {flipPhase === "busted" && (() => {
                const bustPlayerId = state.lastFlipPlayerId;
                const handEl = bustPlayerId !== null
                    ? document.querySelector(`[data-player-hand-id="${bustPlayerId}"]`) as HTMLElement | null
                    : null;
                const pos = handEl?.getBoundingClientRect();
                const centerX = pos ? pos.left + pos.width / 2 : undefined;
                const centerY = pos ? pos.top + pos.height / 2 : undefined;
                const hasPos = centerX !== undefined && centerY !== undefined;

                return (
                    <div
                        className="fixed z-50 pointer-events-auto"
                        style={hasPos
                            ? { top: centerY, left: centerX, transform: 'translate(-50%, -50%)', width: '1px', height: '1px' }
                            : { inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }
                        }
                        onClick={handleSkipAnimation}
                    >
                        {preBustHand.length > 0 && (
                            <div className="absolute" style={hasPos ? {} : { inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                {preBustHand.map((card, i) => {
                                    const angle = (i / preBustHand.length) * 360;
                                    const distance = 150 + Math.random() * 50;
                                    const rotate = (Math.random() - 0.5) * 60;
                                    const delay = i * 0.05;
                                    return (
                                        <div
                                            key={card.id}
                                            className="absolute rounded-lg overflow-hidden shadow-lg"
                                            style={{
                                                animation: `cardScatter 0.8s ease-out ${delay}s forwards`,
                                                "--scatter-x": `${Math.cos((angle * Math.PI) / 180) * distance}px`,
                                                "--scatter-y": `${Math.sin((angle * Math.PI) / 180) * distance}px`,
                                                "--scatter-rotate": `${rotate}deg`,
                                                width: "64px",
                                                height: "96px",
                                                left: hasPos ? '-32px' : undefined,
                                                top: hasPos ? '-48px' : undefined,
                                            } as React.CSSProperties}
                                        >
                                            <img
                                                src={getCardImage(card)}
                                                alt={`card-${card.type}`}
                                                className="w-full h-full object-contain"
                                                draggable={false}
                                            />
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                        <div className="absolute text-center" style={{
                            animation: "bustShake 0.5s ease-in-out",
                            left: hasPos ? '-70px' : '50%',
                            top: hasPos ? '-40px' : '50%',
                            transform: hasPos ? undefined : 'translate(-50%, -50%)',
                            width: hasPos ? '140px' : undefined,
                        }}>
                            <div className="text-6xl mb-2" style={{ animation: "bustExplode 0.8s ease-out forwards" }}>
                                💥
                            </div>
                            <div
                                className="bg-red-500/90 text-white font-bold text-xl px-4 py-2 rounded-xl shadow-2xl"
                                style={{ animation: "bustTextAppear 0.4s ease-out 0.3s both" }}
                            >
                                爆牌！
                            </div>
                        </div>
                        <p className="absolute text-white/60 text-xs pointer-events-none"
                            style={{
                                animation: "bustTextAppear 0.4s ease-out 0.5s both",
                                left: hasPos ? '-40px' : '50%',
                                top: hasPos ? '60px' : undefined,
                                bottom: hasPos ? undefined : '8px',
                                transform: hasPos ? undefined : 'translateX(-50%)',
                                width: hasPos ? '80px' : undefined,
                                textAlign: 'center' as const,
                            }}>
                            点击跳过
                        </p>
                    </div>
                );
            })()}

            {/* ══════════ 其他玩家翻牌动画 ══════════ */}
            {otherPlayerFlip && flipPhase === "idle" && !roundDisplay && (
                <div className="fixed top-1/4 left-1/2 -translate-x-1/2 z-40 pointer-events-none">
                    <div className="text-center" style={{ animation: "bounceIn 0.4s ease-out" }}>
                        <p className="text-[var(--text-secondary)] text-sm mb-2">
                            <span className="text-[var(--pixel-gold)] font-semibold">
                                {state.players.find((player) => player.id === otherPlayerFlip.playerId)?.nickname ?? `玩家${otherPlayerFlip.playerId}`}
                            </span>
                            {" "}翻到了
                        </p>
                        <div className="px-card hoverable" style={{ width: "80px", height: "120px" }}>
                            <img
                                src={getCardImage(otherPlayerFlip.card)}
                                alt={`card-${otherPlayerFlip.card.type}`}
                                className="px-card-img"
                                draggable={false}
                            />
                        </div>
                    </div>
                </div>
            )}

            {/* ══════════ 回合提示 ══════════ */}
            {roundDisplay && (
                <div className="fixed inset-0 z-50 flex items-center justify-center pointer-events-none">
                    {roundDisplay.type === "end" ? (
                        <div className="text-center" style={{ animation: "bounceIn 0.4s ease-out" }}>
                            <div className="card p-8 mx-4">
                                <h2 className="text-2xl font-bold text-[var(--text-primary)] mb-2">
                                    第 {roundDisplay.round} 回合结束
                                </h2>
                                <p className="text-[var(--text-secondary)] text-sm">
                                    本回合翻牌记录
                                </p>
                            </div>
                        </div>
                    ) : (
                        <div className="text-center" style={{ animation: "bounceIn 0.4s ease-out" }}>
                            <div className="card p-8 mx-4">
                                <h2 className="text-2xl font-bold text-[var(--pixel-gold)] mb-2">
                                    第 {roundDisplay.round} 回合开始
                                </h2>
                                <p className="text-[var(--text-secondary)] text-sm">
                                    由 <span className="text-[var(--text-primary)] font-semibold">{roundDisplay.playerName}</span> 开始
                                </p>
                            </div>
                        </div>
                    )}
                </div>
            )}

            {/* ══════════ 动画关键帧 ══════════ */}
            <style jsx>{`
                @keyframes flipCardHorizontal {
                    0% { transform: rotateY(0deg); }
                    100% { transform: rotateY(180deg); }
                }
                @keyframes enlargeCard200 {
                    0% { transform: scale(1); }
                    50% { transform: scale(3.2); }
                    100% { transform: scale(3); }
                }
                @keyframes shrinkCard {
                    0% { transform: scale(2); opacity: 1; }
                    100% { transform: scale(0.8); opacity: 0; }
                }
                @keyframes enterHand {
                    0% { transform: scale(3) translate(0, 0); opacity: 1; }
                    100% { transform: scale(0.3) translate(0, 200px); opacity: 0; }
                }
                @keyframes slideUpFast {
                    0% { transform: translateY(100px); opacity: 0; }
                    100% { transform: translateY(0); opacity: 1; }
                }
                @keyframes confettiFall {
                    0% { transform: translateY(0) rotate(0deg); opacity: 1; }
                    100% { transform: translateY(100vh) rotate(720deg); opacity: 0; }
                }
                @keyframes flip7TitleAppear {
                    0% { transform: scale(0) rotate(-10deg); opacity: 0; }
                    60% { transform: scale(1.2) rotate(5deg); opacity: 1; }
                    100% { transform: scale(1) rotate(0deg); opacity: 1; }
                }
                @keyframes flip7ScoreAppear {
                    0% { transform: translateY(20px) scale(0.5); opacity: 0; }
                    100% { transform: translateY(0) scale(1); opacity: 1; }
                }
                @keyframes cardScatter {
                    0% { transform: translate(0, 0) rotate(0deg) scale(1); opacity: 1; }
                    50% { opacity: 0.8; }
                    100% { transform: translate(var(--scatter-x), var(--scatter-y)) rotate(var(--scatter-rotate)) scale(0.3); opacity: 0; }
                }
                @keyframes bustShake {
                    0%, 100% { transform: translateX(0); }
                    10%, 30%, 50%, 70%, 90% { transform: translateX(-10px); }
                    20%, 40%, 60%, 80% { transform: translateX(10px); }
                }
                @keyframes bustExplode {
                    0% { transform: scale(0); opacity: 0; }
                    50% { transform: scale(1.5); opacity: 1; }
                    100% { transform: scale(1.2); opacity: 1; }
                }
                @keyframes winnerAppear {
                    0% { transform: scale(0) translateY(50px); opacity: 0; }
                    60% { transform: scale(1.1) translateY(-10px); opacity: 1; }
                    100% { transform: scale(1) translateY(0); opacity: 1; }
                }
                @keyframes trophyBounce {
                    0% { transform: scale(0) rotate(-20deg); }
                    40% { transform: scale(1.3) rotate(10deg); }
                    60% { transform: scale(0.9) rotate(-5deg); }
                    80% { transform: scale(1.1) rotate(3deg); }
                    100% { transform: scale(1) rotate(0deg); }
                }
                @keyframes winnerTextGlow {
                    0%, 100% {
                        textShadow: "0 0 20px var(--pixel-gold), 0 0 40px rgba(255, 215, 0, 0.5)";
                        filter: brightness(1);
                    }
                    50% {
                        textShadow: "0 0 30px var(--pixel-gold), 0 0 60px rgba(255, 215, 0, 0.8), 0 0 100px rgba(255, 215, 0, 0.4)";
                        filter: brightness(1.2);
                    }
                }
            `}</style>

            {/* ══════════ 得分提示 Toast（像素风飘字） ══════════ */}
            {showScoreToast && (
                <div
                    className="fixed top-20 left-1/2 -translate-x-1/2 z-50 pointer-events-none"
                    style={{ animation: "scoreGainFloat 0.8s ease-out forwards" }}
                >
                    <div className={`font-bold text-lg px-4 py-2 rounded-xl shadow-lg ${
                        scoreToastPositive
                            ? "bg-green-500/90 text-white"
                            : "bg-red-500/90 text-white"
                    }`}
                    style={{
                        fontWeight: 800,
                        fontSize: "18px",
                        color: scoreToastPositive ? "#80ff80" : "#ff6060",
                        textShadow: "1px 1px 0 #000, -1px -1px 0 #000, 1px -1px 0 #000, -1px 1px 0 #000",
                    }}
                    >
                        {scoreToastMsg}
                    </div>
                </div>
            )}

            {/* 回合结束覆盖层 */}
            {state.phase === "roundEnd" && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-40">
                    <div className="card p-6 text-center max-w-sm mx-4">
                        <p className="text-lg font-bold mb-2">回合结束</p>
                        <p className="text-[var(--text-secondary)] text-sm">
                            下一轮即将开始... (2s)
                        </p>
                    </div>
                </div>
            )}

            {/* 游戏结束覆盖层 — 获胜动画 */}
            {state.phase === "ended" && state.winnerId !== null && (() => {
                const winner = state.players.find((p) => p.id === state.winnerId);
                return (
                    <div className="fixed inset-0 z-50 overflow-hidden pointer-events-auto" onClick={leaveRoom}>
                        {/* 深色背景 */}
                        <div className="absolute inset-0 bg-black/80" />

                        {/* Confetti 彩纸 */}
                        {Array.from({ length: 40 }).map((_, i) => {
                            const colors = ["#FFD700", "#FF6B6B", "#4ECDC4", "#45B7D1", "#96CEB4", "#FFEAA7", "#DDA0DD", "#FF9FF3"];
                            const color = colors[i % colors.length];
                            const left = Math.random() * 100;
                            const delay = Math.random() * 2;
                            const duration = 2 + Math.random() * 2;
                            return (
                                <div
                                    key={i}
                                    className="absolute w-3 h-3 rounded-sm"
                                    style={{
                                        backgroundColor: color,
                                        left: `${left}%`,
                                        top: "-12px",
                                        animation: `confettiFall ${duration}s ease-out ${delay}s infinite`,
                                        "--fall-delay": `${delay}s`,
                                    } as React.CSSProperties}
                                />
                            );
                        })}

                        {/* 获胜弹窗 */}
                        <div className="absolute inset-0 flex items-center justify-center p-4">
                            <div
                                className="card p-8 text-center max-w-sm mx-4 border-2 border-[var(--pixel-gold)]"
                                style={{
                                    animation: "winnerAppear 0.8s ease-out forwards",
                                    boxShadow: "0 0 40px var(--pixel-gold), 0 0 80px rgba(255, 215, 0, 0.5)",
                                }}
                            >
                                {/* 奖杯 */}
                                <div
                                    className="text-7xl mb-4"
                                    style={{
                                        animation: "trophyBounce 1s ease-out 0.5s both",
                                        filter: "drop-shadow(0 0 20px rgba(255, 215, 0, 0.8))",
                                    }}
                                >
                                    🏆
                                </div>

                                {/* 获胜文字 */}
                                <h2
                                    className="text-3xl font-bold mb-2"
                                    style={{
                                        color: "var(--pixel-gold)",
                                        textShadow: "0 0 20px var(--pixel-gold), 0 0 40px rgba(255, 215, 0, 0.5)",
                                        animation: "winnerTextGlow 2s ease-in-out infinite",
                                    }}
                                >
                                    恭喜获胜！
                                </h2>

                                {/* 获胜者昵称 */}
                                <p className="text-xl text-white mb-2">
                                    <span className="text-[var(--pixel-gold)] font-bold">{winner?.nickname}</span>
                                </p>

                                {/* 最终得分 */}
                                <p className="text-lg text-[var(--text-secondary)] mb-6">
                                    最终得分：<strong className="text-[var(--pixel-gold)]">{winner?.score}</strong> 分
                                </p>

                                {/* 返回大厅按钮 */}
                                <button
                                    className="btn-arcade btn-arcade-green w-full text-lg py-3"
                                    onClick={leaveRoom}
                                >
                                    返回大厅
                                </button>
                            </div>
                        </div>
                    </div>
                );
            })()}

            {/* 回合历史记录按钮（悬浮） */}
            <RoundHistory />

            {/* 回合结束得分汇总 */}
            <RoundSummary />
        </div>
    );
}
