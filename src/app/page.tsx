"use client";

import { useState, useEffect, useCallback } from "react";
import { useRoomStore } from "@/store/roomStore";
import { useGameStore } from "@/store/gameStore";
import { useGameSocket } from "@/hooks/useGameSocket";
import { ClientOnly } from "@/components/ClientOnly";
import Aurora from "@/components/Aurora";
import { GameBoard } from "@/components/organisms/GameBoard";
import { GameRules } from "@/components/molecules/GameRules";

/**
 * 主页面 — 纯 store 驱动，无本地 view 状态
 * 视图切换逻辑：
 *   roomCode 为空 → 大厅（lobby）
 *   roomCode 有值 且 phase 非 playing → 房间等待
 *   gameStore.state 存在 且 phase === "playing" → 游戏
 */
export default function HomePage() {
    const [nickname, setNickname] = useState("");
    const [playerCount, setPlayerCount] = useState<2 | 3 | 4>(4);
    const [roomCodeInput, setRoomCodeInput] = useState("");
    const [showRules, setShowRules] = useState(false);

    const { roomCode } = useRoomStore();
    const { state: gameState } = useGameStore();
    const connectionStatus = useGameStore((s) => s.connectionStatus);

    // WebSocket 生命周期（只需调用一次）
    const { createRoom, joinRoom } = useGameSocket();

    // 从 localStorage 恢复昵称
    useEffect(() => {
        const saved = localStorage.getItem("flip7_nickname");
        if (saved) setNickname(saved);
    }, []);

    const isConnecting = connectionStatus !== "connected";

    const handleCreateRoom = useCallback(() => {
        if (!nickname.trim()) return;
        localStorage.setItem("flip7_nickname", nickname.trim());
        createRoom(nickname.trim(), playerCount);
    }, [nickname, playerCount, createRoom]);

    const handleJoinRoom = useCallback(() => {
        if (!nickname.trim() || !roomCodeInput.trim()) return;
        localStorage.setItem("flip7_nickname", nickname.trim());
        joinRoom(roomCodeInput.trim(), nickname.trim());
    }, [nickname, roomCodeInput, joinRoom]);

    // ── 视图路由 ──

    // 游戏中
    if (gameState && gameState.phase === "playing") {
        return <GameBoard />;
    }

    // 房间等待（有 roomCode 但未开始游戏）
    if (roomCode) {
        return <RoomLobbyView />;
    }

    // 大厅
    return (
        <div className="relative min-h-[100dvh] overflow-hidden wood-frame felt-texture">
            {/* Aurora 动态背景 */}
            <div className="fixed inset-0 z-0 pointer-events-none opacity-30">
                <ClientOnly>
                    <Aurora
                        colorStops={["#0d7377", "#2dd4bf", "#0d7377"]}
                        amplitude={1.0}
                        blend={0.5}
                        speed={0.5}
                    />
                </ClientOnly>
            </div>

            <div className="relative z-10 min-h-[100dvh] flex items-center justify-center p-4 sm:p-6">
                <div className="w-full max-w-md">
                    <div className="bg-[var(--bg-card)] border-2 border-[var(--wood-light)] rounded-2xl p-6 sm:p-8 shadow-xl">
                        {/* 标题 — 像素风 */}
                        <div className="text-center mb-6 sm:mb-8">
                            <h1 className="pixel-font text-xl sm:text-2xl font-bold tracking-tight mb-2 text-[var(--pixel-gold)]"
                                style={{ textShadow: "2px 2px 0 var(--wood-dark), 3px 3px 0 rgba(0,0,0,0.4)" }}>
                                FLIP 7
                            </h1>
                            <p className="text-[var(--text-secondary)] text-sm sm:text-base">
                                2-4 人实时在线对战
                            </p>
                        </div>

                        {/* 连接状态 */}
                        {isConnecting && (
                            <div className="mb-4 text-center">
                                <span className="text-yellow-400 text-sm animate-pulse">
                                    连接中...
                                </span>
                            </div>
                        )}

                        {/* 游戏规则入口 */}
                        <div className="mb-4 text-center">
                            <button
                                className="text-[var(--text-secondary)] text-sm hover:text-[var(--pixel-gold)] transition-colors inline-flex items-center gap-1"
                                onClick={() => setShowRules(true)}
                            >
                                📖 游戏规则
                            </button>
                        </div>

                        {/* 昵称输入（共用） */}
                        <div className="mb-5">
                            <label className="block text-[var(--text-secondary)] text-sm mb-2">
                                你的昵称
                            </label>
                            <input
                                className="input-field"
                                placeholder="输入昵称..."
                                value={nickname}
                                onChange={(e) => setNickname(e.target.value)}
                                maxLength={12}
                            />
                        </div>

                        {/* ═══ 两个并排操作卡 ═══ */}
                        <div className="flex flex-col gap-3 mb-4">
                            {/* 加入房间 */}
                            <div className="bg-[var(--bg-card)] border border-[var(--wood-light)] rounded-xl p-4 flex flex-col">
                                <h3 className="font-bold text-sm mb-1 flex items-center gap-2">
                                    <span className="pixel-avatar green-bg" style={{ width: "24px", height: "24px", fontSize: "9px" }}>🎮</span>
                                    加入房间
                                </h3>
                                <div className="flex gap-2 mt-auto">
                                    <input
                                        className="input-field text-center tracking-[0.25em] text-lg font-mono flex-1"
                                        placeholder="邀请码"
                                        inputMode="numeric"
                                        pattern="[0-9]*"
                                        value={roomCodeInput}
                                        onChange={(e) =>
                                            setRoomCodeInput(
                                                e.target.value.replace(/\D/g, "").slice(0, 4)
                                            )
                                        }
                                        maxLength={4}
                                    />
                                    <button
                                        className="btn-arcade px-5"
                                        onClick={handleJoinRoom}
                                        disabled={
                                            isConnecting ||
                                            !nickname.trim() ||
                                            roomCodeInput.length !== 4
                                        }
                                    >
                                        加入
                                    </button>
                                </div>
                                <p className="text-[var(--text-muted)] text-xs mt-2 text-left">
                                    输入邀请码加入好友房间
                                </p>
                            </div>

                            {/* 创建房间 */}
                            <div className="bg-[var(--bg-card)] border border-[var(--wood-light)] rounded-xl p-4 flex flex-col">
                                <h3 className="font-bold text-sm mb-1 flex items-center gap-2">
                                    <span className="pixel-avatar gold-bg" style={{ width: "24px", height: "24px", fontSize: "9px", color: "var(--wood-dark)" }}>🏠</span>
                                    创建房间
                                </h3>
                                <p className="text-[var(--text-muted)] text-xs mb-3">
                                    创建房间，邀请好友一起来玩
                                </p>
                                {/* 玩家人数 */}
                                <div className="mb-3">
                                    <label className="block text-[var(--text-secondary)] text-xs mb-1.5">
                                        玩家人数
                                    </label>
                                    <div className="grid grid-cols-3 gap-1.5">
                                        {([2, 3, 4] as const).map((n) => (
                                            <button
                                                key={n}
                                                className={`text-sm py-1.5 rounded-lg font-semibold transition-all ${
                                                    playerCount === n
                                                        ? "bg-[var(--pixel-gold)] text-[var(--wood-dark)] ring-1 ring-[var(--pixel-gold-dark)] shadow-md"
                                                        : "bg-[var(--bg-card-hover)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-card)]"
                                                }`}
                                                onClick={() => setPlayerCount(n)}
                                            >
                                                {n}人
                                            </button>
                                        ))}
                                    </div>
                                </div>
                                <button
                                    className="btn-arcade btn-arcade-gold w-full mt-auto"
                                    onClick={handleCreateRoom}
                                    disabled={isConnecting || !nickname.trim()}
                                >
                                    🏠 创建房间
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* 游戏规则弹窗 */}
            <GameRules isOpen={showRules} onClose={() => setShowRules(false)} />
        </div>
    );
}

