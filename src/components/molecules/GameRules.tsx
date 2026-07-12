"use client";

import { useState } from "react";

interface GameRulesProps {
    isOpen: boolean;
    onClose: () => void;
}

/**
 * 游戏规则说明弹窗
 */
export function GameRules({ isOpen, onClose }: GameRulesProps) {
    const [activeTab, setActiveTab] = useState<"rules" | "cards">("rules");

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
            <div className="card max-w-lg w-full max-h-[85vh] overflow-hidden flex flex-col">
                {/* 标题 */}
                <div className="flex items-center justify-between p-4 border-b border-bg-card-hover">
                    <h2 className="text-lg font-bold">🎲 游戏规则</h2>
                    <button
                        className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-bg-card-hover transition-colors"
                        onClick={onClose}
                    >
                        ✕
                    </button>
                </div>

                {/* 标签页 */}
                <div className="flex border-b border-bg-card-hover">
                    <button
                        className={`flex-1 py-2 text-sm font-semibold transition-colors ${
                            activeTab === "rules"
                                ? "text-accent border-b-2 border-accent"
                                : "text-text-secondary hover:text-text-primary"
                        }`}
                        onClick={() => setActiveTab("rules")}
                    >
                        玩法规则
                    </button>
                    <button
                        className={`flex-1 py-2 text-sm font-semibold transition-colors ${
                            activeTab === "cards"
                                ? "text-accent border-b-2 border-accent"
                                : "text-text-secondary hover:text-text-primary"
                        }`}
                        onClick={() => setActiveTab("cards")}
                    >
                        卡牌说明
                    </button>
                </div>

                {/* 内容 */}
                <div className="flex-1 overflow-y-auto p-4 space-y-4">
                    {activeTab === "rules" ? (
                        <>
                            {/* 游戏目标 */}
                            <section>
                                <h3 className="text-accent font-bold mb-2">🎯 游戏目标</h3>
                                <p className="text-text-secondary text-sm leading-relaxed">
                                    第一个达到 <span className="text-accent font-bold">200分</span> 的玩家获胜！
                                </p>
                            </section>

                            {/* 基本流程 */}
                            <section>
                                <h3 className="text-accent font-bold mb-2">📋 基本流程</h3>
                                <ol className="text-text-secondary text-sm space-y-2 list-decimal list-inside">
                                    <li>房主创建房间，生成4位邀请码</li>
                                    <li>玩家输入邀请码加入房间</li>
                                    <li>所有玩家准备后，房主开始游戏</li>
                                    <li>玩家轮流从牌堆翻牌</li>
                                    <li>翻到的牌加入你的手牌</li>
                                    <li>觉得手牌分数够高时，按 <span className="text-accent font-bold">STOP</span> 结算</li>
                                    <li>先到200分的玩家获胜！</li>
                                </ol>
                            </section>

                            {/* 翻牌规则 */}
                            <section>
                                <h3 className="text-accent font-bold mb-2">🃏 翻牌规则</h3>
                                <ul className="text-text-secondary text-sm space-y-2 list-disc list-inside">
                                    <li>每次翻一张牌，加入你的手牌</li>
                                    <li>翻到数字牌：该数字计入手牌分数</li>
                                    <li>翻到功能牌：触发特殊效果</li>
                                    <li>翻到重复数字牌：<span className="text-red-400 font-bold">爆牌！</span>本回合得分为0</li>
                                </ul>
                            </section>

                            {/* 回合结束 */}
                            <section>
                                <h3 className="text-accent font-bold mb-2">🏁 回合结束</h3>
                                <p className="text-text-secondary text-sm leading-relaxed">
                                    所有玩家都 STOP 或爆牌后，回合结束。每人获得本回合手牌的分数。
                                    下一轮由上一轮最先出局的玩家先手。
                                </p>
                            </section>

                            {/* 七连翻 */}
                            <section>
                                <h3 className="text-accent font-bold mb-2">🎉 七连翻</h3>
                                <p className="text-text-secondary text-sm leading-relaxed">
                                    如果你连续翻到7张不同数字牌（没有爆牌），
                                    触发 <span className="text-yellow-400 font-bold">七连翻</span>！
                                    手牌全部结算，额外获得 <span className="text-accent font-bold">+50分</span> 奖励！
                                </p>
                            </section>
                        </>
                    ) : (
                        <>
                            {/* 数字牌 */}
                            <section>
                                <h3 className="text-accent font-bold mb-2">🔢 数字牌 (0-12)</h3>
                                <p className="text-text-secondary text-sm leading-relaxed">
                                    翻到数字牌，该数字计入手牌总分。
                                    例如翻到数字5，你的手牌+5分。
                                </p>
                                <p className="text-red-400 text-xs mt-1">
                                    ⚠️ 如果翻到已有相同数字的牌，会爆牌！
                                </p>
                            </section>

                            {/* 加分牌 */}
                            <section>
                                <h3 className="text-accent font-bold mb-2">➕ 加分牌 (+2/+4/+6/+8/+10)</h3>
                                <p className="text-text-secondary text-sm leading-relaxed">
                                    直接增加对应分数。翻到+6，手牌+6分。
                                </p>
                            </section>

                            {/* 翻三张 */}
                            <section>
                                <h3 className="text-accent font-bold mb-2">🃏 翻三张 (FlipThree)</h3>
                                <p className="text-text-secondary text-sm leading-relaxed">
                                    选择一名对手，强制他连续翻3张牌加入手牌。
                                    可能导致对手爆牌！
                                </p>
                            </section>

                            {/* 冻结 */}
                            <section>
                                <h3 className="text-accent font-bold mb-2">❄️ 冻结 (Freeze)</h3>
                                <p className="text-text-secondary text-sm leading-relaxed">
                                    选择一名对手，立即结算他的手牌分数。
                                    被冻结的玩家本回合结束，手牌进弃牌堆。
                                </p>
                            </section>

                            {/* 翻倍 */}
                            <section>
                                <h3 className="text-accent font-bold mb-2">✖️ 翻倍 (Double)</h3>
                                <p className="text-text-secondary text-sm leading-relaxed">
                                    手牌总分 ×2！但爆牌时分数也×2（更惨）。
                                </p>
                            </section>

                            {/* 复活 */}
                            <section>
                                <h3 className="text-accent font-bold mb-2">🔄 复活 (Revive)</h3>
                                <p className="text-text-secondary text-sm leading-relaxed">
                                    如果你爆牌了，使用复活牌可以继续游戏。
                                    手牌保留，不用从零开始。
                                </p>
                            </section>

                            {/* 计分规则 */}
                            <section className="bg-bg-card-hover rounded-xl p-3">
                                <h3 className="text-accent font-bold mb-2">💰 计分公式</h3>
                                <div className="text-text-secondary text-sm space-y-1">
                                    <p>基础分 = 所有数字牌 + 加分牌之和</p>
                                    <p>如有翻倍牌 → 基础分 × 2</p>
                                    <p>七连翻奖励 → +50分</p>
                                    <p className="text-accent font-bold mt-2">
                                        最终得分 = 基础分 + 奖励分
                                    </p>
                                </div>
                            </section>
                        </>
                    )}
                </div>

                {/* 底部按钮 */}
                <div className="p-4 border-t border-bg-card-hover">
                    <button
                        className="btn btn-primary w-full"
                        onClick={onClose}
                    >
                        我知道了
                    </button>
                </div>
            </div>
        </div>
    );
}
