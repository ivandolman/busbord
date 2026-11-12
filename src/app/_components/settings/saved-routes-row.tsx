// "Mijn routes" row in the settings, leading to the saved routes

import { Icon } from "@/components/ui/icon"

// --- INTERFACES ---

interface SavedRoutesRowProps {
    count: number
    onOpen: () => void
}

// --- COMPONENT ---

export default function SavedRoutesRow({ count, onOpen }: SavedRoutesRowProps) {
    return (
        <button
            type="button"
            onClick={onOpen}
            className="border-border flex min-h-14 w-full items-center justify-between gap-3 border-b py-2.5 text-left"
        >
            <span>
                <span className="text-body-m block font-semibold">Mijn routes</span>
                <span className="text-body-s text-muted block">
                    {count} {count === 1 ? "route" : "routes"} · ook als snelkoppeling op je
                    beginscherm
                </span>
            </span>
            <Icon name="chevR" size={20} className="text-foreground" />
        </button>
    )
}