// ── 房间等待视图 ──

const AVATAR_COLORS = ["blue", "red", "purple", "green"] as const;

function DisconnectCountdown({ disconnectedAt }: { disconnectedAt: number | null }) {
  const [seconds, setSeconds] = useState(15);
  useEffect(() => {
    if (!disconnectedAt) return;
    const interval = setInterval(() => {
      const elapsed = Math.floor((Date.now() - disconnectedAt) / 1000);
      const remaining = Math.max(0, 15 - elapsed);
      setSeconds(remaining);
    }, 250);
    return () => clearInterval(interval);
  }, [disconnectedAt]);
  return <span>{seconds}s</span>;
}

function RoomLobbyView() {
    const { players, roomCode, selfId, hostId, reset: resetRoom, error } = useRoomStore();
    const { toggleReady, startGame, leaveRoom, kickPlayer } = useGameSocket();
    const isHost = selfId === hostId;
    const [showRules, setShowRules] = useState(false);

    const allReady = players.length >= 2 && players.every((p) => p.isReady);

    const handleCopyCode = useCallback(() => {
        navigator.clipboard.writeText(roomCode).catch(() => {});
    }, [roomCode]);

    const handleLeave = useCallback(() => {
        leaveRoom();
        resetRoom();
    }, [leaveRoom, resetRoom]);

    return (
        <div className="relative min-h-[100dvh] flex items-center justify-center p-4 wood-frame felt-texture">
            <div className="w-full max-w-md">
                <div className="bg-[var(--bg-card)] border-2 border-[var(--wood-light)] rounded-2xl p-6 sm:p-8 shadow-xl">
                    {/* 房间码 */}
                    <div className="text-center mb-6">
                        <p className="text-[var(--text-secondary)] text-sm mb-1">
                            房间码
                        </p>
                        <p className="pixel-font text-2xl sm:text-3xl text-[var(--pixel-gold)] tracking-wider mb-3"
                            style={{ textShadow: "2px 2px 0 var(--wood-dark)" }}>
                            {roomCode}
                        </p>
                        <button
                            className="btn-arcade text-xs py-2 px-4"
                            onClick={handleCopyCode}
                        >
                            📋 复制房间码
                        </button>
                    </div>

                    {/* 错误提示 */}
                    {error && (
                        <div className="mb-4 p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-red-400 text-sm text-center">
                            {error}
                        </div>
                    )}
                    <h3 className="text-[var(--text-secondary)] text-sm mb-3">
                        玩家 ({players.length}/4)
                    </h3>
                    <div className="space-y-2 mb-6">
                        {players.map((p, idx) => (
                            <div
                                key={p.id}
                                className="flex items-center justify-between px-4 py-3 bg-[var(--bg-card-hover)] rounded-xl"
                            >
                                <div className="flex items-center gap-2">
                                    {/* 头像 */}
                                    <div className={`pixel-avatar ${AVATAR_COLORS[idx % AVATAR_COLORS.length]}-bg`}
                                        style={{ width: "26px", height: "26px", fontSize: "10px" }}>
                                        {p.nickname.charAt(0).toUpperCase()}
                                    </div>
                                    <span className="font-semibold">
                                        {p.nickname}
                                    </span>
                                    {p.isHost && (
                                        <span className="text-yellow-400 text-xs font-semibold px-2 py-0.5 bg-yellow-400/10 rounded-full">
                                            房主
                                        </span>
                                    )}
                                    {p.id === selfId && (
                                        <span className="text-[var(--pixel-gold)] text-xs font-semibold px-2 py-0.5 bg-[var(--pixel-gold)]/10 rounded-full">
                                            我
                                        </span>
                                    )}
                                    {!p.isConnected && !p.skipped && (
                                        <span className="text-orange-400 text-xs font-semibold px-2 py-0.5 bg-orange-400/10 rounded-full animate-pulse">
                                            断线中 (<DisconnectCountdown disconnectedAt={p.disconnectedAt} />)
                                        </span>
                                    )}
                                    {p.skipped && (
                                        <span className="text-red-400 text-xs font-semibold px-2 py-0.5 bg-red-400/10 rounded-full">
                                            已跳过
                                        </span>
                                    )}
                                </div>
                                <div className="flex items-center gap-2">
                                    <span
                                        className={`text-sm font-semibold ${
                                            p.isReady
                                                ? "text-green-400"
                                                : "text-[var(--text-muted)]"
                                        }`}
                                    >
                                        {p.isReady ? "已准备" : "等待中"}
                                    </span>
                                    {/* 踢人按钮（仅房主可见，不能踢自己） */}
                                    {isHost && p.id !== selfId && (
                                        <button
                                            className="btn-arcade btn-arcade-red"
                                            style={{ fontSize: "10px", padding: "4px 10px" }}
                                            onClick={() => {
                                                if (confirm(`确定要踢出 ${p.nickname} 吗？`)) {
                                                    kickPlayer(p.id);
                                                }
                                            }}
                                        >
                                            踢出
                                        </button>
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>

                    {/* 等待提示动画 */}
                    {!allReady && players.length < 4 && (
                        <div className="text-center py-3 mb-4">
                            <div className="inline-flex items-center gap-2 text-[var(--text-secondary)] text-sm">
                                <div className="flex gap-1">
                                    <span className="w-2 h-2 bg-[var(--pixel-gold)] rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
                                    <span className="w-2 h-2 bg-[var(--pixel-gold)] rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
                                    <span className="w-2 h-2 bg-[var(--pixel-gold)] rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
                                </div>
                                <span>等待玩家加入...</span>
                            </div>
                        </div>
                    )}

                    {/* 操作按钮 */}
                    <div className="flex flex-col gap-2">
                        {/* 非房主：准备按钮 */}
                        {!isHost && (
                            <button
                                className="btn-arcade btn-arcade-gold"
                                onClick={toggleReady}
                            >
                                {players.find((p) => p.id === selfId)?.isReady
                                    ? "取消准备"
                                    : "准备"}
                            </button>
                        )}

                        {/* 仅房主：开始游戏 */}
                        {isHost && (
                            <button
                                className="btn-arcade btn-arcade-green"
                                onClick={startGame}
                                disabled={!allReady}
                            >
                                开始游戏
                            </button>
                        )}

                        <button
                            className="btn-arcade"
                            onClick={handleLeave}
                        >
                            离开房间
                        </button>
                    </div>

                    {/* 游戏规则入口 */}
                    <div className="mt-4 text-center">
                        <button
                            className="text-[var(--text-secondary)] text-sm hover:text-[var(--pixel-gold)] transition-colors inline-flex items-center gap-1"
                            onClick={() => setShowRules(true)}
                        >
                            📖 游戏规则
                        </button>
                    </div>
                </div>
            </div>

            {/* 游戏规则弹窗 */}
            <GameRules isOpen={showRules} onClose={() => setShowRules(false)} />
        </div>
    );
}
