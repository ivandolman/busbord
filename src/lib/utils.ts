// Class name helper: merges conditional class lists and resolves Tailwind conflicts

import { clsx, type ClassValue } from "clsx"
import { extendTailwindMerge } from "tailwind-merge"

// --- CONSTANTS ---

// The custom font sizes from styles/theme/typography.css; without them tailwind-merge reads
// "text-body-s" as a colour and drops it next to "text-muted".
const twMerge = extendTailwindMerge({
    extend: {
        theme: {
            text: [
                "heading-xl",
                "heading-l",
                "heading-m",
                "body-m",
                "body-s",
                "label-xs",
                "badge-m",
                "badge-l",
                "figure-l",
                "figure-m",
            ],
        },
    },
})

// --- HELPERS ---

export function cn(...inputs: ClassValue[]): string {
    return twMerge(clsx(inputs))
}
