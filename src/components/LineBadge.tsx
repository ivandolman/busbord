"use client";

import { MODE_LABEL } from "@/lib/board/format";
import type { Mode } from "@/lib/board/types";
import { textOn, useLineColor } from "./useNetwork";

/** "Lijnbadge" in the design: M in lists, L in "Pak deze"; sm only where space is tight. */
const SIZING = {
  sm: "min-w-7 rounded-[5px] px-[5px] py-px text-body-s font-bold",
  md: "min-w-[34px] rounded-[6px] px-[7px] py-[3px] text-badge-m",
  lg: "min-w-[52px] rounded-[9px] px-[10px] py-[5px] text-badge-l",
} as const;

/** A line number on the line's own colour (U-OV yellow, green, …). */
export function LineBadge({ line, mode, size = "md" }: { line: string; mode: Mode; size?: keyof typeof SIZING }) {
  const color = useLineColor(line, mode);
  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center tabular-nums ${SIZING[size]}`}
      style={{ background: color, color: textOn(color) }}
    >
      <span className="sr-only">{MODE_LABEL[mode]} </span>
      {line || "?"}
    </span>
  );
}
