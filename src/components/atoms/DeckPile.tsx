"use client";

import Image from "next/image";

interface DeckPileProps {
    count: number;
    onClick?: () => void;
    isClickable?: boolean;
    label?: string;
}

/**
 * 牌堆组件 - 显示剩余牌数和可点击翻牌
 * 使用真实牌背图片堆叠效果
 */
export function DeckPile({ count, onClick, isClickable = false, label }: DeckPileProps) {
    const displayCount = Math.min(count, 99);

    return (
        <div
            className={`relative p-4 rounded-2xl ${
                isClickable
                    ? "cursor-pointer hover:scale-105 active:scale-95 transition-transform bg-accent/5 hover:bg-accent/10"
                    : ""
            }`}
            onClick={isClickable ? onClick : undefined}
        >
            {/* 堆叠效果 - 3 张叠在一起的牌背 */}
            <div className="relative w-24 h-32">
                {count > 2 && (
                    <div className="absolute top-0 left-0 w-24 h-32 rounded-lg overflow-hidden shadow-md transform translate-x-1.5 translate-y-1.5">
                        <Image
                            src="/images/card_back.jpg"
                            alt="card-back"
                            width={96}
                            height={128}
                            className="w-full h-full object-contain"
                            draggable={false}
                        />
                    </div>
                )}
                {count > 1 && (
                    <div className="absolute top-0 left-0 w-24 h-32 rounded-lg overflow-hidden shadow-md transform translate-x-0.5 translate-y-0.5">
                        <Image
                            src="/images/card_back.jpg"
                            alt="card-back"
                            width={96}
                            height={128}
                            className="w-full h-full object-contain"
                            draggable={false}
                        />
                    </div>
                )}
                <div className="relative z-10 w-24 h-32 rounded-lg overflow-hidden shadow-lg">
                    <Image
                        src="/images/card_back.jpg"
                        alt="card-back"
                        width={96}
                        height={128}
                        className="w-full h-full object-contain"
                        draggable={false}
                    />
                </div>
            </div>

            {/* 数量标签 */}
            <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 z-20">
                <span className="bg-red-500 text-white text-xs font-bold px-2.5 py-1 rounded-full min-w-[28px] text-center shadow">
                    {displayCount}
                </span>
            </div>

            {/* 标签文字 */}
            {label && (
                <div className="text-center mt-2">
                    <span className="text-xs text-[var(--text-secondary)] font-semibold">
                        {label}
                    </span>
                </div>
            )}

            {/* 可点击提示 */}
            {isClickable && (
                <div className="absolute -bottom-7 left-1/2 -translate-x-1/2 whitespace-nowrap">
                    <span className="text-xs text-accent font-semibold">👆 点击翻牌</span>
                </div>
            )}
        </div>
    );
}
