// Whether "Vertrek nu" notifications are on for this device, shared through localStorage

import { useSyncExternalStore } from "react"

// --- CONSTANTS ---

/** Per device, not a shared setting: notifications belong to the phone you carry. */
export const LEAVE_ALERT_STORAGE_KEY = "bestemmingsbord:leave-alert"
const CHANGE_EVENT = "bestemmingsbord:leave-alert-changed"

// --- HELPERS ---

function readEnabled(): boolean {
    try {
        return window.localStorage.getItem(LEAVE_ALERT_STORAGE_KEY) === "1"
    } catch {
        return false
    }
}

function subscribe(onChange: () => void): () => void {
    window.addEventListener(CHANGE_EVENT, onChange)
    window.addEventListener("storage", onChange)
    return () => {
        window.removeEventListener(CHANGE_EVENT, onChange)
        window.removeEventListener("storage", onChange)
    }
}

export function setLeaveAlertEnabled(enabled: boolean) {
    try {
        if (enabled) window.localStorage.setItem(LEAVE_ALERT_STORAGE_KEY, "1")
        else window.localStorage.removeItem(LEAVE_ALERT_STORAGE_KEY)
    } catch {
        // Storage blocked: the switch simply does not stick.
    }
    window.dispatchEvent(new Event(CHANGE_EVENT))
}

export function useLeaveAlertEnabled(): boolean {
    return useSyncExternalStore(subscribe, readEnabled, () => false)
}
