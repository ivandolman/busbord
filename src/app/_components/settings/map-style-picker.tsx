// Choice of background map ("Rustige" or "Gedetailleerde kaart") as two preview cards

"use client"

import Image from "next/image"

import { cva } from "class-variance-authority"

import { Icon } from "@/components/ui/icon"
import type { Settings } from "@/hooks/use-settings"

// --- CONSTANTS ---

const MAP_STYLES: { value: Settings["mapStyle"]; label: string }[] = [
    { value: "calm", label: "Rustige kaart" },
    { value: "detailed", label: "Gedetailleerde kaart" },
]

// --- STYLING ---

const cardVariants = cva("flex min-w-0 flex-1 flex-col gap-1.5 rounded-[14px] p-1 text-left", {
    variants: {
        selected: {
            true: "border-accent border-[2.5px]",
            false: "border-border hover:border-muted border",
        },
    },
    defaultVariants: {
        selected: false,
    },
})

// --- INTERFACES ---

interface MapStylePickerProps {
    value: Settings["mapStyle"]
    onChange: (value: Settings["mapStyle"]) => void
}

// --- COMPONENT ---

export default function MapStylePicker({ value, onChange }: MapStylePickerProps) {
    return (
        <div role="radiogroup" aria-label="Achtergrondkaart" className="flex gap-2.5">
            {MAP_STYLES.map((style) => {
                const selected = value === style.value
                return (
                    <button
                        key={style.value}
                        type="button"
                        role="radio"
                        aria-checked={selected}
                        onClick={() => onChange(style.value)}
                        className={cardVariants({ selected })}
                    >
                        <Image
                            src={`/map-styles/${style.value}.png`}
                            alt=""
                            width={163}
                            height={84}
                            sizes="(min-width: 1024px) 182px, 50vw"
                            unoptimized
                            className="h-[84px] w-full rounded-[10px] object-cover"
                        />
                        <span className="text-body-s flex items-center justify-between px-1.5 pb-1 font-semibold">
                            {style.label}
                            {selected && <Icon name="check" size={18} className="text-accent" />}
                        </span>
                    </button>
                )
            })}
        </div>
    )
}
