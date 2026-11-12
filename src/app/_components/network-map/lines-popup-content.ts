// DOM content of the popup that lists every line under the pointer

import { MODE_LABEL } from "@/features/board/format"
import type { NetworkLine } from "@/features/network/network.service"
import { textOn } from "@/hooks/use-network"

import { lineColor } from "./map-lines"

// --- HELPERS ---

/** Popup listing every line that runs where the user clicked, each with a "show only" button. */
export function linesPopupContent(
    lines: NetworkLine[],
    onShowOnly: (line: NetworkLine) => void,
): HTMLElement {
    const root = document.createElement("div")
    root.className = "flex w-64 flex-col gap-2 p-4 text-foreground"
    const heading = document.createElement("p")
    heading.className = "text-heading-m"
    heading.textContent =
        lines.length === 1 ? "1 lijn op dit stuk" : `${lines.length} lijnen op dit stuk`
    root.append(heading)
    const list = document.createElement("ul")
    list.className = "max-h-56 space-y-1 overflow-auto"
    for (const line of lines) {
        const item = document.createElement("li")
        const button = document.createElement("button")
        button.type = "button"
        button.title = "Toon alleen deze lijn"
        button.className =
            "flex min-h-11 w-full items-center gap-2.5 rounded-lg px-1 text-left hover:bg-surface"
        const badge = document.createElement("span")
        badge.className =
            "inline-flex min-w-[34px] shrink-0 justify-center rounded-[6px] px-[7px] py-[3px] text-badge-m"
        badge.style.background = lineColor(line)
        badge.style.color = textOn(lineColor(line))
        badge.textContent = line.line || "?"
        const text = document.createElement("span")
        text.className = "min-w-0 flex-1 truncate text-body-s text-foreground"
        text.textContent = `${MODE_LABEL[line.mode]}${line.name ? ` · ${line.name}` : ""}`
        button.append(badge, text)
        button.addEventListener("click", () => onShowOnly(line))
        item.append(button)
        list.append(item)
    }
    root.append(list)
    const hint = document.createElement("p")
    hint.className = "text-body-s text-muted"
    hint.textContent = "Klik een lijn om alleen die te tonen."
    root.append(hint)
    return root
}
