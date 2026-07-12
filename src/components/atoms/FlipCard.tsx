"use client";

import { motion, AnimatePresence } from "motion/react";
import type { Card } from "@/types";
import { getCardImage } from "@/utils";

interface FlipCardProps {
    /** 当前阶段 */
    phase: "idle" | "showing_back" | "flipping" | "enlarged" | "entering_hand";
    card: Card | null;
    /** 点击跳过 */
    onSkip?: () => void;
}

/**
 * 卡牌翻转动画组件
 *
 * 修复：使用 opacity + scale 动画代替 3D rotateY，
 * 避免图片在 rotateY(180) 时被镜像反转的问题。
 */
export function FlipCard({ phase, card, onSkip }: FlipCardProps) {
    if (phase === "idle") return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center pointer-events-none">
            <AnimatePresence mode="wait">
                {/* 阶段 1：牌背滑入 */}
                {phase === "showing_back" && (
                    <motion.div
                        key="showing_back"
                        className="w-24 h-32 rounded-xl overflow-hidden shadow-2xl"
                        initial={{ y: 100, opacity: 0 }}
                        animate={{ y: 0, opacity: 1 }}
                        exit={{ y: 0, opacity: 0 }}
                        transition={{ duration: 0.2, ease: "easeOut" }}
                    >
                        <img
                            src="/images/card_back.jpg"
                            alt="card-back"
                            className="w-full h-full object-contain"
                            draggable={false}
                        />
                    </motion.div>
                )}

                {/* 阶段 2：翻面 — 使用 opacity + scale 切换牌面，避免镜像 */}
                {phase === "flipping" && card && (
                    <motion.div
                        key="flipping"
                        className="w-24 h-32 rounded-xl overflow-hidden shadow-2xl"
                        initial={{ scaleX: 0.1, opacity: 0.5 }}
                        animate={{ scaleX: 1, opacity: 1 }}
                        exit={{ scaleX: 1.2, opacity: 0 }}
                        transition={{ duration: 0.25, ease: "easeOut" }}
                    >
                        <img
                            src={getCardImage(card)}
                            alt={`card-${card.type}`}
                            className="w-full h-full object-contain"
                            draggable={false}
                        />
                    </motion.div>
                )}

                {/* 阶段 3：放大到 300% */}
                {phase === "enlarged" && card && (
                    <motion.div
                        key="enlarged"
                        className="w-24 h-32 rounded-xl overflow-hidden shadow-2xl pointer-events-auto cursor-pointer"
                        initial={{ scale: 1 }}
                        animate={{ scale: 3 }}
                        transition={{
                            type: "spring",
                            stiffness: 200,
                            damping: 15,
                        }}
                        onClick={onSkip}
                    >
                        <img
                            src={getCardImage(card)}
                            alt={`card-${card.type}`}
                            className="w-full h-full object-contain"
                            draggable={false}
                        />
                    </motion.div>
                )}

                {/* 阶段 4：飞入手牌 */}
                {phase === "entering_hand" && card && (
                    <motion.div
                        key="entering_hand"
                        className="w-24 h-32 rounded-xl overflow-hidden shadow-2xl"
                        initial={{ scale: 3, y: 0, opacity: 1 }}
                        animate={{ scale: 0.3, y: 200, opacity: 0 }}
                        transition={{ duration: 0.4, ease: "easeIn" }}
                    >
                        <img
                            src={getCardImage(card)}
                            alt={`card-${card.type}`}
                            className="w-full h-full object-contain"
                            draggable={false}
                        />
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}
