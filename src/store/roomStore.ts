// ============================================================
// store/roomStore.ts — 房间状态管理
// ============================================================
import { create } from "zustand";
import type { Player } from "@/types";

type RoomPhase = "created" | "waiting" | "all_joined" | "all_ready" | "playing";

interface RoomStore {
  roomCode: string;
  phase: RoomPhase;
  players: Player[];
  selfId: number;
  hostId: number;
  isHost: boolean;
  error: string | null;

  // Actions
  setRoom: (roomCode: string, selfId: number, hostId: number) => void;
  updatePlayers: (players: Player[]) => void;
  setSelfId: (selfId: number) => void;
  setHost: (hostId: number) => void;
  setPhase: (phase: RoomPhase) => void;
  setError: (error: string | null) => void;
  reset: () => void;
}

export const useRoomStore = create<RoomStore>((set, get) => ({
  roomCode: "",
  phase: "waiting",
  players: [],
  selfId: 0,
  hostId: 0,
  isHost: false,
  error: null,

  setRoom: (roomCode, selfId, hostId) =>
    set({
      roomCode,
      selfId,
      hostId,
      isHost: selfId === hostId,
      error: null,
    }),

  updatePlayers: (players) => set({ players }),

  setSelfId: (selfId) => set((s) => ({ selfId, isHost: selfId === s.hostId })),

  setHost: (hostId) => set((s) => ({ hostId, isHost: s.selfId === hostId })),

  setPhase: (phase) => set({ phase }),

  setError: (error) => set({ error }),

  reset: () =>
    set({
      roomCode: "",
      phase: "waiting",
      players: [],
      selfId: 0,
      hostId: 0,
      isHost: false,
      error: null,
    }),
}));
