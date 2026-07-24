"use client";

import { useState } from "react";
import { useGameStore } from "@/store/gameStore";
import type { Card } from "@/types";

/** 获取卡牌显示标签 */
const getCardLabel = (card: Card): string => {
    switch (card.type) {
        case "number": return `${card.value}`;
        case "score": return `+${card.value}`;
        case "double": return "×2";
        case "freeze": return "❄️";
        case "flipthree": return "🃏";
        case "revive": return "🔄";
        default: return "?";
    }
};

/**
 * 回合历史记录按钮 + 面板
 */
export function RoundHistory() {
    const [isOpen, setIsOpen] = useState(false);
    const [selectedCell, setSelectedCell] = useState<string | null>(null);
    const { state } = useGameStore();

    if (!state) return null;

    // 按轮次分组
    const rounds = state.history.reduce((acc, entry) => {
        if (!acc[entry.round]) {
            acc[entry.round] = [];
        }
        acc[entry.round].push(entry);
        return acc;
    }, {} as Record<number, typeof state.history>);

    const roundNumbers = Object.keys(rounds).map(Number).sort((a, b) => a - b);

    const getEntry = (playerId: number, round: number) => {
        return rounds[round]?.find((e) => e.playerId === playerId);
    };

    const getCumulativeScore = (playerId: number) => {
        return state.players.find((player) => player.id === playerId)?.score ?? 0;
    };

    /** 获取某轮中触发七连翻的玩家 */
    const getFlip7Trigger = (round: number) => {
        const entry = rounds[round]?.find((e) => e.isFlip7);
        return entry ?? null;
    };

    /** 某轮次数值行是否有七连翻 */
    const hasFlip7InRound = (round: number) => {
        return rounds[round]?.some((e) => e.isFlip7) ?? false;
    };

    const toggleCell = (key: string) => {
        setSelectedCell((prev) => (prev === key ? null : key));
    };

    /** 根据卡牌类型和状态获取高亮颜色 */
    const getCardHighlight = (card: Card, entry: { isBust: boolean; isFlip7: boolean; flippedCards?: Card[] }, index: number): string => {
        if (card.type !== "number") return "";

        if (entry.isBust && entry.flippedCards && entry.flippedCards.length > 0) {
            const seen = new Map<number, number[]>();
            entry.flippedCards.forEach((c, i) => {
                if (c.type === "number") {
                    const arr = seen.get(c.value) || [];
                    arr.push(i);
                    seen.set(c.value, arr);
                }
            });
            let dupIndices: number[] = [];
            seen.forEach((indices) => {
                if (indices.length > 1) {
                    dupIndices = [...dupIndices, ...indices];
                }
            });
            if (dupIndices.includes(index)) {
                return "bg-red-500/30 text-red-400 ring-1 ring-red-500/50";
            }
            return "text-text-primary";
        }

        if (entry.isFlip7) {
            return "bg-orange-500/30 text-orange-400 ring-1 ring-orange-500/50";
        }

        if (!entry.isBust && !entry.isFlip7) {
            return "bg-green-500/30 text-green-400 ring-1 ring-green-500/50";
        }

        return "";
    };

    return (
        <>
            {/* 触发按钮 - 悬浮在玩家区域上方 */}
            <button
                type="button"
                className="fixed z-[100] bg-bg-card border border-bg-card-hover rounded-full px-3 py-2 shadow-lg hover:scale-105 active:scale-95 transition-all flex items-center gap-1.5 select-none"
                style={{ bottom: "42%", right: "16px" }}
                onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setIsOpen(true);
                }}
            >
                <span className="text-sm">📜</span>
                <span className="text-xs text-text-secondary">记录</span>
            </button>

            {/* 面板 */}
            {isOpen && (
                <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 p-4">
                    <div className="card max-w-2xl w-full max-h-[80vh] overflow-hidden flex flex-col animate-slide-up">
                        {/* 标题 */}
                        <div className="flex items-center justify-between p-4 border-b border-bg-card-hover">
                            <h2 className="font-bold">📜 回合记录</h2>
                            <button
                                className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-bg-card-hover transition-colors"
                                onClick={() => setIsOpen(false)}
                            >
                                ✕
                            </button>
                        </div>

                        {/* 表格内容 */}
                        <div className="flex-1 overflow-auto p-4">
                            {roundNumbers.length === 0 ? (
                                <p className="text-text-muted text-center text-sm py-8">暂无记录</p>
                            ) : (
                                <table className="w-full border-collapse">
                                    {/* 表头：玩家名 */}
                                    <thead>
                                        <tr>
                                            <th className="text-left text-text-secondary text-sm font-semibold px-3 py-2 border-b border-bg-card-hover sticky left-0 bg-bg-card z-20">
                                                轮次
                                            </th>
                                            {state.players.map((player) => (
                                                <th
                                                    key={player.id}
                                                    className="text-center text-text-secondary text-sm font-semibold px-3 py-2 border-b border-bg-card-hover sticky top-0 bg-bg-card z-20"
                                                >
                                                    {player.nickname}
                                                    {player.id === state.winnerId && (
                                                        <span className="text-yellow-400 ml-1">👑</span>
                                                    )}
                                                </th>
                                            ))}
                                        </tr>
                                    </thead>
                                    <thead>
                                        <tr className="bg-bg-card-hover/50">
                                            <th className="text-left text-accent text-sm font-bold px-3 py-2 border-b border-bg-card-hover sticky left-0 bg-bg-card-hover/50 z-20">
                                                总分
                                            </th>
                                            {state.players.map((player) => (
                                                <th
                                                    key={player.id}
                                                    className="text-center px-3 py-2 border-b border-bg-card-hover sticky top-[36px] bg-bg-card-hover/50 z-20"
                                                >
                                                    <span
                                                        className={`font-bold text-sm tabular-nums ${
                                                            getCumulativeScore(player.id) >= 150
                                                                ? "text-red-400"
                                                                : getCumulativeScore(player.id) >= 100
                                                                ? "text-yellow-400"
                                                                : "text-accent"
                                                        }`}
                                                    >
                                                        {getCumulativeScore(player.id)}
                                                    </span>
                                                </th>
                                            ))}
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {roundNumbers.map((round) => {
                                            const flip7Entry = getFlip7Trigger(round);
                                            return (
                                                <tr
                                                    key={round}
                                                    className={`hover:bg-bg-card-hover/50 transition-colors ${flip7Entry ? "bg-orange-500/5" : ""}`}
                                                >
                                                    <td className="text-text-secondary text-sm font-semibold px-3 py-2 border-b border-bg-card-hover/50 sticky left-0 bg-bg-card">
                                                        第 {round} 轮
                                                    </td>
                                                    {state.players.map((player) => {
                                                        const entry = getEntry(player.id, round);
                                                        const cellKey = `${player.id}-${round}`;
                                                        const isExpanded = selectedCell === cellKey;

                                                        return (
                                                            <td
                                                                key={player.id}
                                                                className="text-center px-2 py-2 border-b border-bg-card-hover/50"
                                                            >
                                                                {entry ? (
                                                                    <>
                                                                        <div
                                                                            className={`cursor-pointer rounded-lg px-2 py-1 transition-all ${
                                                                                isExpanded ? "bg-bg-card-hover" : "hover:bg-bg-card-hover/50"
                                                                            }`}
                                                                            onClick={() => toggleCell(cellKey)}
                                                                        >
                                                                            <span
                                                                                className={`font-bold text-sm tabular-nums ${
                                                                                    entry.isFlip7
                                                                                        ? "text-orange-400"
                                                                                        : entry.scoreGained > 0
                                                                                        ? "text-green-400"
                                                                                        : entry.isBust
                                                                                        ? "text-red-400"
                                                                                        : "text-text-muted"
                                                                                }`}
                                                                            >
                                                                                {entry.isFlip7
                                                                                    ? `🎉+${entry.scoreGained}`
                                                                                    : entry.scoreGained > 0
                                                                                    ? `+${entry.scoreGained}`
                                                                                    : entry.isBust
                                                                                    ? "💥0"
                                                                                    : entry.scoreGained}
                                                                            </span>

                                                                        </div>
                                                                        {isExpanded && (
                                                                            <div className="mt-2 bg-bg-card-hover rounded-lg p-2 text-left">
                                                                                <div className="flex items-center gap-1.5 mb-2 flex-wrap">
                                                                                    {entry.actions.includes("freeze") && (
                                                                                        <span className="text-xs bg-cyan-500/20 text-cyan-400 px-1.5 py-0.5 rounded">❄️ 冻结结算</span>
                                                                                    )}
                                                                                </div>
                                                                                {entry.flippedCards && entry.flippedCards.length > 0 ? (
                                                                                    <div className="flex flex-wrap gap-1">
                                                                                        {entry.flippedCards.map((card, j) => {
                                                                                            const highlight = getCardHighlight(card, entry, j);
                                                                                            return (
                                                                                                <span
                                                                                                    key={j}
                                                                                                    className={`inline-flex items-center justify-center w-7 h-7 rounded-lg text-xs font-bold ${highlight || "bg-bg-card text-text-primary"}`}
                                                                                                >
                                                                                                    {getCardLabel(card)}
                                                                                                </span>
                                                                                            );
                                                                                        })}
                                                                                    </div>
                                                                                ) : (
                                                                                    <p className="text-text-muted text-xs">暂无翻牌记录</p>
                                                                                )}
                                                                                {entry.isBust && entry.triggerCard && (
                                                                                    <p className="text-red-400 text-[10px] mt-1.5">
                                                                                        翻到重复数字 {entry.triggerCard.value}，爆牌！
                                                                                    </p>
                                                                                )}
                                                                                {entry.isFlip7 && entry.triggerCard && (
                                                                                    <p className="text-orange-400 text-[10px] mt-1.5">
                                                                                        翻到 {entry.triggerCard.value}，达成七连翻！
                                                                                    </p>
                                                                                )}
                                                                            </div>
                                                                        )}
                                                                    </>
                                                                ) : (
                                                                    <span className="text-text-muted text-sm">-</span>
                                                                )}
                                                            </td>
                                                        );
                                                    })}
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            )}

                            {/* 图例 */}
                            <div className="flex flex-wrap gap-3 text-xs text-text-muted">
                                <span>💥 爆牌</span>
                                <span>🎉 七连翻（触发者额外 +15，其他人自动结算）</span>
                                <span>❄️ 冻结（目标手牌立即结算）</span>
                                <span className="text-accent">点击查看翻牌详情</span>
                            </div>
                        </div>

                        {/* 底部 */}
                        <div className="p-4 border-t border-bg-card-hover">
                            <button
                                className="btn-arcade w-full text-sm"
                                onClick={() => setIsOpen(false)}
                            >
                                关闭
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
}
