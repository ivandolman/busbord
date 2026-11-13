// One suggestion in the place picker: icon, name and what kind of place it is

import type { ComponentProps } from "react"

import { cva } from "class-variance-authority"

import { Icon, type IconName } from "@/components/ui/icon"
import type { StopSearchResult } from "@/hooks/use-stop-search"

// --- CONSTANTS ---

const KIND_ICON: Record<StopSearchResult["kind"], IconName> = {
    stop: "bus",
    platform: "transfer",
    address: "home",
}

const KIND_LABEL: Record<StopSearchResult["kind"], string> = {
    stop: "Halte",
    platform: "Treinspoor",
    address: "Adres",
}

// --- STYLING ---

const optionVariants = cva("flex min-h-14 cursor-pointer items-center gap-3 px-4 py-1.5", {
    variants: {
        active: {
            true: "bg-surface",
            false: "",
        },
    },
    defaultVariants: {
        active: false,
    },
})

/** Stops in the accent colour, addresses muted: the stops are what the app is about. */
const iconVariants = cva("shrink-0", {
    variants: {
        kind: {
            stop: "text-accent",
            platform: "text-accent",
            address: "text-muted",
        },
    },
})

// --- INTERFACES ---

interface PlaceOptionProps extends Omit<ComponentProps<"li">, "children"> {
    place: StopSearchResult
    active: boolean
}

// --- COMPONENT ---

export default function PlaceOption({ place, active, className, ...props }: PlaceOptionProps) {
    return (
        <li
            role="option"
            aria-selected={active}
            className={optionVariants({ active, className })}
            {...props}
        >
            <Icon
                name={KIND_ICON[place.kind]}
                size={20}
                className={iconVariants({ kind: place.kind })}
            />
            <span className="flex min-w-0 flex-col">
                <span className="text-body-m truncate">{place.name}</span>
                <span className="text-body-s text-muted truncate">
                    {place.detail
                        ? `${KIND_LABEL[place.kind]} · ${place.detail}`
                        : KIND_LABEL[place.kind]}
                </span>
            </span>
        </li>
    )
}
