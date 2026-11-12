"use client";

import { useEffect, useRef, useState, type PointerEvent, type ReactNode } from "react";

/** How far the sheet is open on a phone. On a wide screen it is a side panel and always open. */
export type SheetSnap = "peek" | "half" | "full";

/** Part of the screen height each snap shows ("full": at most, see sheetHeight). */
const VISIBLE: Record<SheetSnap, number> = { peek: 0.46, half: 0.72, full: 0.94 };
/** Room kept above the fully open sheet, below the status bar or notch. */
const FULL_GAP_PX = 8;
const ORDER: SheetSnap[] = ["peek", "half", "full"];
/** A drag shorter than this is a tap on the handle. */
const TAP_PIXELS = 6;
const PHONE_QUERY = "(max-width: 1023px)";

function usePhone(): boolean {
  const [phone, setPhone] = useState(false);
  useEffect(() => {
    const query = window.matchMedia(PHONE_QUERY);
    const sync = () => setPhone(query.matches);
    sync();
    query.addEventListener("change", sync);
    return () => query.removeEventListener("change", sync);
  }, []);
  return phone;
}

/**
 * The board's container: a bottom sheet over the map on a phone (drag or tap the handle to open
 * it further), a side panel next to the map on a wide screen. Publishes the visible height as
 * --sheet-h, so the map keeps what it fits clear of the sheet.
 */
export function Sheet({
  snap,
  onSnapChange,
  peek = VISIBLE.peek,
  label,
  header,
  children,
}: {
  snap: SheetSnap;
  onSnapChange: (snap: SheetSnap) => void;
  /** Part of the screen the closed sheet shows; less when there is little to show. */
  peek?: number;
  label: string;
  /** Wide screen only: shown above the content (the phone has its own search bar). */
  header?: ReactNode;
  children: ReactNode;
}) {
  const phone = usePhone();
  /** Height of the area fixed elements are laid out in, and the notch/status bar at its top. */
  const [viewport, setViewport] = useState({ height: 0, safeTop: 0 });
  const probe = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState<number | null>(null);
  const start = useRef<{ y: number; offset: number } | null>(null);
  const scroller = useRef<HTMLDivElement>(null);

  // Measured, not window.innerHeight or dvh: on iPhone those differ from the box a fixed element
  // gets (Safari's toolbars, home-screen app), so the sheet and its snaps would not line up.
  useEffect(() => {
    const element = probe.current;
    if (!element) return;
    const sync = () =>
      setViewport({ height: element.clientHeight, safeTop: parseFloat(getComputedStyle(element).paddingTop) || 0 });
    sync();
    const observer = new ResizeObserver(sync);
    observer.observe(element);
    window.addEventListener("orientationchange", sync);
    return () => {
      observer.disconnect();
      window.removeEventListener("orientationchange", sync);
    };
  }, []);

  const { height } = viewport;
  /** The fully open sheet stops below the notch or status bar. */
  const sheetHeight = height - Math.max(height * (1 - VISIBLE.full), viewport.safeTop + FULL_GAP_PX);
  const visiblePx = (which: SheetSnap) => Math.min(sheetHeight, height * (which === "peek" ? peek : VISIBLE[which]));
  const offsetOf = (which: SheetSnap) => sheetHeight - visiblePx(which);
  const offset = drag ?? offsetOf(snap);
  const shown = sheetHeight - offset;
  const measured = phone && height > 0;

  useEffect(() => {
    const root = document.documentElement;
    root.style.setProperty("--sheet-h", measured ? `${Math.round(visiblePx(snap))}px` : "0px");
    root.style.setProperty("--app-h", measured ? `${height}px` : "100dvh");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [measured, height, sheetHeight, snap, peek]);
  useEffect(
    () => () => {
      document.documentElement.style.setProperty("--sheet-h", "0px");
      document.documentElement.style.removeProperty("--app-h");
    },
    [],
  );

  // A new panel starts at the top.
  useEffect(() => {
    scroller.current?.scrollTo({ top: 0 });
  }, [label]);

  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    start.current = { y: event.clientY, offset: offsetOf(snap) };
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    if (!start.current) return;
    const next = start.current.offset + event.clientY - start.current.y;
    setDrag(Math.max(0, Math.min(sheetHeight - height * 0.12, next)));
  };
  const onPointerUp = (event: PointerEvent<HTMLDivElement>) => {
    const from = start.current;
    start.current = null;
    setDrag(null);
    if (!from) return;
    const moved = event.clientY - from.y;
    if (Math.abs(moved) < TAP_PIXELS) {
      onSnapChange(snap === "full" ? "peek" : ORDER[ORDER.indexOf(snap) + 1] ?? "full");
      return;
    }
    // The snap nearest to where the sheet was let go, with a nudge in the direction of the drag.
    const at = from.offset + moved - Math.sign(moved) * height * 0.06;
    const nearest = ORDER.reduce((best, which) =>
      Math.abs(offsetOf(which) - at) < Math.abs(offsetOf(best) - at) ? which : best,
    );
    onSnapChange(nearest);
  };

  return (
    <>
    <div ref={probe} aria-hidden="true" className="pointer-events-none invisible fixed inset-0 -z-10 pt-[env(safe-area-inset-top)]" />
    <section
      aria-label={label}
      style={measured ? { height: sheetHeight, transform: `translateY(${offset}px)` } : undefined}
      className={`fixed inset-x-0 bottom-0 z-[1100] flex h-[94dvh] flex-col rounded-t-3xl bg-achtergrond shadow-[0_-4px_20px_rgba(0,0,0,0.16)] lg:relative lg:z-[1100] lg:h-dvh lg:w-[420px] lg:shrink-0 lg:rounded-none lg:shadow-[4px_0_20px_rgba(0,0,0,0.12)] ${
        drag === null ? "transition-transform duration-200 ease-out" : ""
      }`}
    >
      <div
        role="button"
        tabIndex={0}
        aria-label={snap === "full" ? "Sheet inklappen" : "Sheet verder openen"}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={() => ((start.current = null), setDrag(null))}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            onSnapChange(snap === "full" ? "peek" : "full");
          }
        }}
        className="flex shrink-0 cursor-grab touch-none justify-center pt-2 pb-1 lg:hidden"
      >
        <span className="h-[5px] w-10 rounded-[3px] bg-rand" />
      </div>
      {header && <div className="hidden shrink-0 lg:block">{header}</div>}
      <div
        ref={scroller}
        style={measured ? { maxHeight: Math.max(0, shown - 18) } : undefined}
        className="min-h-0 flex-1 overflow-y-auto overscroll-contain pr-[max(1rem,env(safe-area-inset-right))] pl-[max(1rem,env(safe-area-inset-left))] pt-2 pb-[max(1.75rem,env(safe-area-inset-bottom))] lg:px-6 lg:pt-0 lg:pb-6"
      >
        {children}
      </div>
    </section>
    </>
  );
}
