"use client";

import { memo, useState, useEffect, useRef } from "react";
import type { Player } from "@/types";
import { GameCard, CardBack } from "../atoms/GameCard";
import { calculateRoundScore } from "@/utils/calculateScore";

interface PlayerAreaProps {
    player: Player;
    isSelf?: boolean;
    isActive?: boolean;
    position: "top" | "bottom" | "left" | "right";
    /** 行动牌目标选择：是否可选 */
    isTargetable?: boolean;
    /** 行动牌目标选择：点击回调 */
    onSelectTarget?: () => void;
    /** 手牌显示模式：face-up=真实牌面, face-down=仅牌背 */
    cardDisplay?: "faceUp" | "faceDown";
    /** 手牌尺寸 */
    cardSize?: "xs" | "sm" | "md" | "lg";
    /** 当前回合玩家头像颜色 */
    avatarColor?: "gold" | "blue" | "red" | "green" | "purple";
}

/**
 * 玩家区域组件 - 显示昵称、手牌、分数
 * 支持 self（face-up + 彩色头像）和 opponent（face-down 牌背）
 * 使用 React.memo 防止不必要的重新渲染
 */
export const PlayerArea = memo(function PlayerArea({
    player,
    isSelf = false,
    isActive = false,
    position = "bottom",
    isTargetable = false,
    onSelectTarget,
    cardDisplay = "faceUp",
    cardSize = "md",
    avatarColor = "blue",
}: PlayerAreaProps) {
    const [newCardId, setNewCardId] = useState<string | null>(null);
    const prevHandLengthRef = useRef(player.hand.length);

    useEffect(() => {
        if (player.hand.length > prevHandLengthRef.current && player.hand.length > 0) {
            const lastCard = player.hand[player.hand.length - 1];
            setNewCardId(lastCard.id);
            const timer = setTimeout(() => setNewCardId(null), 400);
            prevHandLengthRef.current = player.hand.length;
            return () => clearTimeout(timer);
        }
        prevHandLengthRef.current = player.hand.length;
    }, [player.hand]);

    const isHorizontal = position === "top" || position === "bottom";
    const handScore = player.hand.length > 0 ? calculateRoundScore(player.hand) : 0;

    return (
        <div
            className={`
                flex ${isHorizontal ? "flex-col" : "flex-row"} items-center gap-2 p-3 rounded-xl transition-all
                ${isActive ? "ring-2 ring-[var(--pixel-gold)] turn-active" : ""}
                ${isTargetable ? "ring-2 ring-yellow-400 cursor-pointer hover:ring-yellow-300 hover:scale-105 animate-pulse" : ""}
                ${isSelf ? "bg-[var(--bg-card)]" : "bg-[var(--bg-card)]/50"}
            `}
            onClick={isTargetable && onSelectTarget ? onSelectTarget : undefined}
        >
            {/* 玩家信息（头像 + 名字 + 分数） */}
            <div className="flex items-center gap-2 w-full">
                <div className={`pixel-avatar ${avatarColor}-bg ${isActive ? "turn-active" : ""}`}
                    style={{ width: "26px", height: "26px", fontSize: "11px" }}>
                    {isSelf ? "你" : player.nickname.charAt(0).toUpperCase()}
                </div>
                <span className={`font-semibold text-sm ${isActive ? "text-[var(--pixel-gold)]" : "text-[var(--text-primary)]"}`}>
                    {player.nickname}
                </span>
                {player.isHost && (
                    <span className="text-yellow-400 text-xs px-1.5 py-0.5 bg-yellow-400/10 rounded">房主</span>
                )}
                {!player.isConnected && (
                    <span className="text-red-400 text-xs px-1.5 py-0.5 bg-red-400/10 rounded">离线</span>
                )}

                {/* 右侧：分数 + 手牌数 + 状态标记 */}
                <div className="ml-auto flex items-center gap-2">
                    {/* 卡牌数量标记 */}
                    {cardDisplay === "faceDown" && player.hand.length > 0 && (
                        <span className="text-[var(--text-muted)] text-xs">· {player.hand.length}张</span>
                    )}
                    {/* 总积分 */}
                    <span className={`font-bold text-sm tabular-nums ${
                        player.score >= 150
                            ? "text-red-400"
                            : player.score >= 100
                            ? "text-yellow-400"
                            : "text-[var(--pixel-gold)]"
                    }`}>
                        {player.score}
                    </span>
                    {/* 本回合手牌得分 */}
                    {!isSelf && player.hand.length > 0 && cardDisplay === "faceUp" && (
                        <span className={`text-xs font-semibold tabular-nums ${
                            handScore >= 50 ? "text-yellow-400" : "text-green-400"
                        }`}>
                            +{handScore}
                        </span>
                    )}
                    {player.hasBusted && (
                        <span className="text-red-400 text-xs font-bold">💥</span>
                    )}
                    {player.isOut && !player.hasBusted && player.hand.length === 0 && (
                        <span className="text-[var(--text-muted)] text-xs">✓</span>
                    )}
                </div>
            </div>

            {/* 手牌区域 */}
            {cardDisplay === "faceDown" ? (
                /* 对手：显示 N 张牌背 */
                <div className={`flex ${isHorizontal ? "flex-row" : "flex-col"} gap-1 flex-wrap justify-center ${isHorizontal ? "max-w-[280px]" : "max-h-[200px]"}`}>
                    {player.hand.length === 0 ? (
                        <span className="text-[var(--text-muted)] text-xs py-2">无手牌</span>
                    ) : (
                        player.hand.map((_, i) => (
                            <CardBack key={`${player.id}-back-${i}`} size={cardSize} />
                        ))
                    )}
                </div>
            ) : (
                /* 自己：显示真实卡牌（可交互） */
                <div className={`flex ${isHorizontal ? "flex-row" : "flex-col"} gap-1 flex-wrap justify-center ${isHorizontal ? "max-w-[280px]" : "max-h-[200px]"}`}>
                    {player.hand.length === 0 ? (
                        <span className="text-[var(--text-muted)] text-xs py-2">无手牌</span>
                    ) : (
                        player.hand.map((card) => (
                            <GameCard
                                key={card.id}
                                card={card}
                                size={cardSize}
                                isNew={card.id === newCardId}
                                hoverable={isSelf}
                            />
                        ))
                    )}
                </div>
            )}

            {/* 手牌得分提示（仅自己可见） */}
            {isSelf && player.hand.length > 0 && (
                <div className="w-full text-center mt-1">
                    <span className="text-[var(--text-muted)] text-xs">手牌得分 </span>
                    <span className={`font-bold text-sm tabular-nums ${
                        handScore >= 50 ? "text-yellow-400" : handScore >= 30 ? "text-[var(--pixel-gold)]" : "text-green-400"
                    }`}>
                        +{handScore}
                    </span>
                </div>
            )}

            {/* 状态标记 */}
            {player.hasBusted && (
                <span className="text-red-400 text-xs font-bold uppercase">BUST</span>
            )}
            {player.isOut && !player.hasBusted && (
                <span className="text-[var(--text-muted)] text-xs">已结算</span>
            )}
        </div>
    );
});
