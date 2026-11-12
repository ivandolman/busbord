"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { formatClock } from "@/lib/board/format";
import { overview, shortHeadsign } from "@/lib/board/group";
import type { Board } from "@/lib/board/types";
import { isScheduledAt, type SavedRoute } from "@/lib/saved-routes";
import { Switch } from "./SettingsPanel";

/** Per device, not a shared setting: notifications belong to the phone you carry. */
const STORAGE_KEY = "bestemmingsbord:leave-alert";
const CHANGE_EVENT = "bestemmingsbord:leave-alert-changed";
/** How long before you have to set off the notification comes. */
const WARN_SECONDS = 2 * 60;

function readEnabled(): boolean {
  try {
    return window.localStorage.getItem(STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

function subscribe(onChange: () => void): () => void {
  window.addEventListener(CHANGE_EVENT, onChange);
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(CHANGE_EVENT, onChange);
    window.removeEventListener("storage", onChange);
  };
}

function useEnabled(): boolean {
  return useSyncExternalStore(subscribe, readEnabled, () => false);
}

function setEnabled(enabled: boolean) {
  try {
    if (enabled) window.localStorage.setItem(STORAGE_KEY, "1");
    else window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Storage blocked: the switch simply does not stick.
  }
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

async function notify(title: string, body: string, url: string) {
  const options: NotificationOptions = { body, tag: "vertrek-nu", icon: "/icon.svg", data: { url } };
  const registration = "serviceWorker" in navigator ? await navigator.serviceWorker.getRegistration() : undefined;
  if (registration) await registration.showNotification(title, options);
  else new Notification(title, options);
}

/** The switch in the settings, with the browser's permission asked when it is turned on. */
export function LeaveAlertSwitch() {
  const enabled = useEnabled();
  const [denied, setDenied] = useState(false);
  const supported = typeof window !== "undefined" && "Notification" in window;

  const change = async (checked: boolean) => {
    if (!checked) return setEnabled(false);
    const permission = Notification.permission === "default" ? await Notification.requestPermission() : Notification.permission;
    setDenied(permission !== "granted");
    setEnabled(permission === "granted");
  };

  return (
    <label className="flex min-h-14 items-center gap-3 border-b border-rand py-2.5">
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="text-body-m font-semibold">Melding als je moet vertrekken (vaste reizen)</span>
        <span className="text-body-s text-tekst-zacht">
          {!supported
            ? "Deze browser kan geen meldingen tonen."
            : denied
              ? "Meldingen zijn geblokkeerd in je browser. Sta ze toe voor deze site."
              : "Alleen op dit apparaat, 2 min voor je moet gaan lopen, zolang de app open is"}
        </span>
      </span>
      <Switch checked={enabled && supported} disabled={!supported} onChange={(checked) => void change(checked)} />
    </label>
  );
}

/**
 * During a regular trip's time window, warns WARN_SECONDS before you must leave for the bus the
 * board tells you to take. Each bus once. Re-planned on every board refresh, so a delay moves it.
 */
export function useLeaveAlert(board: Board | null, route: SavedRoute | null, now: number) {
  const enabled = useEnabled();
  const pick = board ? overview(board.departures, board.origin.name).pick : null;
  const active = enabled && route?.schedule && isScheduledAt(route.schedule, new Date(now * 1000));
  const key = pick ? `${pick.tripId}|${pick.plannedDeparture}` : null;
  const leaveAt = pick?.leaveAt ?? null;

  useEffect(() => {
    if (!active || !pick || !key || leaveAt === null || !route || Notification.permission !== "granted") return;
    const sent = new Set(JSON.parse(sessionStorage.getItem(STORAGE_KEY) ?? "[]") as string[]);
    if (sent.has(key)) return;
    const fire = () => {
      sent.add(key);
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify([...sent].slice(-20)));
      const towards = pick.headsign ? shortHeadsign(pick.headsign, board?.origin.name ?? "") : "";
      const walk = pick.walkToSeconds > 0 ? ` Lopen: ${Math.round(pick.walkToSeconds / 60)} min.` : "";
      const platform = pick.from.platform ? `, perron ${pick.from.platform}` : "";
      const query = new URLSearchParams({ from: route.from.id, to: route.to.id });
      void notify(
        `Vertrek nu: ${route.name}`,
        `Lijn ${pick.line}${towards ? ` → ${towards}` : ""} vertrekt om ${formatClock(pick.expectedDeparture)}${platform}.${walk}`,
        `/?${query}`,
      );
    };
    const delay = (leaveAt - WARN_SECONDS) * 1000 - Date.now();
    // Opened (or refreshed) inside the warning window: warn straight away, unless it is too late.
    if (delay <= 0) {
      if (Date.now() < leaveAt * 1000) fire();
      return;
    }
    const timer = setTimeout(fire, delay);
    return () => clearTimeout(timer);
    // `pick` changes identity on every refresh; key and leaveAt say whether anything changed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, key, leaveAt, route?.id]);
}
