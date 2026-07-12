// ============================================================
// src/hooks/useGameSocket.ts — 游戏 + 房间 WebSocket 生命周期
//
// 重连机制已集成：
// - 服务端发 disconnect_warning → UI 显示倒计时
// - 自动重连时发送 reconnect（带 token）
// - reconnect_result 显示结果
// ============================================================
"use client";

import { useEffect, useCallback, useRef } from "react";
import { socketClient } from "@/services/socket";
import { useGameStore } from "@/store/gameStore";
import { useRoomStore } from "@/store/roomStore";
import type { ServerMessage } from "@/types";

/**
 * 完整在线对战生命周期 Hook
 * 路由 WebSocket 消息到正确 store
 * 管理连接 → 房间加入/创建 → 游戏开始 → 游戏同步
 */
export function useGameSocket() {
    const { setState, setSelfId: setGameSelfId, setConnectionStatus } = useGameStore();
    const { setRoom, updatePlayers, setSelfId, setPhase, setHost, setError, reset: resetRoom } = useRoomStore();
    const viewedGame = useRef(false);

    useEffect(() => {
        const offMessage = socketClient.onMessage((msg: ServerMessage) => {
            switch (msg.type) {
                case "room_update": {
                    // room_update 每个客户端带自己的 selfId
                    const { players, phase, roomCode, hostId, selfId } = msg.payload as any;
                    setSelfId(selfId);
                    setGameSelfId(selfId);
                    setRoom(roomCode, selfId, hostId);
                    updatePlayers(players);
                    setPhase(phase === "lobby" ? "all_joined" : "waiting");
                    setError(null);
                    break;
                }

                case "game_start":
                    setState(msg.payload as any);
                    viewedGame.current = true;
                    break;

                case "state_sync":
                    setState(msg.payload as any);
                    break;

                case "host_changed":
                    setHost((msg.payload as any).newHostId);
                    break;

                case "disconnect_warning": {
                    // 服务端通知断线，15s 内可重连
                    const payload = msg.payload as { token: string; timeoutMs: number; reason: string };
                    setError(`连接已断开，${payload.timeoutMs / 1000} 秒内可重连`);
                    break;
                }

                case "reconnect_result": {
                    const payload = msg.payload as { success: boolean; message: string };
                    if (!payload.success) {
                        setError(payload.message);
                    }
                    break;
                }

                case "player_disconnected":
                    // 可显示掉线状态（具体 UI 在 PlayerArea 中处理）
                    break;

                case "player_reconnected":
                    // 玩家已恢复连接
                    break;

                case "player_skipped":
                    // 玩家被跳过（15s 未重连）
                    break;

                case "error":
                    if ((msg.payload as any)?.message) {
                        setError((msg.payload as any).message);
                    }
                    break;
            }
        });

        const offStatus = socketClient.onStatus((status) => {
            setConnectionStatus(status);
            if (status === "connected") {
                // 稍微延迟确保 WS readyState 已更新为 OPEN
                // socketClient 内部会在 onopen 后自动发送 connect/reconnect
                // 无需手动 requestSync
            } else if (status === "disconnected") {
                viewedGame.current = false;
            }
        });

        socketClient.connect();

        return () => {
            offMessage();
            offStatus();
        };
    }, [setState, setGameSelfId, setConnectionStatus, setRoom, updatePlayers, setSelfId, setPhase, setHost, setError]);

    // ── 操作代理 ──

    const createRoom = useCallback((nickname: string, count: 2 | 3 | 4) => {
        socketClient.createRoom(nickname, count);
    }, []);

    const joinRoom = useCallback((roomCode: string, nickname: string) => {
        socketClient.joinRoom(roomCode, nickname);
    }, []);

    const toggleReady = useCallback(() => {
        socketClient.ready();
    }, []);

    const startGame = useCallback(() => {
        socketClient.startGame();
    }, []);

    const actionFlip = useCallback(() => {
        socketClient.actionFlip();
    }, []);

    const confirmFlip = useCallback(() => {
        socketClient.send({ type: "confirm_flip", payload: {} });
    }, []);

    const actionStop = useCallback(() => {
        socketClient.actionStop();
    }, []);

    const actionTarget = useCallback((targetId: number) => {
        socketClient.actionTarget(targetId);
    }, []);

    const leaveRoom = useCallback(() => {
        socketClient.leaveRoom();
        resetRoom();
    }, [resetRoom]);

    const kickPlayer = useCallback((playerId: number) => {
        socketClient.send({ type: "kick_player", payload: { playerId } });
    }, []);

    return {
        // 房间操作
        createRoom, joinRoom, toggleReady, startGame, leaveRoom, kickPlayer,
        // 游戏操作
        actionFlip, confirmFlip, actionStop, actionTarget,
    };
}
