"use client";

import Image from "next/image";

interface DiscardPileProps {
    count: number;
    label?: string;
    className?: string;
}

/**
 * 弃牌堆组件 - 显示已使用的牌（牌背堆叠）
 */
export function DiscardPile({ count, label, className = "" }: DiscardPileProps) {
    const displayCount = Math.min(count, 99);

    return (
        <div className={`relative p-4 rounded-2xl ${className}`}>
            {/* 堆叠效果 - 显示弃掉的牌背 */}
            <div className="relative w-24 h-32">
                {count > 2 && (
                    <div className="absolute top-0 left-0 w-24 h-32 rounded-lg overflow-hidden shadow-md transform translate-x-1.5 translate-y-1.5 opacity-60">
                        <Image
                            src="/images/card_back.jpg"
                            alt="card_back"
                            width={96}
                            height={128}
                            className="w-full h-full object-contain"
                            draggable={false}
                        />
                    </div>
                )}
                {count > 1 && (
                    <div className="absolute top-0 left-0 w-24 h-32 rounded-lg overflow-hidden shadow-md transform translate-x-0.5 translate-y-0.5 opacity-80">
                        <Image
                            src="/images/card_back.jpg"
                            alt="card_back"
                            width={96}
                            height={128}
                            className="w-full h-full object-contain"
                            draggable={false}
                        />
                    </div>
                )}
                {count > 0 ? (
                    <div className="relative z-10 w-24 h-32 rounded-lg overflow-hidden shadow-lg">
                        <Image
                            src="/images/card_back.jpg"
                            alt="card_back"
                            width={96}
                            height={128}
                            className="w-full h-full object-contain"
                            draggable={false}
                        />
                    </div>
                ) : (
                    <div className="w-24 h-32 rounded-lg border-2 border-dashed border-bg-card-hover flex items-center justify-center">
                        <span className="text-text-muted text-xs">{label || "弃牌堆"}</span>
                    </div>
                )}
            </div>

            {/* 数量标签 */}
            <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 z-20">
                <span className="bg-text-muted text-white text-xs font-bold px-2.5 py-1 rounded-full min-w-[28px] text-center shadow">
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
        </div>
    );
}
