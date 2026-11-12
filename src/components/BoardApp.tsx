"use client";

import dynamic from "next/dynamic";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { formatClock } from "@/lib/board/format";
import type { Board, Departure } from "@/lib/board/types";
import { pointId } from "@/lib/place";
import { sameRoute, scheduledRoute, scheduleLabel, type SavedRoute } from "@/lib/saved-routes";
import { BoardView } from "./BoardView";
import type { PlaceKey, WalkLeg } from "./NetworkMap";
import { PanelHeader } from "./PanelHeader";
import { SavedRouteList, SaveRouteButton } from "./SavedRoutes";
import { useSavedRoutes } from "./useSavedRoutes";
import { LeaveAlertSwitch, useLeaveAlert } from "./LeaveAlert";
import { SettingsPanel } from "./SettingsPanel";
import { LogoutRow } from "./SessionGuard";
import { Sheet, type SheetSnap } from "./Sheet";
import { useSettings, walkParams } from "./useSettings";
import { StopPicker, type StopOption } from "./StopPicker";
import { TripView } from "./TripView";
import { Icon } from "./Icon";

// Leaflet touches `window` on import, so the map only ever loads in the browser.
const NetworkMap = dynamic(() => import("./NetworkMap").then((module) => module.NetworkMap), {
  ssr: false,
  loading: () => <p className="p-4 pt-24 text-body-s text-tekst-zacht lg:pt-4">Kaart laden…</p>,
});

const REFRESH_MS = 30_000;
const CLOCK_TICK_MS = 10_000;

/** What the sheet (phone) or side panel (wide screen) shows. */
type Panel = "board" | "search" | "settings" | "trip";

const boardMatchesRoute = (board: Board | null, fromId: string | null, toId: string | null): board is Board =>
  board !== null && board.origin.id === fromId && board.destination.id === toId;

/** An older board without the buses that have left since. */
function withoutPast(board: Board, now: number): Board {
  return {
    ...board,
    departures: board.departures.filter((departure) => departure.expectedDeparture >= now - 60),
    transfers: board.transfers.filter((journey) => journey.first.expectedDeparture >= now - 60),
  };
}

/** "Utrecht, Kleinesingel" → "Kleinesingel": the town is clear from the map. */
const shortPlace = (name: string) => name.replace(/^[^,]+, /, "");

type LoadState = { status: "idle" } | { status: "loading" } | { status: "error"; message: string };

const icons = {
  search: <Icon name="search" size={20} />,
  swap: <Icon name="swap" size={22} />,
  layers: <Icon name="layers" size={22} />,
  locate: <Icon name="locate" size={22} />,
  line: <Icon name="route" size={22} />,
  map: <Icon name="map" size={20} />,
};

/** Round map button ("Knop · Rond" in the design). */
function MapButton({ label, onClick, pressed, children, className = "" }: { label: string; onClick: () => void; pressed?: boolean; children: ReactNode; className?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      aria-pressed={pressed}
      className={`flex size-11 items-center justify-center rounded-full shadow-[0_4px_16px_rgba(0,0,0,0.16)] ${
        pressed ? "bg-donker text-op-donker" : "bg-achtergrond text-tekst hover:bg-oppervlak"
      } ${className}`}
    >
      {children}
    </button>
  );
}

/** "Zoekpil": Kleinesingel → CS Jaarbeurszijde; opens "Van en naar", the round button swaps. */
function SearchBar({
  from,
  to,
  onOpen,
  onSwap,
  className = "",
}: {
  from: StopOption | null;
  to: StopOption | null;
  onOpen: () => void;
  onSwap: () => void;
  className?: string;
}) {
  const title =
    from || to ? `${from ? shortPlace(from.name) || "…" : "Van?"} → ${to ? shortPlace(to.name) || "…" : "Naar?"}` : "Waar wil je heen?";
  return (
    <div className={`flex h-14 items-center gap-2.5 rounded-full bg-achtergrond pr-1.5 pl-4 shadow-[0_4px_16px_rgba(0,0,0,0.18)] ${className}`}>
      <button type="button" onClick={onOpen} className="flex h-full min-w-0 flex-1 items-center gap-2.5 text-left">
        <span className="text-tekst">{icons.search}</span>
        <span className="min-w-0">
          <span className="block truncate text-body-m font-semibold text-tekst">{title}</span>
          {from && to && (
            <span className="block truncate text-body-s text-tekst-zacht">
              {from.name} → {to.name}
            </span>
          )}
        </span>
      </button>
      <button
        type="button"
        onClick={onSwap}
        disabled={!from && !to}
        aria-label="Wissel richting"
        title="Wissel richting"
        className="flex size-11 shrink-0 items-center justify-center rounded-full bg-oppervlak text-tekst hover:bg-rand disabled:opacity-40"
      >
        {icons.swap}
      </button>
    </div>
  );
}

