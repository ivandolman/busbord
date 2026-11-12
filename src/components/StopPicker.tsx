"use client";

import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import { Icon, type IconName } from "./Icon";

export interface StopOption {
  id: string;
  name: string;
}

interface StopPickerProps {
  label: string;
  /** Icon left of the field: locate for "Van", pin for "Naar". */
  icon?: IconName;
  placeholder: string;
  value: StopOption | null;
  onChange: (stop: StopOption | null) => void;
}

const SEARCH_DEBOUNCE_MS = 200;

export function StopPicker({ label, icon = "locate", placeholder, value, onChange }: StopPickerProps) {
  const inputId = useId();
  const listId = useId();
  const [text, setText] = useState(value?.name ?? "");
  const [options, setOptions] = useState<StopOption[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const blurTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const clearedByTyping = useRef(false);
  const selectedId = value?.id;
  const selectedName = value?.name;

  // Follow selections made elsewhere (the swap button, or a name resolved from the URL), but
  // leave the text alone when the selection was dropped because the user started typing.
  useEffect(() => {
    if (selectedId !== undefined) {
      setText(selectedName ?? "");
    } else if (!clearedByTyping.current) {
      setText("");
    }
    clearedByTyping.current = false;
  }, [selectedId, selectedName]);

  useEffect(() => {
    const query = text.trim();
    if (!open || query.length < 2 || query === selectedName) {
      setOptions([]);
      return;
    }
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const response = await fetch(`/api/stops?q=${encodeURIComponent(query)}`, { signal: controller.signal });
        if (!response.ok) return;
        const body = (await response.json()) as { stops: StopOption[] };
        setOptions(body.stops);
        setActive(0);
      } catch {
        // Aborted by the next keystroke, or offline; the list simply stays as it was.
      }
    }, SEARCH_DEBOUNCE_MS);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [text, open, selectedName]);

  const choose = (stop: StopOption) => {
    onChange(stop);
    setText(stop.name);
    setOpen(false);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Escape") {
      setOpen(false);
      return;
    }
    if (options.length === 0) return;
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActive((index) => (index + 1) % options.length);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActive((index) => (index - 1 + options.length) % options.length);
    } else if (event.key === "Enter") {
      event.preventDefault();
      const option = options[active];
      if (option) choose(option);
    }
  };

  const showList = open && options.length > 0;

  return (
    <div className="relative">
      {/* "Invoerveld": icon, small label, the place in bold; blue ring while typing. */}
      <div className="flex h-14 items-center gap-3 rounded-xl border-2 border-transparent bg-oppervlak px-3 focus-within:border-accent focus-within:bg-achtergrond">
        <Icon name={icon} size={20} className="text-accent" />
        <div className="flex min-w-0 flex-1 flex-col">
          <label htmlFor={inputId} className="text-body-s text-tekst-zacht">
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
          setText(event.target.value);
          setOpen(true);
          if (value) {
            clearedByTyping.current = true;
            onChange(null);
          }
        }}
        onFocus={(event) => {
          if (blurTimer.current) clearTimeout(blurTimer.current);
          setOpen(true);
          event.target.select();
        }}
        onBlur={() => {
          // Delay so a click on an option lands before the list disappears.
          blurTimer.current = setTimeout(() => setOpen(false), 150);
        }}
        onKeyDown={onKeyDown}
            className="w-full bg-transparent text-body-m font-semibold text-tekst outline-none placeholder:font-normal placeholder:text-tekst-zacht"
          />
        </div>
      </div>
      <ul
        id={listId}
        role="listbox"
        hidden={!showList}
        className="absolute z-10 mt-1 max-h-72 w-full overflow-auto rounded-xl bg-achtergrond py-1 shadow-[0_4px_20px_rgba(0,0,0,0.16)]"
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
            className={`flex min-h-11 cursor-pointer items-center px-4 text-body-m ${index === active ? "bg-oppervlak" : ""}`}
          >
            {option.name}
          </li>
        ))}
      </ul>
    </div>
  );
}
