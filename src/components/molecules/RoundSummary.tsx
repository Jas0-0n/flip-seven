"use client";

import { useEffect, useState } from "react";
import { useGameStore } from "@/store/gameStore";
import type { Card } from "@/types";
import { getCardImage } from "@/utils";

/**
 * 回合结束得分汇总弹窗
 * 显示本轮所有玩家的得分和翻牌记录
 */
export function RoundSummary() {
    const { state } = useGameStore();
    const [show, setShow] = useState(false);
    const [roundData, setRoundData] = useState<{
        round: number;
        entries: Array<{
            playerId: number;
            nickname: string;
            scoreGained: number;
            isBust: boolean;
            isFlip7: boolean;
            flippedCards?: Card[];
            triggerCard?: Card;
        }>;
    } | null>(null);

    useEffect(() => {
        if (!state || state.history.length === 0) return;

        // 检测新一轮开始（roundNumber 变化）
        const lastRound = state.history[state.history.length - 1]?.round;
        const currentRound = state.roundNumber;

        if (lastRound && lastRound < currentRound && state.phase === "playing") {
            // 获取上一轮的所有记录
            const prevRoundEntries = state.history.filter((h) => h.round === lastRound);

            if (prevRoundEntries.length > 0) {
                setRoundData({
                    round: lastRound,
                    entries: prevRoundEntries.map((e) => ({
                        playerId: e.playerId,
                        nickname: state.players[e.playerId]?.nickname ?? "???",
                        scoreGained: e.scoreGained,
                        isBust: e.isBust,
                        isFlip7: e.isFlip7,
                        flippedCards: e.flippedCards,
                        triggerCard: e.triggerCard,
                    })),
                });
                setShow(true);

                // 4秒后自动关闭
                setTimeout(() => setShow(false), 4000);
            }
        }
    }, [state?.roundNumber, state?.phase]);

    if (!show || !roundData) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 pointer-events-none">
            <div className="card p-6 max-w-sm w-full mx-4 animate-bounce-in max-h-[80vh] overflow-y-auto">
                <h3 className="text-lg font-bold text-center mb-4">
                    第 {roundData.round} 轮结束
                </h3>

                <div className="space-y-3">
                    {roundData.entries.map((entry) => (
                        <div
                            key={entry.playerId}
                            className="bg-bg-card-hover rounded-xl p-3"
                        >
                            {/* 玩家信息 + 得分 */}
                            <div className="flex items-center justify-between mb-2">
                                <div className="flex items-center gap-2">
                                    <span className="font-semibold">{entry.nickname}</span>
                                    {entry.isBust && (
                                        <span className="text-red-400 text-xs">💥爆牌</span>
                                    )}
                                    {entry.isFlip7 && (
                                        <span className="text-yellow-400 text-xs">🎉七连翻</span>
                                    )}
                                </div>
                                <span
                                    className={`font-bold text-lg tabular-nums ${
                                        entry.scoreGained > 0
                                            ? "text-green-400"
                                            : entry.scoreGained < 0
                                            ? "text-red-400"
                                            : "text-text-muted"
                                    }`}
                                >
                                    {entry.scoreGained > 0 ? `+${entry.scoreGained}` : entry.scoreGained}
                                </span>
                            </div>

                            {/* 翻牌记录 */}
                            {entry.flippedCards && entry.flippedCards.length > 0 && (
                                <div className="mt-2">
                                    <p className="text-text-muted text-xs mb-1.5">翻牌记录：</p>
                                    <div className="flex flex-wrap gap-1">
                                        {entry.flippedCards.map((card, j) => (
                                            <div
                                                key={j}
                                                className={`w-8 h-11 rounded overflow-hidden shadow ${
                                                    entry.isBust && j === entry.flippedCards!.length - 1
                                                        ? "ring-2 ring-red-500"
                                                        : ""
                                                }`}
                                            >
                                                <img
                                                    src={getCardImage(card)}
                                                    alt={`card-${card.type}`}
                                                    className="w-full h-full object-contain"
                                                    draggable={false}
                                                />
                                            </div>
                                        ))}
                                    </div>
                                    {entry.triggerCard && entry.isBust && (
                                        <p className="text-red-400 text-xs mt-1">
                                            翻到重复数字 {entry.triggerCard.value}，爆牌！
                                        </p>
                                    )}
                                </div>
                            )}
                        </div>
                    ))}
                </div>

                <p className="text-text-muted text-xs text-center mt-4">
                    下一轮即将开始...
                </p>
            </div>
        </div>
    );
}
