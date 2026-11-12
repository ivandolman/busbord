// Colour and sort order of network lines on the map

import type { NetworkLine } from "@/features/network/network.service"
import { MODE_COLOR } from "@/hooks/use-network"

// --- HELPERS ---

export const lineColor = (line: NetworkLine): string => line.color ?? MODE_COLOR[line.mode]

export const sortLines = (a: NetworkLine, b: NetworkLine): number =>
    a.line.localeCompare(b.line, "nl", { numeric: true })
