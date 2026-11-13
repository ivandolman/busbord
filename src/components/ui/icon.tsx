// Line icon of the design, drawn as a CSS mask so it takes the surrounding text colour

import { cn } from "@/lib/utils"

// --- CONSTANTS ---

/**
 * The line icons of the design ("Icoon/…" in Figma, 24×24 at a 2 px stroke). Each SVG in
 * public/icons is the icon's drawn group; GEOMETRY places it in the 24×24 box exactly as Figma
 * does (outer inset of the group, then the stroke overhang). The SVG is used as a mask, so the
 * icon takes the text colour of where it sits.
 */
const GEOMETRY = {
    search: ["16.67%", "-6.25%"],
    swap: ["16.67% 12.5%", "-6.25% -5.56%"],
    map: ["16.67% 12.5%", "-6.25% -5.56%"],
    locate: ["8.33%", "-5%"],
    bell: ["20.83% 16.67% 12.5% 16.67%", "-6.25%"],
    walk: ["8.33% 33.33% 8.33% 29.17%", "-5% -11.11%"],
    chevR: ["25% 37.5%", "-8.33% -16.67%"],
    chevL: ["25% 37.5%", "-8.33% -16.67%"],
    chevD: ["37.5% 25%", "-16.67% -8.33%"],
    chevU: ["37.5% 25%", "-16.67% -8.33%"],
    clock: ["12.5%", "-5.56%"],
    alert: ["12.5% 8.33% 16.67% 8.33%", "-5.88% -5%"],
    offline: ["8.33%", "-5%"],
    x: ["25%", "-8.33%"],
    pin: ["12.5% 20.83%", "-5.56% -7.14%"],
    home: ["16.67% 12.5%", "-6.25% -5.56%"],
    work: ["20.83% 12.5% 16.67% 12.5%", "-6.67% -5.56%"],
    layers: ["12.5% 8.33% 25% 8.33%", "-6.67% -5%"],
    check: ["29.17% 20.83%", "-10% -7.14%"],
    plus: ["20.83%", "-7.14%"],
    minus: ["50% 20.83%", "-1px -7.14%"],
    arrowR: ["25% 20.83%", "-8.33% -7.14%"],
    star: ["12.5% 13.33% 17.08% 13.33%", "-5.92% -5.68%"],
    flag: ["16.67% 33.33% 12.5% 20.83%", "-5.88% -9.09%"],
    transfer: ["16.67%", "-6.25%"],
    route: ["12.5% 16.67%", "-5.56% -6.25%"],
    snooze: ["12.5% 8.33%", "-5.56% -5%"],
    cross: ["12.5%", "-5.56%"],
    bus: ["12.5% 20.83% 16.67% 20.83%", "-5.88% -7.14%"],
    edit: ["20.83% 20.83% 16.67% 16.67%", "-6.67%"],
} as const

// --- INTERFACES ---

export type IconName = keyof typeof GEOMETRY

interface IconProps {
    name: IconName
    size?: number
    className?: string
}

// --- HELPERS ---

/** Insets and mask of an icon's two nested boxes; shared with the DOM-built map popups. */
export function iconLayers(name: IconName): { outer: string; inner: string; mask: string } {
    const [outer, inner] = GEOMETRY[name]
    return { outer, inner, mask: `url(/icons/${name}.svg) center / 100% 100% no-repeat` }
}

// --- COMPONENT ---

export function Icon({ name, size = 24, className }: IconProps) {
    const { outer, inner, mask } = iconLayers(name)
    return (
        <span
            aria-hidden="true"
            className={cn("relative inline-block shrink-0 overflow-hidden", className)}
            style={{ width: size, height: size }}
        >
            <span className="absolute" style={{ inset: outer }}>
                <span
                    className="absolute bg-current"
                    style={{ inset: inner, mask, WebkitMask: mask }}
                />
            </span>
        </span>
    )
}
