"use client";

import { useCallback, useState, useEffect, useRef } from "react";
import { useGameStore } from "@/store/gameStore";
import { useGameSocket } from "@/hooks/useGameSocket";
import { PlayerArea } from "./PlayerArea";
import { DeckPile } from "../atoms/DeckPile";
import { DiscardPile } from "../atoms/DiscardPile";
import { FlipCard } from "../atoms/FlipCard";
import { RoundHistory } from "../molecules/RoundHistory";
import { RoundSummary } from "../molecules/RoundSummary";
import { calculateRoundScore, isFlipSeven } from "@/utils/calculateScore";
import { getCardImage } from "@/utils";
import type { Card } from "@/types";

/** 翻牌动画阶段 */
type FlipPhase = "idle" | "showing_back" | "flipping" | "enlarged" | "entering_hand" | "busted" | "flip7";

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
    const flipTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const flipPhaseRef = useRef<FlipPhase>("idle");
    flipPhaseRef.current = flipPhase;
    const lastHistoryLenRef = useRef(0);
    const waitingForFlipRef = useRef(false);
    const lastFlipRef = useRef<Card | null>(null);

    // ── 回合提示状态 ──
    type RoundDisplay = { type: "start"; round: number; playerName: string } | { type: "end"; round: number } | null;
    const [roundDisplay, setRoundDisplay] = useState<RoundDisplay>(null);
    const lastRoundRef = useRef(0);

    // ── 计算当前手牌得分 ──
    const selfPlayer = state?.players.find((p) => p.id === selfId);

    // ── 翻牌后：检测新的 history 条目并展示得分 ──
    useEffect(() => {
        if (!state) return;

        const newEntries = state.history.slice(lastHistoryLenRef.current);
        if (newEntries.length > 0) {
            const latest = newEntries[newEntries.length - 1];
            if (latest.scoreGained > 0) {
                setScoreToastMsg(`${state.players[latest.playerId]?.nickname} +${latest.scoreGained} 分`);
                setScoreToastPositive(true);
                setShowScoreToast(true);
                setTimeout(() => setShowScoreToast(false), 2500);
            } else if (latest.isBust) {
                setScoreToastMsg(`${state.players[latest.playerId]?.nickname} 爆牌 +0 分`);
                setScoreToastPositive(false);
                setShowScoreToast(true);
                setTimeout(() => setShowScoreToast(false), 2500);
            }
            lastHistoryLenRef.current = state.history.length;
        }
    }, [state]);

    // ── 捕获翻牌结果 ──
    useEffect(() => {
        if (waitingForFlipRef.current && state?.lastFlip) {
            setFlippedCard(state.lastFlip);
            lastFlipRef.current = state.lastFlip;
        }
    }, [state?.lastFlip]);

    // ── 当不是自己的回合时，重置动画状态 ──
    useEffect(() => {
        if (!state || !selfId) return;
        if (state.currentPlayerId !== selfId && flipPhase !== "idle") {
            setFlipPhase("idle");
            setFlippedCard(null);
            setPreBustHand([]);
            setFlip7Score(0);
            waitingForFlipRef.current = false;
            if (flipTimerRef.current) {
                clearTimeout(flipTimerRef.current);
                flipTimerRef.current = null;
            }
        }
    }, [state?.currentPlayerId, selfId, flipPhase]);

    // ── 当 round 或 phase 变化时，强制重置动画（防 state_sync 竞争） ──
    useEffect(() => {
        if (!state) return;
        // 动画进行中但轮次或阶段变了 → 强制中断动画
        if (flipPhase !== "idle" && state.phase !== "playing") {
            if (flipTimerRef.current) {
                clearTimeout(flipTimerRef.current);
                flipTimerRef.current = null;
            }
            setFlipPhase("idle");
            setFlippedCard(null);
            setPreBustHand([]);
            setFlip7Score(0);
            waitingForFlipRef.current = false;
        }
    }, [state?.roundNumber, state?.phase, flipPhase]);

    // ── 检测其他玩家翻牌 ──
    useEffect(() => {
        if (!state || !state.lastFlip || !selfId) return;

        const lastFlipPlayer = state.currentPlayerId !== selfId
            ? state.currentPlayerId
            : null;

        if (lastFlipPlayer !== null && flipPhase === "idle" && lastFlipRef.current !== state.lastFlip) {
            setOtherPlayerFlip({ playerId: lastFlipPlayer, card: state.lastFlip });
            lastFlipRef.current = state.lastFlip;

            setTimeout(() => {
                setOtherPlayerFlip(null);
            }, 1500);
        }
    }, [state?.lastFlip, state?.currentPlayerId, selfId, flipPhase]);

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
            setTimeout(() => setRoundDisplay(null), 2000);
            return;
        }

        if (currentRound > lastRoundRef.current) {
            // 如果动画进行中，等动画结束后再显示
            if (flipPhase !== "idle") {
                const checkInterval = setInterval(() => {
                    // 读取 ref 来避免 TypeScript 闭包收窄问题
                    if (flipPhaseRef.current === "idle") {
                        clearInterval(checkInterval);
                        setRoundDisplay({ type: "end", round: lastRoundRef.current });
                    }
                }, 100);
                setTimeout(() => {
                    clearInterval(checkInterval);
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

        const timer = setTimeout(() => {
            const startPlayer = state.players.find((p) => p.id === state.currentPlayerId);
            setRoundDisplay({
                type: "start",
                round: state.roundNumber,
                playerName: startPlayer?.nickname ?? "???",
            });

            setTimeout(() => {
                setRoundDisplay(null);
            }, 2000);
        }, 3000);

        return () => clearTimeout(timer);
    }, [roundDisplay, state]);

    // ── 翻牌操作：启动动画序列 ──
    const handleFlip = useCallback(() => {
        if (!isMyTurn() || state?.phase !== "playing") return;
        if (flipPhase !== "idle") return;

        lastHistoryLenRef.current = state?.history.length ?? 0;

        const currentHand = state?.players.find((p) => p.id === selfId)?.hand ?? [];
        setPreBustHand([...currentHand]);

        waitingForFlipRef.current = true;
        actionFlip();

        setFlipPhase("showing_back");
        setFlippedCard(null);

        flipTimerRef.current = setTimeout(() => {
            setFlipPhase("flipping");

            flipTimerRef.current = setTimeout(() => {
                setFlipPhase("enlarged");

                flipTimerRef.current = setTimeout(() => {
                    setFlipPhase("entering_hand");
                }, 800);
            }, 800);
        }, 200);
    }, [isMyTurn, state, actionFlip, confirmFlip, flipPhase, selfId]);

    // ── 检测 state 变化，驱动动画后续阶段 ──
    useEffect(() => {
        if (!state || flipPhase !== "entering_hand" || !waitingForFlipRef.current) return;

        const selfNow = state.players.find((p) => p.id === selfId);
        if (!selfNow) return;

        if (selfNow.hasBusted) {
            setFlipPhase("busted");
            flipTimerRef.current = setTimeout(() => {
                setFlipPhase("idle");
                setFlippedCard(null);
                setPreBustHand([]);
                waitingForFlipRef.current = false;
                confirmFlip();
            }, 1000);
        } else if (isFlipSeven(selfNow.hand)) {
            const score = calculateRoundScore(selfNow.hand, 15);
            setFlip7Score(score);
            setFlipPhase("flip7");
            flipTimerRef.current = setTimeout(() => {
                setFlipPhase("idle");
                setFlippedCard(null);
                setPreBustHand([]);
                setFlip7Score(0);
                waitingForFlipRef.current = false;
                confirmFlip();
            }, 2000);
        } else {
            setFlipPhase("idle");
            setFlippedCard(null);
            setPreBustHand([]);
            waitingForFlipRef.current = false;
            confirmFlip();
        }
    }, [state, flipPhase, selfId, confirmFlip]);

    // ── 手动跳过动画 ──
    const handleSkipAnimation = useCallback(() => {
        if (flipTimerRef.current) clearTimeout(flipTimerRef.current);
        if (flipPhase === "enlarged" || flipPhase === "busted" || flipPhase === "flip7") {
            setFlipPhase("idle");
            setFlippedCard(null);
            setPreBustHand([]);
            setFlip7Score(0);
            waitingForFlipRef.current = false;
            confirmFlip();
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
            actionTarget(targetId);
            setFlipPhase("idle");
            setFlippedCard(null);
        },
        [actionTarget]
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
    const needsTargetSelection = !!(
        pendingAction &&
        pendingAction.actorId === selfId &&
        pendingAction.targetId === null
    );

    const targetablePlayers = state.players.filter(
        (p) => {
            if (p.id === selfId || p.isOut || p.skipped) return false;
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

                {/* ── 对手 1：顶部横排（6张正面，缩小间距） ── */}
                {topOpponent && (
                    <PlayerArea
                        player={topOpponent}
                        isActive={state.currentPlayerId === topOpponent.id}
                        position="bottom"
                        cardDisplay="faceUp"
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

                {/* ── 中间对手：并排（5张正面，缩小间距） ── */}
                {middleOpponents.length > 0 && (
                    <div className="flex gap-1.5">
                        {middleOpponents.map((opp, i) => (
                            <div key={opp.id} className="flex-1 min-w-0">
                                <PlayerArea
                                    player={opp}
                                    isActive={state.currentPlayerId === opp.id}
                                    position="bottom"
                                    cardDisplay="faceUp"
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
                    {state.phase === "playing" && (
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
                    <div className="mt-auto">
                        <PlayerArea
                            player={selfP}
                            isSelf
                            isActive={state.currentPlayerId === selfP.id}
                            position="bottom"
                            cardDisplay="faceUp"
                            cardSize="md"
                            avatarColor="gold"
                        />
                    </div>
                )}
            </div>

            {/* ══════════ 翻牌动画（Motion） ══════════ */}
            <FlipCard
                phase={flipPhase as "idle" | "showing_back" | "flipping" | "enlarged" | "entering_hand"}
                card={flippedCard}
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

            {/* ══════════ 爆牌动画 ══════════ */}
            {flipPhase === "busted" && (
                <div className="fixed inset-0 z-50 flex items-center justify-center pointer-events-auto" onClick={handleSkipAnimation}>
                    {preBustHand.length > 0 && (
                        <div className="absolute inset-0 flex items-center justify-center">
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
                    <div className="text-center relative z-10" style={{ animation: "bustShake 0.5s ease-in-out" }}>
                        <div className="text-8xl mb-4" style={{ animation: "bustExplode 0.8s ease-out forwards" }}>
                            💥
                        </div>
                        <div
                            className="bg-red-500/90 text-white font-bold text-2xl px-8 py-4 rounded-2xl shadow-2xl"
                            style={{ animation: "bustTextAppear 0.4s ease-out 0.3s both" }}
                        >
                            爆牌！
                        </div>
                    </div>
                    <p className="absolute bottom-8 left-1/2 -translate-x-1/2 text-white/60 text-xs pointer-events-none"
                        style={{ animation: "bustTextAppear 0.4s ease-out 0.5s both" }}>
                        点击跳过
                    </p>
                </div>
            )}

            {/* ══════════ 其他玩家翻牌动画 ══════════ */}
            {otherPlayerFlip && flipPhase === "idle" && !roundDisplay && (
                <div className="fixed top-1/4 left-1/2 -translate-x-1/2 z-40 pointer-events-none">
                    <div className="text-center" style={{ animation: "bounceIn 0.4s ease-out" }}>
                        <p className="text-[var(--text-secondary)] text-sm mb-2">
                            <span className="text-[var(--pixel-gold)] font-semibold">
                                {state.players[otherPlayerFlip.playerId]?.nickname}
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
