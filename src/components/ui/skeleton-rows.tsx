// Grey placeholder rows in the shape of a departure list, shown while times load

import { cn } from "@/lib/utils"

// --- CONSTANTS ---

/** Varied text widths, so the placeholder reads as a list and not as a grid. */
const TEXT_WIDTHS = ["62%", "48%", "70%", "54%", "40%", "66%"]

// --- INTERFACES ---

interface SkeletonRowsProps {
    /** Read out instead of the rows (localized). */
    label: string
    rows?: number
    /** Starts with a block the size of the board's "Pak deze" card. */
    withCard?: boolean
    className?: string
}

// --- COMPONENT ---

export function SkeletonRows({ label, rows = 4, withCard = false, className }: SkeletonRowsProps) {
    return (
        <div
            role="status"
            className={cn("flex animate-pulse flex-col motion-reduce:animate-none", className)}
        >
            <span className="sr-only">{label}</span>
            {withCard && <div aria-hidden="true" className="bg-surface mb-3 h-36 rounded-2xl" />}
            {Array.from({ length: rows }, (_, index) => (
                <div
                    key={index}
                    aria-hidden="true"
                    className="border-border flex min-h-12 items-center gap-2.5 border-t py-2"
                >
                    <span className="bg-surface h-4 w-12 rounded" />
                    <span className="bg-surface h-6 w-9 rounded-md" />
                    <span
                        className="bg-surface h-4 rounded"
                        style={{ width: TEXT_WIDTHS[index % TEXT_WIDTHS.length] }}
                    />
                </div>
            ))}
        </div>
    )
}
