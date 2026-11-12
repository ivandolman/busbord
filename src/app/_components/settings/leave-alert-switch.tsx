// The "Vertrek nu" switch in the settings, asking the browser's permission when turned on

"use client"

import { useState } from "react"

import { Switch } from "@/components/ui/switch"
import { setLeaveAlertEnabled, useLeaveAlertEnabled } from "@/hooks/use-leave-alert-enabled"

import SettingsRow from "./settings-row"

// --- COMPONENT ---

export default function LeaveAlertSwitch() {
    const enabled = useLeaveAlertEnabled()
    const [denied, setDenied] = useState(false)
    const supported = typeof window !== "undefined" && "Notification" in window

    const change = async (checked: boolean) => {
        if (!checked) return setLeaveAlertEnabled(false)
        const permission =
            Notification.permission === "default"
                ? await Notification.requestPermission()
                : Notification.permission
        setDenied(permission !== "granted")
        setLeaveAlertEnabled(permission === "granted")
    }

    const detail = !supported
        ? "Deze browser kan geen meldingen tonen."
        : denied
          ? "Meldingen zijn geblokkeerd in je browser. Sta ze toe voor deze site."
          : "Alleen op dit apparaat, 2 min voor je moet gaan lopen, zolang de app open is"

    return (
        <SettingsRow title="Melding als je moet vertrekken (vaste reizen)" detail={detail}>
            <Switch
                checked={enabled && supported}
                disabled={!supported}
                onChange={(checked) => void change(checked)}
            />
        </SettingsRow>
    )
}
