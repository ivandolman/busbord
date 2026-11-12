// DOM content of the small map popups: a title, a detail line, a note and action buttons

// --- INTERFACES ---

export interface PopupAction {
    label: string
    onClick: () => void
}

// --- HELPERS ---

/** Builds popup content as DOM so buttons can call back into React without HTML strings. */
export function popupContent(
    title: string | null,
    detail: string | null,
    note: string | null,
    actions: PopupAction[],
): HTMLElement {
    const root = document.createElement("div")
    root.className = "flex w-64 flex-col gap-2 p-4 text-foreground"
    if (title) {
        const heading = document.createElement("p")
        heading.className = "text-heading-m"
        heading.textContent = title
        root.append(heading)
    }
    if (detail) {
        const text = document.createElement("p")
        text.dataset.role = "detail"
        text.className = "text-body-s text-muted"
        text.textContent = detail
        root.append(text)
    }
    if (note) {
        const text = document.createElement("p")
        text.className = "text-body-s text-warning"
        text.textContent = note
        root.append(text)
    }
    if (actions.length > 0) {
        const row = document.createElement("div")
        row.className = "flex gap-2"
        for (const action of actions) {
            const button = document.createElement("button")
            button.type = "button"
            button.className =
                "h-11 flex-1 rounded-xl bg-surface px-3 text-body-m font-semibold text-accent hover:bg-border"
            button.textContent = action.label
            button.addEventListener("click", action.onClick)
            row.append(button)
        }
        root.append(row)
    }
    return root
}
