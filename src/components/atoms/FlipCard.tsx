"use client";

import { useMemo, useEffect, useState } from "react";
import { motion } from "motion/react";
import type { Card } from "@/types";
import { getCardImage } from "@/utils";
import { CardBackFace } from "./GameCard";

export type FlipPhase =
  | "idle"
  | "showing_back"
  | "enlarged"
  | "flipping"
  | "entering_hand"
  | "busted"
  | "flip7";

interface FlipCardProps {
  /** 当前阶段 */
  phase: FlipPhase;
  card: Card | null;
  /** 当前玩家名 */
  playerName?: string;
  /** 当前回合号 */
  round?: number;
  /** 动画起点：牌堆 DOMRect */
  startRect?: DOMRect | null;
  /** 动画终点：手牌区 DOMRect */
  endRect?: DOMRect | null;
  /** 目标手牌尺寸 */
  targetCardSize?: "xs" | "sm" | "md" | "lg";
  /** 点击跳过 */
  onSkip?: () => void;
  onAnimationComplete?: () => void;
}

const sizeMap = {
  xs: 44,
  sm: 52,
  md: 64,
  lg: 80,
};

/**
 * 卡牌翻转动画组件
 *
 * 动画流程（总时长约 2.0s）：
 * 1. showing_back (0.35s): 从牌堆位置飞到屏幕中央并放大
 * 2. enlarged    (0.65s): 牌背在中央停留并轻微弹跳
 * 3. flipping    (0.5s): 3D 水平翻转并展示牌面
 * 4. entering_hand (0.5s): 缩小并飞向手牌区
 *
 * 3D 翻转：正面预旋转 180deg，容器 rotateY 0→180
 */
