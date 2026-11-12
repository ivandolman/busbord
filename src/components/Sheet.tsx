"use client";

import { useEffect, useLayoutEffect, useRef, useState, type PointerEvent, type ReactNode } from "react";

/**
 * How far the sheet is open on a phone: "min" is a strip at the bottom (almost the whole map),
 * then "peek", "half" and "full". On a wide screen it is a side panel and always open.
 */
export type SheetSnap = "min" | "peek" | "half" | "full";

/** Part of the screen height each snap shows ("full": at most, see sheetHeight). */
export const VISIBLE: Record<Exclude<SheetSnap, "min">, number> = { peek: 0.46, half: 0.72, full: 0.94 };
/** What the lowest snap shows above the home indicator: the handle and the first line of the panel. */
const MIN_VISIBLE_PX = 76;
/** Room kept above the fully open sheet, below the status bar or notch. */
const FULL_GAP_PX = 8;
const ORDER: SheetSnap[] = ["min", "peek", "half", "full"];
/** A drag shorter than this is a tap on the handle. */
const TAP_PIXELS = 6;
/** Faster than this (px per ms) is a flick: on to the next snap that way, wherever it was let go. */
const FLICK_SPEED = 0.45;
/** A sheet that can be dismissed closes when let go this far below its lowest snap. */
const DISMISS_PIXELS = 48;
/** Longest the slide takes (see .sheet-motion); after this a hidden sheet counts as gone. */
const MOTION_MS = 420;
const PHONE_QUERY = "(max-width: 1023px)";

const useIsoLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

function usePhone(): boolean {
  const [phone, setPhone] = useState(false);
  useIsoLayoutEffect(() => {
    const query = window.matchMedia(PHONE_QUERY);
    const sync = () => setPhone(query.matches);
    sync();
    query.addEventListener("change", sync);
    return () => query.removeEventListener("change", sync);
  }, []);
  return phone;
}

/** The sheet that last published --sheet-h, so a sheet leaving later does not reset another's. */
let publisher: symbol | null = null;

/**
 * The board's container: a bottom sheet over the map on a phone (drag or tap the handle to open
 * it further, flick to go a snap further), a side panel next to the map on a wide screen. The
 * visible sheet publishes its height as --sheet-h, so the map keeps what it fits clear of it.
 *
 * `visible={false}` slides the sheet out of view (and `onHidden` says when it is gone);
 * `enter` slides it in when it first appears; `onDismiss` lets a drag down close it.
 */
