"use client";

import { useState, useEffect } from "react";
import Image from "next/image";
import type { Card } from "@/types";
import { getCardImage } from "@/utils";

interface CardProps {
  card: Card;
  faceDown?: boolean;
  isNew?: boolean;
  onClick?: () => void;
  /** sm=52w | md=64w | lg=80w | xs=44w */
  size?: "sm" | "md" | "lg" | "xs";
  /** 是否可点击（hover 上浮效果） */
  hoverable?: boolean;
  /** 是否选中（金色边框） */
  selected?: boolean;
  className?: string;
}

const sizeMap = {
  xs: { w: 44, h: 62 },
  sm: { w: 52, h: 74 },
  md: { w: 64, h: 96 },
  lg: { w: 80, h: 120 },
};

/**
 * 统一牌背装饰层 —— 在 card_back.jpg 基础上叠加装饰边框
 */
export function CardBackFace({
  className = "",
  children,
}: {
  className?: string;
  children?: React.ReactNode;
}) {
  return (
    <div
      className={`relative w-full h-full rounded-xl overflow-hidden ${className}`}
      style={{
        backgroundImage: "url('/images/card_back.jpg')",
        backgroundSize: "cover",
        backgroundPosition: "center",
        boxShadow: "0 4px 16px rgba(0,0,0,0.4)",
      }}
    >
      {/* 装饰边框 */}
      <div className="absolute inset-2 rounded-lg border-2 border-dashed border-white/40" />

      {children}
    </div>
  );
}

/**
 * 卡牌组件 — 支持多尺寸 + hover + 选中 + 3D 翻转
 *
 * 3D 翻转逻辑：
 * - 正面预旋转 180deg，容器 rotateY(180deg) → 正面 180+180=360=正向显示
 * - 背面不旋转，容器 rotateY(0deg) → 背面向外
 */
export function GameCard({
  card,
  faceDown = false,
  isNew = false,
  onClick,
  size = "md",
  hoverable = false,
  selected = false,
  className = "",
}: CardProps) {
  const [showFront, setShowFront] = useState(!faceDown);

  useEffect(() => {
    if (isNew) {
      // 新牌：先显示背面，50ms 后翻转为正面
      setShowFront(false);
      const t = setTimeout(() => setShowFront(true), 50);
      return () => clearTimeout(t);
    } else {
      setShowFront(!faceDown);
    }
  }, [card, faceDown, isNew]);

  const { w, h } = sizeMap[size];

  return (
    <div
      className={`relative ${className}`}
      style={{ width: w, height: h }}
      onClick={onClick}
    >
      <div
        className="transition-transform duration-500"
        style={{
          transformStyle: "preserve-3d",
          transform: showFront ? "rotateY(180deg)" : "rotateY(0deg)",
        }}
      >
        {/* 正面：预旋转 180deg，当容器翻回时正面正常显示 */}
        <div
          className="absolute inset-0 backface-hidden"
          style={{
            transform: "rotateY(180deg)",
          }}
        >
          <Image
            src={getCardImage(card)}
            alt={`card-${card.type}`}
            width={w}
            height={h}
            className="px-card-img"
            draggable={false}
          />
        </div>
        {/* 背面：不旋转，容器不翻转时背面向外 */}
        <div
          className="absolute inset-0 backface-hidden"
          style={{
            transform: "rotateY(0deg)",
          }}
        >
          <CardBackFace className="rounded-lg">
            <Image
              src="/images/card_back.jpg"
              alt="card-back"
              width={w}
              height={h}
              className="px-card-img opacity-0"
              draggable={false}
            />
          </CardBackFace>
        </div>
      </div>
    </div>
  );
}

/** 纯卡背组件（用于显示他人手牌背面） */
export function CardBack({
  size = "md",
  className = "",
}: {
  /** sm=52w | md=64w | lg=80w | xs=44w */
  size?: "sm" | "md" | "lg" | "xs";
  className?: string;
}) {
  const { w, h } = sizeMap[size];
  return (
    <div
      className={`relative ${className}`}
      style={{ width: w, height: h }}
    >
      <CardBackFace className="rounded-lg shadow-md">
        <Image
          src="/images/card_back.jpg"
          alt="card-back"
          width={w}
          height={h}
          className="w-full h-full object-contain opacity-0"
          draggable={false}
        />
      </CardBackFace>
    </div>
  );
}
