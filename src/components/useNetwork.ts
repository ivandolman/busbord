"use client";

import { useEffect, useSyncExternalStore } from "react";
import type { Mode } from "@/lib/board/types";
import type { Network } from "@/lib/network/network";

/** Fallback colour per mode, for lines the feed gives no colour. */
export const MODE_COLOR: Record<Mode, string> = {
  tram: "#d97706",
  bus: "#0d9488",
  metro: "#0284c7",
  train: "#4f46e5",
  ferry: "#57534e",
  other: "#57534e",
};

/** Black or white, whichever reads better on a "#rrggbb" background (yellow lines need black). */
export function textOn(background: string): string {
  const match = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(background);
  if (!match) return "#ffffff";
  const [r, g, b] = match.slice(1).map((hex) => parseInt(hex, 16) / 255) as [number, number, number];
  return 0.299 * r + 0.587 * g + 0.114 * b > 0.6 ? "#111418" : "#ffffff";
}

type State = { network: Network | null; failed: boolean; colors: Map<string, string> };

const EMPTY: State = { network: null, failed: false, colors: new Map() };
let state: State = EMPTY;
let loading: Promise<void> | null = null;
const listeners = new Set<() => void>();

const colorKey = (line: string, mode: Mode) => `${mode}|${line}`;

function set(next: State) {
  state = next;
  for (const listener of listeners) listener();
}

function load(): Promise<void> {
  loading ??= fetch("/api/network")
    .then((response) => (response.ok ? (response.json() as Promise<Network>) : Promise.reject(new Error())))
    .then((network) => {
      const colors = new Map<string, string>();
      for (const line of network.lines) {
        if (line.color && !colors.has(colorKey(line.line, line.mode))) colors.set(colorKey(line.line, line.mode), line.color);
      }
      set({ network, failed: false, colors });
    })
    .catch(() => {
      loading = null;
      set({ ...state, failed: true });
    });
  return loading;
}

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

/** The line network (/api/network), fetched once and shared by the map and the line badges. */
export function useNetwork(): State {
  const current = useSyncExternalStore(subscribe, () => state, () => EMPTY);
  useEffect(() => void load(), []);
  return current;
}

/** A line's own colour (the operator's), or its mode's colour until the network is in. */
export function useLineColor(line: string, mode: Mode): string {
  const { colors } = useNetwork();
  return colors.get(colorKey(line, mode)) ?? MODE_COLOR[mode];
}
