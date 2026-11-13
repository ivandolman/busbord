// DOM content of the small map popups: a badge, title and detail, a close cross and action buttons

import { iconLayers, type IconName } from "@/components/ui/icon"

// --- INTERFACES ---

export interface PopupAction {
    label: string
    icon?: IconName
    onClick: () => void
}

interface PopupOptions {
    title: string
    detail: string | null
    /** Icon in the round badge before the title. */
    badge: IconName
    actions: PopupAction[]
    onClose: () => void
}

// --- HELPERS ---

/** The DOM twin of `<Icon>`: the line icon as a mask in the surrounding text colour. */
function iconNode(name: IconName, size: number): HTMLElement {
    const { outer, inner, mask } = iconLayers(name)
    const root = document.createElement("span")
    root.setAttribute("aria-hidden", "true")
    root.className = "relative inline-block shrink-0 overflow-hidden"
    root.style.width = root.style.height = `${size}px`
    const box = document.createElement("span")
    box.className = "absolute"
    box.style.inset = outer
    const shape = document.createElement("span")
    shape.className = "absolute bg-current"
    shape.style.inset = inner
    shape.style.mask = mask
    shape.style.setProperty("-webkit-mask", mask)
    box.append(shape)
    root.append(box)
    return root
}

/** Builds popup content as DOM so buttons can call back into React without HTML strings. */
export function popupContent({
    title,
    detail,
    badge,
    actions,
    onClose,
}: PopupOptions): HTMLElement {
    const root = document.createElement("div")
    root.className = "flex w-72 flex-col gap-3 p-3 text-foreground"

    const header = document.createElement("div")
    header.className = "flex items-center gap-2.5"
    const badgeBox = document.createElement("span")
    badgeBox.className =
        "flex size-9 shrink-0 items-center justify-center rounded-full bg-accent text-on-dark"
    badgeBox.append(iconNode(badge, 20))
    const text = document.createElement("div")
    text.className = "min-w-0 flex-1"
    const heading = document.createElement("div")
    heading.className = "text-body-m truncate font-semibold"
    heading.textContent = title
    text.append(heading)
    if (detail) {
        const line = document.createElement("div")
        line.dataset.role = "detail"
        line.className = "text-body-s text-muted"
        line.textContent = detail
        text.append(line)
    }
    const close = document.createElement("button")
    close.type = "button"
    close.ariaLabel = "Sluiten"
    close.className =
        "flex size-9 shrink-0 items-center justify-center rounded-full bg-surface text-foreground hover:bg-border"
    close.append(iconNode("x", 18))
    close.addEventListener("click", onClose)
    header.append(badgeBox, text, close)
    root.append(header)

    if (actions.length > 0) {
        const row = document.createElement("div")
        row.className = "flex gap-2"
        for (const action of actions) {
            const button = document.createElement("button")
            button.type = "button"
            button.className =
                "inline-flex h-11 flex-1 items-center whitespace-nowrap justify-center gap-1.5 rounded-xl bg-surface px-3 text-body-m font-semibold text-accent hover:bg-border"
            if (action.icon) button.append(iconNode(action.icon, 18))
            button.append(action.label)
            button.addEventListener("click", action.onClick)
            row.append(button)
        }
        root.append(row)
    }
    return root
}
