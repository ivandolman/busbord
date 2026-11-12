// Full-height text button ("Knop · Primair" and "Knop · Secundair")

import type { ComponentProps } from "react"

import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

// --- STYLING ---

const buttonVariants = cva(
    "text-body-m flex h-12 items-center justify-center gap-2 rounded-xl px-[18px] font-semibold disabled:opacity-50",
    {
        variants: {
            variant: {
                /** Dark fill, white label: the main action. */
                primary: "bg-dark text-on-dark",
                /** Soft grey, blue label. */
                secondary: "bg-surface text-accent hover:bg-border",
            },
        },
        defaultVariants: {
            variant: "secondary",
        },
    },
)

// --- INTERFACES ---

interface ButtonProps extends ComponentProps<"button">, VariantProps<typeof buttonVariants> {}

// --- COMPONENT ---

export function Button({ variant, type = "button", className, ...props }: ButtonProps) {
    return <button type={type} className={cn(buttonVariants({ variant }), className)} {...props} />
}
