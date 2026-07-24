"use client";

import { memo, useState, useEffect, useRef, useMemo } from "react";
import type { Player } from "@/types";
import { GameCard, CardBack } from "../atoms/GameCard";
import { calculateRoundScore } from "@/utils/calculateScore";
import { sortHandForDisplay } from "@/utils/cardSort";

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
  /** 横向手牌每行最多显示的牌数 */
  cardsPerRow?: number;
  /** 手牌尺寸 */
  cardSize?: "xs" | "sm" | "md" | "lg";
  /** 当前回合玩家头像颜色 */
  avatarColor?: "gold" | "blue" | "red" | "green" | "purple";
  /** 动画期间需要隐藏的新牌 ID（避免飞入前穿帮） */
  hiddenCardId?: string | null;
  /** 动画期间需要隐藏的多张牌 ID（flip3 逐张队列） */
  hiddenCardIds?: string[];
  /** 最近一次完成飞入的新牌 ID（用于触发高亮/翻转） */
  animatingCardId?: string | null;
}

function chunkItems<T>(items: T[], size?: number): T[][] {
  if (!size || size <= 0) return [items];
  const rows: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    rows.push(items.slice(index, index + size));
  }
  return rows;
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
  cardsPerRow,
  cardSize = "md",
  avatarColor = "blue",
  hiddenCardId,
  hiddenCardIds = [],
  animatingCardId,
}: PlayerAreaProps) {
  const [newCardId, setNewCardId] = useState<string | null>(null);
  const prevHandLengthRef = useRef(player.hand.length);

  useEffect(() => {
    // 当手牌增加且存在 animatingCardId 时，标记为新牌并触发翻转高亮
    if (
      player.hand.length > prevHandLengthRef.current &&
      player.hand.length > 0
    ) {
      const targetId = animatingCardId ?? player.hand[player.hand.length - 1]?.id;
      if (targetId) {
        setNewCardId(targetId);
        const timer = setTimeout(() => setNewCardId(null), 400);
        prevHandLengthRef.current = player.hand.length;
        return () => clearTimeout(timer);
      }
    }
    prevHandLengthRef.current = player.hand.length;
  }, [player.hand, animatingCardId]);

  const isHorizontal = position === "top" || position === "bottom";
  const handScore = player.hand.length > 0 ? calculateRoundScore(player.hand) : 0;

  // 纯展示排序，并过滤动画中隐藏的新牌
  const displayHand = useMemo(() => {
    const sorted = sortHandForDisplay(player.hand);
    const hiddenIds = new Set(hiddenCardId ? [hiddenCardId, ...hiddenCardIds] : hiddenCardIds);
    return hiddenIds.size > 0 ? sorted.filter((c) => !hiddenIds.has(c.id)) : sorted;
  }, [player.hand, hiddenCardId, hiddenCardIds]);

  return (
    <div
      className={`
        flex ${isHorizontal ? "flex-col" : "flex-row"} items-center gap-2 p-3 rounded-xl transition-[transform,box-shadow,border-color] duration-200
        ${isActive ? "ring-2 ring-[var(--pixel-gold)] turn-active" : ""}
        ${isTargetable ? "ring-2 ring-yellow-400 cursor-pointer hover:ring-yellow-300 animate-pulse" : ""}
        ${isSelf ? "bg-[var(--bg-card)] w-full" : "bg-[var(--bg-card)]/50"}
      `}
      onClick={isTargetable && onSelectTarget ? onSelectTarget : undefined}
      onKeyDown={(event) => {
        if (!isTargetable || !onSelectTarget) return;
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onSelectTarget();
        }
      }}
      role={isTargetable ? "button" : undefined}
      tabIndex={isTargetable ? 0 : undefined}
      aria-label={isTargetable ? `选择${player.nickname}作为翻三张目标` : undefined}
    >
      {/* 玩家信息（头像 + 名字 + 分数） */}
      <div className="flex items-center gap-2 w-full">
        <div className={`pixel-avatar ${avatarColor}-bg ${isActive ? "turn-active" : ""}`}
          data-player-id={player.id}
          style={{ width: "26px", height: "26px", fontSize: "11px" }}>
          {isSelf ? "你" : player.nickname.charAt(0).toUpperCase()}
        </div>
        <span className={`font-semibold text-sm ${isActive ? "text-[var(--pixel-gold)]" : "text-[var(--text-primary)]"}`}>
          {player.nickname}
        </span>
        {player.endReason === "bust" && <span title="爆牌结束" aria-label="爆牌结束">💥</span>}
        {player.endReason === "freeze" && <span title="被冻结结束" aria-label="被冻结结束">❄️</span>}
        {player.endReason === "stop" && <span title="主动停止" aria-label="主动停止">🛑</span>}
        {player.endReason === "flip7" && <span title="七连翻结束" aria-label="七连翻结束">🎉</span>}
        {player.endReason === "deck_end" && <span title="牌堆耗尽结算" aria-label="牌堆耗尽结算">🃏</span>}
        {player.endReason === "skipped" && <span title="玩家跳过" aria-label="玩家跳过">⏭️</span>}
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
        <div
          className={`flex ${isHorizontal ? "flex-col" : "flex-col"} gap-1 justify-center ${isHorizontal ? "max-w-[280px]" : "max-h-[200px]"}`}
          data-player-hand-id={player.id}
        >
          {player.hand.length === 0 ? (
            <span className="text-[var(--text-muted)] text-xs py-2">无手牌</span>
          ) : (
            chunkItems(player.hand, isHorizontal ? cardsPerRow : undefined).map((row, rowIndex) => (
              <div key={`${player.id}-hand-row-${rowIndex}`} className={`flex ${isHorizontal ? "flex-row" : "flex-col"} gap-1 justify-center`}>
                {row.map((_, i) => (
                  <CardBack key={`${player.id}-back-${rowIndex}-${i}`} size={cardSize} />
                ))}
              </div>
            ))
          )}
        </div>
      ) : (
        /* 自己：显示真实卡牌（可交互） */
        <div
          className={`flex flex-col gap-1 justify-center ${isSelf ? "w-full max-w-none" : isHorizontal ? "max-w-[280px]" : "max-h-[200px]"}`}
          data-player-hand-id={player.id}
        >
          {displayHand.length === 0 ? (
            <span className="text-[var(--text-muted)] text-xs py-2">无手牌</span>
          ) : (
            chunkItems(displayHand, isHorizontal ? cardsPerRow : undefined).map((row, rowIndex) => (
              <div key={`${player.id}-back-row-${rowIndex}`} className={`flex ${isHorizontal ? "flex-row" : "flex-col"} gap-1 justify-center`}>
                {row.map((card) => (
                  <GameCard
                    key={card.id}
                    card={card}
                    size={cardSize}
                    isNew={card.id === newCardId}
                    hoverable={isSelf}
                  />
                ))}
              </div>
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
