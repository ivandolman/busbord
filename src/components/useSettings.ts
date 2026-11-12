"use client";

import { useCallback, useEffect, useSyncExternalStore } from "react";

/** Mirrors Settings in src/lib/user-data.ts (server-only module). */
export interface Settings {
  walkTieMinutes: number;
  mapStyle: "calm" | "detailed";
  maxWalkMinutes: number;
}

const DEFAULTS: Settings = { walkTieMinutes: 2, mapStyle: "calm", maxWalkMinutes: 12 };

/** Query parameters that pass the walking settings to the API (and keep cached answers apart). */
export function walkParams(settings: Settings): Record<string, string> {
  return { tie: String(settings.walkTieMinutes), maxWalk: String(settings.maxWalkMinutes) };
}

type State = { settings: Settings; loaded: boolean };

const SERVER_SNAPSHOT: State = { settings: DEFAULTS, loaded: false };
let state: State = SERVER_SNAPSHOT;
let loading: Promise<void> | null = null;
const listeners = new Set<() => void>();

function set(next: State) {
  state = next;
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function parse(body: unknown): Settings {
  const input = (body ?? {}) as { walkTieMinutes?: unknown; mapStyle?: unknown; maxWalkMinutes?: unknown };
  return {
    walkTieMinutes: typeof input.walkTieMinutes === "number" ? input.walkTieMinutes : DEFAULTS.walkTieMinutes,
    mapStyle: input.mapStyle === "detailed" ? "detailed" : "calm",
    maxWalkMinutes: typeof input.maxWalkMinutes === "number" ? input.maxWalkMinutes : DEFAULTS.maxWalkMinutes,
  };
}

function load(): Promise<void> {
  loading ??= fetch("/api/settings")
    .then((response) => (response.ok ? response.json() : Promise.reject(new Error())))
    .then((body: unknown) => set({ settings: parse(body), loaded: true }))
    .catch(() => set({ settings: DEFAULTS, loaded: true }));
  return loading;
}

/** Settings stored on the server (/api/settings), shared by every component on the page. */
export function useSettings() {
  const current = useSyncExternalStore(subscribe, () => state, () => SERVER_SNAPSHOT);
  useEffect(() => void load(), []);

  const update = useCallback(async (settings: Settings) => {
    const before = state.settings;
    set({ ...state, settings });
    try {
      const response = await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(settings),
      });
      if (!response.ok) throw new Error();
      set({ ...state, settings: parse(await response.json()) });
    } catch {
      set({ ...state, settings: before });
    }
  }, []);

  return { settings: current.settings, loaded: current.loaded, update };
}
