// "Meldingen": diversions and other notices, one line each, the full text on a tap

import type { Board } from "@/features/board/board.types"

// --- INTERFACES ---

interface AlertListProps {
    alerts: Board["alerts"]
}

// --- COMPONENT ---

export default function AlertList({ alerts }: AlertListProps) {
    if (alerts.length === 0) return null
    return (
        <section
            aria-label="Meldingen"
            className="border-warning-border bg-warning-bg text-warning flex flex-col gap-2 rounded-[14px] border p-3"
        >
            {alerts.map((alert) => (
                <details key={alert.id} className="group">
                    <summary className="flex cursor-pointer list-none items-start gap-2 font-semibold [&::-webkit-details-marker]:hidden">
                        <span aria-hidden="true" className="text-body-m">
                            ⚠
                        </span>
                        <span className="text-body-s line-clamp-2 flex-1 group-open:line-clamp-none">
                            {alert.header}
                        </span>
                    </summary>
                    {alert.description && alert.description !== alert.header && (
                        <p className="text-body-s mt-1 pl-6 whitespace-pre-line">
                            {alert.description}
                        </p>
                    )}
                </details>
            ))}
        </section>
    )
}
