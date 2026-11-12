// "Instellingsrij": title and explanation left, the control right, a rule below

import type { ReactNode } from "react"

// --- INTERFACES ---

interface SettingsRowProps {
    title: string
    detail?: string
    /** The control; the whole row is its label, and so its touch target. */
    children: ReactNode
}

// --- COMPONENT ---

export default function SettingsRow({ title, detail, children }: SettingsRowProps) {
    return (
        <label className="border-border flex min-h-14 items-center gap-3 border-b py-2.5">
            <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="text-body-m font-semibold">{title}</span>
                {detail && <span className="text-body-s text-muted">{detail}</span>}
            </span>
            {children}
        </label>
    )
}