export function FlipCard({
  phase,
  card,
  playerName,
  round,
  startRect,
  endRect,
  targetCardSize = "md",
  onSkip,
  onAnimationComplete,
}: FlipCardProps) {
  const [reducedMotion, setReducedMotion] = useState(false);

  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReducedMotion(media.matches);
    update();
    media.addEventListener?.("change", update);
    return () => media.removeEventListener?.("change", update);
  }, []);

  const geometry = useMemo(() => {
    if (typeof window === "undefined") return null;

    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const centerX = vw / 2;
    const centerY = vh / 2;

    // 响应式基础尺寸
    const isMobile = vw < 640;
    const baseW = isMobile ? 80 : 96;
    const baseH = isMobile ? 112 : 128;

    const safeStartRect = startRect ?? new DOMRect(centerX - baseW / 2, centerY - baseH / 2, baseW, baseH);
    const startX = safeStartRect.left + safeStartRect.width / 2 - centerX;
    const startY = safeStartRect.top + safeStartRect.height / 2 - centerY;
    const startScale = Math.max(0.5, safeStartRect.width / baseW);

    // 中央展示缩放：最大 1.4，且不超出屏幕安全区
    const centerScale = Math.min(
      1.4,
      (vw - 32) / baseW,
      (vh * 0.5) / baseH,
      1.4
    );

    // 终点：手牌区中心，若未提供则默认屏幕下方
    let endX = 0;
    let endY = vh * 0.35;
    let endScale = sizeMap[targetCardSize] / baseW;

    if (endRect) {
      endX = endRect.left + endRect.width / 2 - centerX;
      endY = endRect.top + endRect.height / 2 - centerY;
    }

    return {
      baseW,
      baseH,
      startX,
      startY,
      startScale,
      centerScale,
      endX,
      endY,
      endScale,
    };
  }, [startRect, endRect, targetCardSize]);

  const { animate, transition, initial } = useMemo(() => {
    if (!geometry) {
      return {
        initial: { x: 0, y: 0, scale: 1, rotateY: 0, opacity: 1 },
        animate: { x: 0, y: 0, scale: 1, rotateY: 0, opacity: 1 },
        transition: { duration: 0 },
      };
    }

    if (reducedMotion) {
      return {
        initial: { x: 0, y: 0, scale: 1, rotateY: 180, opacity: 1 },
        animate: { x: 0, y: 0, scale: 1, rotateY: 180, opacity: 1 },
        transition: { duration: 0 },
      };
    }

    const {
      startX,
      startY,
      startScale,
      centerScale,
      endX,
      endY,
      endScale,
    } = geometry;

    const initialState = {
      x: startX,
      y: startY,
      scale: startScale,
      rotateY: 0,
      opacity: 1,
    };

    switch (phase) {
      case "showing_back":
        return {
          initial: initialState,
          animate: { x: 0, y: 0, scale: centerScale, rotateY: 0, opacity: 1 },
          transition: { duration: 0.2, ease: "easeOut" as const },
        };
      case "enlarged":
        return {
          initial: initialState,
          animate: {
            x: 0,
            y: 0,
            scale: [centerScale, centerScale * 1.1, centerScale * 1.08],
            rotateY: 0,
            opacity: 1,
          },
          transition: {
            duration: 0.65,
            times: [0, 0.55, 1],
            ease: "easeInOut" as const,
          },
        };
      case "flipping":
        return {
          initial: initialState,
          animate: {
            x: 0,
            y: 0,
            scale: centerScale,
            rotateY: [0, 180, 180],
            opacity: 1,
          },
          transition: {
            duration: 0.3,
            times: [0, 0.33, 1],
            ease: "easeInOut" as const,
          },
        };
      case "entering_hand":
        return {
          initial: initialState,
          animate: {
            x: endX,
            y: endY,
            scale: endScale,
            rotateY: 180,
            opacity: 0,
          },
          transition: { duration: 0.3, ease: "easeInOut" as const },
        };
      default:
        return {
          initial: initialState,
          animate: initialState,
          transition: { duration: 0 },
        };
    }
  }, [phase, geometry, reducedMotion]);

  if (phase === "idle" || phase === "busted" || phase === "flip7") return null;
  if (!geometry) return null;

  const { baseW, baseH } = geometry;
  const showFront = phase === "flipping" || phase === "entering_hand";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center pointer-events-none">
      {/* 玩家名 + 回合号 HUD */}
      <div
        className="absolute top-[12%] left-1/2 -translate-x-1/2 text-center pointer-events-none"
        style={{ zIndex: 60 }}
      >
        {typeof round === "number" && (
          <div className="text-xs text-[var(--text-secondary)] mb-0.5">
            第 {round} 回合
          </div>
        )}
        {playerName && (
          <div className="text-sm font-bold text-[var(--pixel-gold)]">
            {playerName}
          </div>
        )}
      </div>

      {/* 卡牌本体 */}
      <motion.div
        className="flip-card-motion relative pointer-events-auto"
        style={{
          width: baseW,
          height: baseH,
          transformStyle: "preserve-3d",
          perspective: 1200,
        }}
        initial={initial}
        animate={animate}
        transition={transition}
        onClick={onSkip}
        onAnimationComplete={onAnimationComplete}
      >
        {/* 背面：rotateY 0deg 时可见 */}
        <div
          className="absolute inset-0 backface-hidden rounded-xl overflow-hidden"
          style={{ transform: "rotateY(0deg)" }}
        >
          <CardBackFace className="rounded-xl" />
        </div>

        {/* 正面：预旋转 180deg，容器 rotateY 180deg 时正向显示 */}
        <div
          className="absolute inset-0 backface-hidden rounded-xl overflow-hidden"
          style={{ transform: "rotateY(180deg)" }}
        >
          {showFront && card ? (
            <img
              src={getCardImage(card)}
              alt={`card-${card.type}`}
              className="w-full h-full object-contain rounded-xl"
              draggable={false}
            />
          ) : (
            <CardBackFace className="rounded-xl" />
          )}
        </div>
      </motion.div>

      {/* 跳过提示 */}
      <div
        className="absolute bottom-8 left-1/2 -translate-x-1/2 text-white/50 text-xs pointer-events-none"
        style={{ zIndex: 60 }}
      >
        点击跳过
      </div>
    </div>
  );
}