export function Sheet({
  snap,
  onSnapChange,
  peek = VISIBLE.peek,
  label,
  header,
  visible = true,
  enter = false,
  onDismiss,
  onHidden,
  className = "z-[1100] lg:relative lg:z-[1100] lg:h-dvh lg:w-[420px] lg:shrink-0 lg:rounded-none lg:shadow-[4px_0_20px_rgba(0,0,0,0.12)]",
  children,
}: {
  snap: SheetSnap;
  onSnapChange: (snap: SheetSnap) => void;
  /** Part of the screen the closed sheet shows; less when there is little to show. */
  peek?: number;
  label: string;
  /** Wide screen only: shown above the content (the phone has its own search bar). */
  header?: ReactNode;
  visible?: boolean;
  enter?: boolean;
  onDismiss?: () => void;
  onHidden?: () => void;
  /** Stacking and wide-screen layout. */
  className?: string;
  children: ReactNode;
}) {
  const phone = usePhone();
  /** Height of the area fixed elements are laid out in, and the notch/status bar at its top. */
  const [viewport, setViewport] = useState({ height: 0, safeTop: 0, safeBottom: 0 });
  const probe = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState<number | null>(null);
  const start = useRef<{ y: number; offset: number } | null>(null);
  /** Recent pointer positions, for the speed of the drag when it is let go. */
  const trail = useRef<{ y: number; t: number }[]>([]);
  const scroller = useRef<HTMLDivElement>(null);
  const [entered, setEntered] = useState(!enter);
  const id = useRef(Symbol("sheet"));

  // Measured, not window.innerHeight or dvh: on iPhone those differ from the box a fixed element
  // gets (Safari's toolbars, home-screen app), so the sheet and its snaps would not line up.
  // Before paint, so a sheet that slides in starts below the screen and not at a guessed height.
  useIsoLayoutEffect(() => {
    const element = probe.current;
    if (!element) return;
    const sync = () => {
      const style = getComputedStyle(element);
      setViewport({
        height: element.clientHeight,
        safeTop: parseFloat(style.paddingTop) || 0,
        safeBottom: parseFloat(style.paddingBottom) || 0,
      });
    };
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
  const measured = phone && height > 0;

  // Slide in: one frame below the screen, then to the snap.
  useEffect(() => {
    if (entered || !measured) return;
    let second = 0;
    const first = requestAnimationFrame(() => (second = requestAnimationFrame(() => setEntered(true))));
    return () => (cancelAnimationFrame(first), cancelAnimationFrame(second));
  }, [entered, measured]);

  // Gone once the slide out has had its time (transitionend does not come with reduced motion).
  const hiddenRef = useRef(onHidden);
  hiddenRef.current = onHidden;
  useEffect(() => {
    if (visible) return;
    const timer = setTimeout(() => hiddenRef.current?.(), measured ? MOTION_MS : 0);
    return () => clearTimeout(timer);
  }, [visible, measured]);

  /** The fully open sheet stops below the notch or status bar. */
  const sheetHeight = height - Math.max(height * (1 - VISIBLE.full), viewport.safeTop + FULL_GAP_PX);
  const visiblePx = (which: SheetSnap) =>
    which === "min"
      ? MIN_VISIBLE_PX + viewport.safeBottom
      : Math.min(sheetHeight, height * (which === "peek" ? peek : VISIBLE[which]));
  const offsetOf = (which: SheetSnap) => sheetHeight - visiblePx(which);
  /** Below the screen, shadow included. */
  const outOfView = sheetHeight + 32;
  const showing = visible && entered;
  const offset = !showing ? outOfView : (drag ?? offsetOf(snap));
  const shown = Math.max(0, sheetHeight - offset);

  useEffect(() => {
    if (!visible) return;
    publisher = id.current;
    const root = document.documentElement;
    root.style.setProperty("--sheet-h", measured ? `${Math.round(visiblePx(snap))}px` : "0px");
    root.style.setProperty("--app-h", measured ? `${height}px` : "100dvh");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, measured, height, sheetHeight, snap, peek]);
  useEffect(() => {
    const mine = id.current;
    return () => {
      if (publisher !== mine) return;
      publisher = null;
      document.documentElement.style.setProperty("--sheet-h", "0px");
      document.documentElement.style.removeProperty("--app-h");
    };
  }, []);

  // A new panel starts at the top.
  useEffect(() => {
    scroller.current?.scrollTo({ top: 0 });
  }, [label]);

  const lowest = () => (onDismiss ? outOfView : offsetOf("min"));
  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    start.current = { y: event.clientY, offset: offsetOf(snap) };
    trail.current = [{ y: event.clientY, t: event.timeStamp }];
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    if (!start.current) return;
    trail.current = [...trail.current.filter((point) => event.timeStamp - point.t < 100), { y: event.clientY, t: event.timeStamp }];
    const next = start.current.offset + event.clientY - start.current.y;
    // Past the ends it gives way slowly, as if on a rubber band.
    const top = 0;
    const bottom = lowest();
    setDrag(next < top ? top - Math.sqrt(top - next) * 2 : next > bottom ? bottom + Math.sqrt(next - bottom) * 2 : next);
  };
  const onPointerUp = (event: PointerEvent<HTMLDivElement>) => {
    const from = start.current;
    start.current = null;
    setDrag(null);
    if (!from) return;
    const moved = event.clientY - from.y;
    if (Math.abs(moved) < TAP_PIXELS) {
      onSnapChange(snap === "full" ? "peek" : (ORDER[ORDER.indexOf(snap) + 1] ?? "full"));
      return;
    }
    const at = from.offset + moved;
    const first = trail.current[0];
    const speed = first && event.timeStamp > first.t ? (event.clientY - first.y) / (event.timeStamp - first.t) : 0;
    if (onDismiss && (at > offsetOf("min") + DISMISS_PIXELS || (speed > FLICK_SPEED && at >= offsetOf("min") - 1))) {
      onDismiss();
      return;
    }
    if (Math.abs(speed) > FLICK_SPEED) {
      // A flick goes to the next snap in its direction from where the sheet is now.
      const ahead = ORDER.filter((which) => (speed > 0 ? offsetOf(which) > at + 1 : offsetOf(which) < at - 1));
      const next = speed > 0 ? ahead.at(-1) : ahead[0];
      if (next) {
        onSnapChange(next);
        return;
      }
      if (speed > 0 && onDismiss) {
        onDismiss();
        return;
      }
    }
    // Otherwise the snap nearest to where the sheet was let go, with a nudge in the drag's direction.
    const target = at - Math.sign(moved) * height * 0.06;
    const nearest = ORDER.reduce((best, which) =>
      Math.abs(offsetOf(which) - target) < Math.abs(offsetOf(best) - target) ? which : best,
    );
    onSnapChange(nearest);
  };

  return (
    <>
      <div
        ref={probe}
        aria-hidden="true"
        className="pointer-events-none invisible fixed inset-0 -z-10 pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)]"
      />
      <section
        aria-label={label}
        aria-hidden={!visible || undefined}
        inert={!visible}
        style={measured ? { height: sheetHeight, transform: `translateY(${offset}px)` } : undefined}
        className={`fixed inset-x-0 bottom-0 flex h-[94dvh] flex-col rounded-t-3xl bg-achtergrond shadow-[0_-4px_20px_rgba(0,0,0,0.16)] ${
          drag === null ? "sheet-motion" : ""
        } ${!measured && !visible ? "max-lg:invisible" : ""} ${className}`}
      >
        <div
          role="button"
          tabIndex={0}
          aria-label={snap === "full" ? "Sheet inklappen" : snap === "min" ? "Sheet openen" : "Sheet verder openen"}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={() => ((start.current = null), setDrag(null))}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === " ") {
              event.preventDefault();
              onSnapChange(snap === "full" ? "peek" : "full");
            } else if (event.key === "Escape" && onDismiss) onDismiss();
          }}
          className="flex shrink-0 cursor-grab touch-none justify-center pt-2.5 pb-2 active:cursor-grabbing lg:hidden"
        >
          <span className="h-[5px] w-10 rounded-[3px] bg-rand" />
        </div>
        {header && <div className="hidden shrink-0 lg:block">{header}</div>}
        <div
          ref={scroller}
          style={measured ? { maxHeight: Math.max(0, shown - 18) } : undefined}
          className="min-h-0 flex-1 overflow-y-auto overscroll-contain pr-[max(1rem,env(safe-area-inset-right))] pl-[max(1rem,env(safe-area-inset-left))] pt-2 pb-[max(1.75rem,env(safe-area-inset-bottom))] lg:px-6 lg:pt-0 lg:pb-6"
        >
          {/* Keyed by panel, so a new panel fades in instead of popping. */}
          <div key={label} className="sheet-content-in">
            {children}
          </div>
        </div>
      </section>
    </>
  );
}
