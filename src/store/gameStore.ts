// ============================================================
// store/gameStore.ts — 游戏状态管理（Zustand）
// ============================================================
import { create } from "zustand";
import {
  type GameState,
  type Card,
  type Player,
  type PendingAction,
} from "@/types";

interface GameStore {
  state: GameState | null;
  selfId: number;
  connectionStatus: "connecting" | "connected" | "disconnected";

  // Actions
  setState: (state: GameState) => void;
  setSelfId: (id: number) => void;
  setConnectionStatus: (status: GameStore["connectionStatus"]) => void;

  // Selectors
  getCurrentPlayer: () => Player | null;
  isMyTurn: () => boolean;
  getLastFlip: () => Card | null;
  getPendingAction: () => PendingAction | null;
}

export const useGameStore = create<GameStore>((set, get) => ({
  state: null,
  selfId: 0,
  connectionStatus: "connecting",

  setState: (state) => set({ state }),
  setSelfId: (id) => set({ selfId: id }),
  setConnectionStatus: (status) => set({ connectionStatus: status }),

  getCurrentPlayer: () => {
    const { state, selfId } = get();
    return state?.players.find((p: Player) => p.id === selfId) ?? null;
  },

  isMyTurn: () => {
    const { state, selfId } = get();
    return state?.currentPlayerId === selfId;
  },

  getLastFlip: () => get().state?.lastFlip ?? null,

  getPendingAction: () => get().state?.pendingAction ?? null,
}));
