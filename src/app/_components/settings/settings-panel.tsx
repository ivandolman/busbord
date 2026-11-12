// "Kaart & instellingen": the options you set once and rarely touch, behind the layers button

"use client"

import type { ReactNode } from "react"

import PanelHeader from "@/app/_components/panel-header"
import { Select } from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { useSettings } from "@/hooks/use-settings"
import { useTheme, type Theme } from "@/hooks/use-theme"

import MapStylePicker from "./map-style-picker"
import SettingsRow from "./settings-row"

// --- CONSTANTS ---

/** Choices for how much longer a trip may take to walk less (see pickBestPairPerTrip). */
const WALK_TIE_OPTIONS = [0, 1, 2, 3, 4, 5, 7, 10, 15]
/** Choices for the longest walk to a stop. */
const MAX_WALK_OPTIONS = [3, 5, 8, 10, 12, 15, 20, 25]

const THEMES: { value: Theme; label: string }[] = [
    { value: "auto", label: "Automatisch" },
    { value: "light", label: "Licht" },
    { value: "dark", label: "Donker" },
]

// --- INTERFACES ---

interface SettingsPanelProps {
    walk: boolean
    onWalkChange: (walk: boolean) => void
    /** Slot for the "Vertrek nu" switch, which lives with the notifications code. */
    notifications?: ReactNode
    /** Slot for the "Mijn routes" row. */
    savedRoutes?: ReactNode
    /** Slot for "Uitloggen" when the app has a login. */
    account?: ReactNode
    onClose: () => void
}

// --- HELPERS ---

const isTheme = (value: string): value is Theme => THEMES.some((theme) => theme.value === value)

// --- COMPONENT ---

export default function SettingsPanel({
    walk,
    onWalkChange,
    notifications,
    savedRoutes,
    account,
    onClose,
}: SettingsPanelProps) {
    const { settings, update } = useSettings()
    const [theme, setTheme] = useTheme()

    return (
        <div className="flex flex-col gap-3">
            <PanelHeader title="Kaart & instellingen" onClose={onClose} />
            <MapStylePicker
                value={settings.mapStyle}
                onChange={(mapStyle) => void update({ ...settings, mapStyle })}
            />
            <div className="flex items-center justify-between pt-2">
                <h3 className="text-body-m font-semibold">Instellingen</h3>
                <span className="text-body-s text-muted">
                    {walk ? `max ${settings.maxWalkMinutes} min lopen` : "alleen gekozen haltes"}
                </span>
            </div>
            <div className="flex flex-col">
                <SettingsRow
                    title="Ook haltes op loopafstand"
                    detail="Ook verderop instappen als dat sneller is"
                >
                    <Switch checked={walk} onChange={onWalkChange} />
                </SettingsRow>
                <SettingsRow
                    title="Maximaal lopen naar een halte"
                    detail={
                        walk
                            ? MAX_WALK_OPTIONS.join(" · ") + " min"
                            : "Zet haltes op loopafstand aan"
                    }
                >
                    <Select
                        name="max-walk"
                        value={settings.maxWalkMinutes}
                        disabled={!walk}
                        onChange={(event) =>
                            void update({ ...settings, maxWalkMinutes: Number(event.target.value) })
                        }
                    >
                        {MAX_WALK_OPTIONS.map((minutes) => (
                            <option key={minutes} value={minutes}>
                                {minutes} min
                            </option>
                        ))}
                    </Select>
                </SettingsRow>
                <SettingsRow title="Minder lopen mag langer duren" detail="nee, of tot 1 … 15 min">
                    <Select
                        name="walk-tie"
                        value={settings.walkTieMinutes}
                        onChange={(event) =>
                            void update({ ...settings, walkTieMinutes: Number(event.target.value) })
                        }
                    >
                        {WALK_TIE_OPTIONS.map((minutes) => (
                            <option key={minutes} value={minutes}>
                                {minutes === 0 ? "nee" : `tot ${minutes} min`}
                            </option>
                        ))}
                    </Select>
                </SettingsRow>
                <SettingsRow title="Weergave" detail="Automatisch volgt je telefoon of computer">
                    <Select
                        name="theme"
                        value={theme}
                        onChange={(event) => {
                            if (isTheme(event.target.value)) setTheme(event.target.value)
                        }}
                    >
                        {THEMES.map((option) => (
                            <option key={option.value} value={option.value}>
                                {option.label}
                            </option>
                        ))}
                    </Select>
                </SettingsRow>
                {notifications}
                {savedRoutes}
                {account}
            </div>
        </div>
    )
}
