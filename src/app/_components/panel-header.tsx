// Title row of a panel in the sheet: big title, close button on the right

import { CloseButton } from "@/components/ui/close-button"

// --- INTERFACES ---

interface PanelHeaderProps {
    title: string
    onClose: () => void
}

// --- COMPONENT ---

export default function PanelHeader({ title, onClose }: PanelHeaderProps) {
    return (
        <div className="flex items-center justify-between gap-3">
            <h2 className="text-heading-xl">{title}</h2>
            <CloseButton onClick={onClose} />
        </div>
    )
}