/** `loginEnabled`: the app sits behind a login (src/lib/auth.ts), so offer "Uitloggen". */
export function BoardApp({ loginEnabled = false }: { loginEnabled?: boolean }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // The URL carries the selection, so a board can be bookmarked or shared.
  const fromId = searchParams.get("from");
  const toId = searchParams.get("to");
  const walk = searchParams.get("walk") !== "0";

  const [names, setNames] = useState<Record<string, string>>({});
  const [board, setBoard] = useState<Board | null>(null);
  const boardRef = useRef(board);
  boardRef.current = board;
  const [state, setState] = useState<LoadState>({ status: "idle" });
  /** Set when the board shown is an older copy: no network, from the offline cache or memory. */
  const [offline, setOffline] = useState(false);
  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000));
  const [autoOpened, setAutoOpened] = useState<SavedRoute | null>(null);
  /** Walks of the departure the user asked to see on the map. */
  const [walkLegs, setWalkLegs] = useState<WalkLeg[]>([]);
  const [panel, setPanel] = useState<Panel>("board");
  const [snap, setSnap] = useState<SheetSnap>("peek");
  /** The departure shown step by step ("trip" panel). */
  const [trip, setTrip] = useState<Departure | null>(null);
  /** Set while choosing a place by tapping the map. */
  const [pickTarget, setPickTarget] = useState<PlaceKey | null>(null);
  const [lineSearchOpen, setLineSearchOpen] = useState(false);
  /** Phone: a stop's sheet is open, so the board's sheet slides out of its way. */
  const [stopSheetOpen, setStopSheetOpen] = useState(false);
  const [locationError, setLocationError] = useState(false);
  const scheduleChecked = useRef(false);
  const { routes: savedRoutes, loaded: routesLoaded } = useSavedRoutes();
  const { settings, loaded: settingsLoaded } = useSettings();
  const walkQuery = new URLSearchParams(walkParams(settings)).toString();

  const updateUrl = useCallback(
    (changes: Record<string, string | null>) => {
      const next = new URLSearchParams(searchParams);
      for (const [key, value] of Object.entries(changes)) {
        if (value === null) next.delete(key);
        else next.set(key, value);
      }
      const query = next.toString();
      router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
    },
    [pathname, router, searchParams],
  );

  const open = (next: Panel, at: SheetSnap) => {
    setPanel(next);
    setSnap(at);
  };

  const pick = (key: PlaceKey, stop: StopOption | null) => {
    if (stop) setNames((known) => ({ ...known, [stop.id]: stop.name }));
    // Picking the stop that is already on the other side swaps them instead of clearing the board.
    const other = key === "from" ? toId : fromId;
    if (stop && stop.id === other) updateUrl({ from: toId, to: fromId });
    else updateUrl({ [key]: stop?.id ?? null });
    if (pickTarget) setPickTarget(null);
    // With both places known the board is what you want to see; otherwise ask for the other one.
    if (stop && other) open("board", "peek");
    else if (stop && pickTarget) open("search", "full");
  };

  const locate = () => {
    setLocationError(false);
    if (!navigator.geolocation) {
      setLocationError(true);
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (position) => pick("from", { id: pointId({ lat: position.coords.latitude, lon: position.coords.longitude }), name: "Mijn locatie" }),
      () => setLocationError(true),
      { enableHighAccuracy: true, timeout: 10_000 },
    );
  };

  const chooseOnMap = () => {
    setPickTarget(!fromId ? "from" : "to");
    open("board", "peek");
  };
  const select = (key: "from" | "to") => (stop: StopOption | null) => pick(key, stop);
  const openRoute = useCallback(
    (route: SavedRoute) => {
      setNames((known) => ({ ...known, [route.from.id]: route.from.name, [route.to.id]: route.to.name }));
      updateUrl({ from: route.from.id, to: route.to.id, walk: route.walk ? null : "0" });
      setPanel("board");
      setSnap("peek");
    },
    [updateUrl],
  );

  // Opening the app without a route during a regular trip's window opens that trip. Only once per
  // visit, so clearing the fields afterwards is respected.
  useEffect(() => {
    if (scheduleChecked.current || !routesLoaded) return;
    scheduleChecked.current = true;
    if (fromId || toId) return;
    const route = scheduledRoute(savedRoutes, new Date());
    if (route) {
      setAutoOpened(route);
      openRoute(route);
    }
  }, [fromId, toId, openRoute, routesLoaded, savedRoutes]);

  // A selection restored from the URL arrives without a name; look it up once.
  useEffect(() => {
    const missing = [fromId, toId].filter((id): id is string => id !== null && !names[id]);
    if (missing.length === 0) return;
    const controller = new AbortController();
    for (const id of missing) {
      fetch(`/api/place?id=${encodeURIComponent(id)}`, { signal: controller.signal })
        .then((response) => (response.ok ? (response.json() as Promise<StopOption>) : null))
        .then((place) => {
          if (place) setNames((known) => (known[place.id] ? known : { ...known, [place.id]: place.name }));
        })
        .catch(() => {});
    }
    return () => controller.abort();
  }, [fromId, toId, names]);

  useEffect(() => {
    const timer = setInterval(() => setNow(Math.floor(Date.now() / 1000)), CLOCK_TICK_MS);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!fromId || !toId || !settingsLoaded) {
      if (settingsLoaded) setBoard(null);
      setState({ status: "idle" });
      return;
    }
    let cancelled = false;
    const controller = new AbortController();

    const load = async () => {
      try {
        const query = new URLSearchParams(walkQuery);
        query.set("from", fromId);
        query.set("to", toId);
        query.set("walk", walk ? "1" : "0");
        const response = await fetch(`/api/board?${query}`, { signal: controller.signal });
        const body = (await response.json()) as Board | { error: string };
        if (cancelled) return;
        setOffline(response.headers.get("X-Offline") === "1");
        if (!response.ok || "error" in body) {
          setBoard(null);
          setState({ status: "error", message: "error" in body ? body.error : "Er ging iets mis." });
          return;
        }
        setBoard(body);
        setNames((known) => ({ ...known, [body.origin.id]: body.origin.name, [body.destination.id]: body.destination.name }));
        setNow(Math.floor(Date.now() / 1000));
        setState({ status: "idle" });
      } catch {
        if (cancelled) return;
        // Keep showing the last board (its times are absolute), marked as offline.
        setOffline(true);
        setState(
          boardRef.current
            ? { status: "idle" }
            : { status: "error", message: "Geen verbinding. We proberen het zo opnieuw." },
        );
      }
    };

    setState({ status: "loading" });
    void load();
    const timer = setInterval(() => void load(), REFRESH_MS);
    return () => {
      cancelled = true;
      controller.abort();
      clearInterval(timer);
    };
  }, [fromId, toId, walk, walkQuery, settingsLoaded]);

  // A new route: the walks and the ride shown were for the old one.
  useEffect(() => {
    setWalkLegs([]);
    setTrip(null);
    setPanel((current) => (current === "trip" ? "board" : current));
  }, [fromId, toId]);

  const showRoute = (departure: Departure) => {
    if (!board) return;
    const legs: WalkLeg[] = [];
    if (departure.walkToSeconds > 0) {
      legs.push({ kind: "to", from: [board.origin.lat, board.origin.lon], to: [departure.from.lat, departure.from.lon], label: departure.from.platform || departure.from.name });
    }
    if (departure.walkFromSeconds > 0) {
      legs.push({ kind: "from", from: [departure.to.lat, departure.to.lon], to: [board.destination.lat, board.destination.lon], label: departure.to.name });
    }
    setWalkLegs(legs);
    setTrip(departure);
    // The sheet folds down so the walks on the map are in view.
    open("trip", "peek");
  };

  const closeTrip = () => {
    setWalkLegs([]);
    setTrip(null);
    open("board", "peek");
  };

  // "Vertrek nu" for the saved regular trip that is on screen.
  const savedRoute = savedRoutes.find((route) => sameRoute(route, fromId, toId)) ?? null;
  useLeaveAlert(boardMatchesRoute(board, fromId, toId) ? board : null, savedRoute, now);

  const from = fromId ? { id: fromId, name: names[fromId] ?? "" } : null;
  const to = toId ? { id: toId, name: names[toId] ?? "" } : null;
  const boardMatches = board !== null && board.origin.id === fromId && board.destination.id === toId;
  const swap = () => updateUrl({ from: toId, to: fromId });
  // The ride on screen, with the times of the latest refresh.
  const liveTrip =
    trip && boardMatches
      ? (board.departures.find((departure) => departure.tripId === trip.tripId && departure.plannedDeparture === trip.plannedDeparture) ?? trip)
      : trip;

  const boardContent = (
    <div aria-live="polite" className="flex flex-col gap-3.5">
      {!fromId && !toId && (
        <>
          <button
            type="button"
            onClick={() => open("search", "full")}
            className="flex h-14 w-full items-center gap-2.5 rounded-full bg-oppervlak px-4 text-left text-body-m font-semibold lg:hidden"
          >
            {icons.search} Waar wil je heen?
          </button>
          <div className="lg:hidden">
            <SavedRouteList fromId={fromId} toId={toId} onOpen={openRoute} />
          </div>
          <p className="text-body-s text-tekst-zacht">
            Tik op de kaart op een halte of een willekeurige plek. Na een vertrekpunt kleuren de haltes groen waar je
            zonder overstap komt.
          </p>
        </>
      )}
      {(fromId || toId) && !(fromId && toId) && (
        <p className="text-body-s text-tekst-zacht">
          {fromId ? "Kies nog waar je heen wilt" : "Kies nog waar je vandaan gaat"}: zoek bovenin, of tik op een halte of plek op de
          kaart.
        </p>
      )}
      {autoOpened?.schedule && sameRoute(autoOpened, fromId, toId) && (
        <p className="rounded-xl bg-oppervlak px-3 py-2 text-body-s">
          Vaste reis “{autoOpened.name}” ({scheduleLabel(autoOpened.schedule)}) staat klaar.
        </p>
      )}
      {state.status === "error" && (
        <p className="rounded-[14px] border border-fout/30 bg-fout/5 p-4 text-body-s text-fout">
          {state.message}
        </p>
      )}
      {state.status === "loading" && !boardMatches && (
        <p className="text-body-s text-tekst-zacht">Vertrektijden ophalen…</p>
      )}
      {boardMatches && state.status !== "error" && offline && (
        <p className="flex items-start gap-2 rounded-[14px] bg-oppervlak p-3 text-body-s">
          <Icon name="offline" size={18} className="mt-px" />
          <span>Offline · tijden van {formatClock(board.generatedAt)}, volgens de dienstregeling van toen. Vertraging na dat moment zie je niet.</span>
        </p>
      )}
      {boardMatches && state.status !== "error" && (
        <BoardView board={offline ? withoutPast(board, now) : board} now={now} onShowRoute={showRoute} />
      )}
    </div>
  );

  const searchContent = (
    <div className="flex flex-col gap-3">
      <PanelHeader title="Van en naar" onClose={() => open("board", "peek")} />
      <div className="flex items-center gap-2">
        <div className="flex min-w-0 flex-1 flex-col gap-2">
          <StopPicker label="Van" placeholder="Utrecht CS of kies op de kaart" value={from} onChange={select("from")} />
          <StopPicker label="Naar" icon="pin" placeholder="Heidelberglaan of kies op de kaart" value={to} onChange={select("to")} />
        </div>
        <button
          type="button"
          onClick={swap}
          disabled={!fromId && !toId}
          aria-label="Wissel richting"
          title="Wissel richting"
          className="flex size-11 shrink-0 items-center justify-center rounded-full bg-oppervlak hover:bg-rand disabled:opacity-40"
        >
          {icons.swap}
        </button>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={locate}
          className="flex h-12 items-center justify-center gap-2 rounded-xl bg-oppervlak text-body-m font-semibold text-accent hover:bg-rand"
        >
          {icons.locate} Mijn locatie
        </button>
        <button
          type="button"
          onClick={chooseOnMap}
          className="flex h-12 items-center justify-center gap-2 rounded-xl bg-oppervlak text-body-m font-semibold text-accent hover:bg-rand"
        >
          {icons.map} Kies op kaart
        </button>
      </div>
      {locationError && <p className="text-body-s text-fout">Locatie niet beschikbaar.</p>}
      <SavedRouteList fromId={fromId} toId={toId} onOpen={openRoute} />
      <SaveRouteButton from={from} to={to} walk={walk} />
    </div>
  );

  const content =
    panel === "trip" && liveTrip && boardMatches ? (
      <TripView departure={liveTrip} board={board} now={now} onClose={closeTrip} />
    ) : panel === "search" ? (
      searchContent
    ) : panel === "settings" ? (
      <SettingsPanel
        walk={walk}
        onWalkChange={(checked) => updateUrl({ walk: checked ? null : "0" })}
        notifications={<LeaveAlertSwitch />}
        savedRoutes={
          <button
            type="button"
            onClick={() => open("search", "full")}
            className="flex min-h-14 w-full items-center justify-between gap-3 border-b border-rand py-2.5 text-left"
          >
            <span>
              <span className="block text-body-m font-semibold">Mijn routes</span>
              <span className="block text-body-s text-tekst-zacht">
                {savedRoutes.length} {savedRoutes.length === 1 ? "route" : "routes"} · ook als snelkoppeling op je beginscherm
              </span>
            </span>
            <Icon name="chevR" size={20} className="text-tekst" />
          </button>
        }
        account={loginEnabled ? <LogoutRow /> : undefined}
        onClose={() => open("board", "peek")}
      />
    ) : (
      boardContent
    );

  const desktopHeader = (
    <div className="flex flex-col gap-3.5 px-6 pt-6 pb-3.5">
      <p className="flex items-center gap-2.5 text-kop-l">
        <span aria-hidden="true" className="flex size-9 items-center justify-center rounded-[9px] bg-donker text-op-donker">
          B
        </span>
        Bestemmingsbord
      </p>
      <SearchBar from={from} to={to} onOpen={() => open("search", "full")} onSwap={swap} />
      {panel === "board" && <SavedRouteList fromId={fromId} toId={toId} onOpen={openRoute} />}
    </div>
  );

  return (
    <div className="lg:flex lg:h-dvh">
      <Sheet
        snap={snap}
        onSnapChange={setSnap}
        peek={boardMatches || panel !== "board" ? 0.46 : 0.34}
        label={panel === "search" ? "Van en naar" : panel === "settings" ? "Kaart en instellingen" : panel === "trip" ? "Rit" : "Vertrekbord"}
        header={desktopHeader}
        visible={!stopSheetOpen}
      >
        {content}
      </Sheet>

      <div className="fixed inset-0 lg:relative lg:inset-auto lg:min-w-0 lg:flex-1">
        <NetworkMap
          fromId={fromId}
          toId={toId}
          walk={walk}
          onPick={pick}
          walkLegs={walkLegs}
          pickTarget={pickTarget}
          lineSearchOpen={lineSearchOpen}
          onStopSheet={setStopSheetOpen}
        />
        <SearchBar
          from={from}
          to={to}
          onOpen={() => open("search", "full")}
          onSwap={swap}
          className="absolute top-[calc(env(safe-area-inset-top)+0.75rem)] right-[max(1rem,env(safe-area-inset-right))] left-[max(1rem,env(safe-area-inset-left))] z-[1050] lg:hidden"
        />
        <div className="absolute top-[calc(var(--map-top)+0.75rem)] right-[max(1rem,env(safe-area-inset-right))] z-[1050] flex flex-col gap-2.5 lg:top-6 lg:right-6">
          <MapButton label="Kaart en instellingen" onClick={() => open("settings", "full")} pressed={panel === "settings"}>
            {icons.layers}
          </MapButton>
          <MapButton label="Mijn locatie als vertrekpunt" onClick={locate}>
            {icons.locate}
          </MapButton>
          <MapButton label="Lijn zoeken" onClick={() => setLineSearchOpen((shown) => !shown)} pressed={lineSearchOpen} className="lg:hidden">
            {icons.line}
          </MapButton>
        </div>
        {pickTarget && (
          <button
            type="button"
            onClick={() => (setPickTarget(null), open("search", "full"))}
            className="absolute top-[calc(var(--map-top)+0.75rem)] left-[max(1rem,env(safe-area-inset-left))] z-[1050] h-11 rounded-full bg-donker px-4 text-body-s font-semibold text-op-donker shadow-[0_4px_16px_rgba(0,0,0,0.16)] lg:top-6 lg:left-1/2 lg:-translate-x-1/2"
          >
            Kiezen op kaart stoppen
          </button>
        )}
      </div>
    </div>
  );
}
