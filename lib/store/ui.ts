import { useSyncExternalStore } from "react";

/** Chrome-level UI state: things the keyboard shortcuts toggle. */
export interface UiState {
  chromeHidden: boolean;
  simBadge: boolean;
  sidebarOpen: boolean;
  reelActive: boolean;
  reelStep: number;
  reelDraft: { module: string; text: string } | null;
  paletteOpen: boolean;
  shortcutsOpen: boolean;
}

let state: UiState = {
  chromeHidden: false,
  simBadge: true,
  sidebarOpen: false,
  reelActive: false,
  reelStep: 0,
  reelDraft: null,
  paletteOpen: false,
  shortcutsOpen: false,
};

const listeners = new Set<() => void>();

export function getUi(): UiState {
  return state;
}

export function setUi(patch: Partial<UiState>): void {
  state = { ...state, ...patch };
  for (const fn of listeners) fn();
}

function subscribe(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function useUi(): UiState {
  return useSyncExternalStore(subscribe, getUi, getUi);
}
