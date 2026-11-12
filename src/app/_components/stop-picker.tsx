// Place field with suggestions as you type ("Invoerveld" with a combobox list)

"use client"

import { useId, useRef, useState, type KeyboardEvent } from "react"

import { cva } from "class-variance-authority"

import { Icon, type IconName } from "@/components/ui/icon"
import { useStopSearch } from "@/hooks/use-stop-search"

// --- STYLING ---

const optionVariants = cva("text-body-m flex min-h-11 cursor-pointer items-center px-4", {
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

// --- INTERFACES ---

export interface StopOption {
    id: string
    name: string
}

interface StopPickerProps {
    label: string
    /** Icon left of the field: locate for "Van", pin for "Naar". */
    icon?: IconName
    placeholder: string
    value: StopOption | null
    onChange: (stop: StopOption | null) => void
}

// --- COMPONENT ---

export default function StopPicker({
    label,
    icon = "locate",
    placeholder,
    value,
    onChange,
}: StopPickerProps) {
    const inputId = useId()
    const listId = useId()
    const [text, setText] = useState(value?.name ?? "")
    const [open, setOpen] = useState(false)
    const [clearedByTyping, setClearedByTyping] = useState(false)
    const blurTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
    const selectedId = value?.id
    const selectedName = value?.name

    // Follow selections made elsewhere (the swap button, or a name resolved from the URL), but
    // leave the text alone when the selection was dropped because the user started typing.
    const [followed, setFollowed] = useState({ selectedId, selectedName })
    if (followed.selectedId !== selectedId || followed.selectedName !== selectedName) {
        setFollowed({ selectedId, selectedName })
        if (selectedId !== undefined) setText(selectedName ?? "")
        else if (!clearedByTyping) setText("")
        setClearedByTyping(false)
    }

    const query = text.trim()
    const { options, active, setActive } = useStopSearch(
        query,
        open && query.length >= 2 && query !== selectedName,
    )

    const choose = (stop: StopOption) => {
        onChange(stop)
        setText(stop.name)
        setOpen(false)
    }

    const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
        if (event.key === "Escape") {
            setOpen(false)
            return
        }
        if (options.length === 0) return
        if (event.key === "ArrowDown") {
            event.preventDefault()
            setActive((index) => (index + 1) % options.length)
        } else if (event.key === "ArrowUp") {
            event.preventDefault()
            setActive((index) => (index - 1 + options.length) % options.length)
        } else if (event.key === "Enter") {
            event.preventDefault()
            const option = options[active]
            if (option) choose(option)
        }
    }

    const showList = open && options.length > 0

    return (
        <div className="relative">
            {/* "Invoerveld": icon, small label, the place in bold; blue ring while typing. */}
            <div className="bg-surface focus-within:border-accent focus-within:bg-background flex h-14 items-center gap-3 rounded-xl border-2 border-transparent px-3">
                <Icon name={icon} size={20} className="text-accent" />
                <div className="flex min-w-0 flex-1 flex-col">
                    <label htmlFor={inputId} className="text-body-s text-muted">
                        {label}
                    </label>
                    <input
                        id={inputId}
                        type="text"
                        role="combobox"
                        aria-expanded={showList}
                        aria-controls={listId}
                        aria-autocomplete="list"
                        aria-activedescendant={showList ? `${listId}-${active}` : undefined}
                        autoComplete="off"
                        spellCheck={false}
                        maxLength={60}
                        placeholder={placeholder}
                        value={text}
                        onChange={(event) => {
                            setText(event.target.value)
                            setOpen(true)
                            if (value) {
                                setClearedByTyping(true)
                                onChange(null)
                            }
                        }}
                        onFocus={(event) => {
                            if (blurTimer.current) clearTimeout(blurTimer.current)
                            setOpen(true)
                            event.target.select()
                        }}
                        onBlur={() => {
                            // Delay so a click on an option lands before the list disappears.
                            blurTimer.current = setTimeout(() => setOpen(false), 150)
                        }}
                        onKeyDown={onKeyDown}
                        className="text-body-m text-foreground placeholder:text-muted w-full bg-transparent font-semibold outline-none placeholder:font-normal"
                    />
                </div>
            </div>
            <ul
                id={listId}
                role="listbox"
                hidden={!showList}
                className="bg-background absolute z-10 mt-1 max-h-72 w-full overflow-auto rounded-xl py-1 shadow-[0_4px_20px_rgba(0,0,0,0.16)]"
            >
                {options.map((option, index) => (
                    <li
                        key={option.id}
                        id={`${listId}-${index}`}
                        role="option"
                        aria-selected={index === active}
                        onMouseDown={(event) => event.preventDefault()}
                        onClick={() => choose(option)}
                        onMouseEnter={() => setActive(index)}
                        className={optionVariants({ active: index === active })}
                    >
                        {option.name}
                    </li>
                ))}
            </ul>
        </div>
    )
}
