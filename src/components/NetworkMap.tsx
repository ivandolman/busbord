"use client";

import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Icon } from "./Icon";
import { defaultDirection, StopCard } from "./StopCard";
import { delayMinutes, formatClock, formatWait, MODE_LABEL } from "@/lib/board/format";
import type { Mode, NextDepartures, StopBoard, StopPole } from "@/lib/board/types";
import type { Network, NetworkLine, NetworkStop } from "@/lib/network/network";
import { parsePointId, pointId } from "@/lib/place";
import type { StopOption } from "./StopPicker";
import { useSettings, walkParams, type Settings } from "./useSettings";
import { MODE_COLOR, textOn, useNetwork } from "./useNetwork";

export type PlaceKey = "from" | "to";

interface NetworkMapProps {
  fromId: string | null;
  toId: string | null;
  walk: boolean;
  /** Walks to draw for a departure picked on the board. */
  walkLegs?: WalkLeg[];
  onPick: (key: PlaceKey, place: StopOption) => void;
  /** Set while the user is choosing a place on the map: the next tap picks it directly. */
  pickTarget?: PlaceKey | null;
  /** Phone only: show the line search field (on a wide screen it is always there). */
  lineSearchOpen?: boolean;
}

/** A walk of one departure: to the stop where you get on, or from where you get off. */
export interface WalkLeg {
  kind: "to" | "from";
  from: [number, number];
  to: [number, number];
  /** The stop (or its platform) at the bus end of the walk. */
  label: string;
}

/** See /api/walk-area. */
interface WalkArea {
  center: [number, number];
  radiusMeters: number;
  minutes: number;
  polygon: [number, number][] | null;
}

/** What the current selection narrows the map to (see /api/reachable). */
interface Reachable {
  direction: "from" | "to" | "both";
  areas: Set<string>;
  routes: Set<string>;
  /** With origin and destination: only the stretch of each line you ride. */
  segments: { routeId: string; path: [number, number][] }[] | null;
  /** With origin and destination: where to draw a stop, between the platforms the rides use. */
  positions: Map<string, [number, number]>;
  /** Stop areas you can get on at (the origin's); null without an origin: anywhere. */
  boardAreas: Set<string> | null;
}

const STOP_REFRESH_MS = 30_000;

/** Click tolerance, in screen pixels, for finding every line under the pointer. */
const LINE_HIT_PIXELS = 8;


const FADED = "#a8a29e";
/** Dark casing under ridden stretches ("Rand lijn" in the design). */
const CASING = "#1b2230";
/** Dutch government base map in grey: streets and buildings, no shops or churches. Covers NL only. */
const CALM_TILES = "https://service.pdok.nl/brt/achtergrondkaart/wmts/v2_0/grijs/EPSG:3857/{z}/{x}/{y}.png";
const CALM_ATTRIBUTION = 'Kaart: <a href="https://www.pdok.nl">PDOK</a> / Kadaster';
const TILE_ATTRIBUTION = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>-bijdragers';

/** Below this width the app is a phone layout: map full screen under a bottom sheet. */
const PHONE_QUERY = "(max-width: 1023px)";
const isPhone = () => typeof window !== "undefined" && window.matchMedia(PHONE_QUERY).matches;

/**
 * fitBounds padding that keeps the result clear of what covers the map on a phone: the search
 * bar on top (--map-top) and the bottom sheet (--sheet-h, kept up to date by the sheet).
 */
function fitPadding(base: number): Pick<L.FitBoundsOptions, "paddingTopLeft" | "paddingBottomRight"> {
  const style = getComputedStyle(document.documentElement);
  const top = parseFloat(style.getPropertyValue("--map-top")) || 0;
  const sheet = parseFloat(style.getPropertyValue("--sheet-h")) || 0;
  // A sheet that covers most of the screen is open on purpose; fit above its peek height then.
  const viewport = parseFloat(style.getPropertyValue("--app-h")) || window.innerHeight;
  const bottom = Math.min(sheet, viewport * 0.5);
  return { paddingTopLeft: [base, base + top], paddingBottomRight: [base, base + bottom] };
}

/** A stop whose card is open. */
interface OpenStop {
  stop: NetworkStop;
  /** Line numbers the network knows at this stop. */
  served: string[];
  /** Why the stop does not help for the selection, if it does not. */
  note: string | null;
  latlng: L.LatLng;
  /** Opened as the phone's bottom sheet instead of a popup. */
  phone: boolean;
  key: number;
}

const lineColor = (line: NetworkLine) => line.color ?? MODE_COLOR[line.mode];

const sortLines = (a: NetworkLine, b: NetworkLine) => a.line.localeCompare(b.line, "nl", { numeric: true });

/** Builds popup content as DOM so buttons can call back into React without HTML strings. */
function popupContent(
  title: string | null,
  detail: string | null,
  note: string | null,
  actions: { label: string; onClick: () => void }[],
): HTMLElement {
  const root = document.createElement("div");
  root.className = "flex w-64 flex-col gap-2 p-4 text-tekst";
  if (title) {
    const heading = document.createElement("p");
    heading.className = "text-kop-m";
    heading.textContent = title;
    root.append(heading);
  }
  if (detail) {
    const text = document.createElement("p");
    text.dataset.role = "detail";
    text.className = "text-body-s text-tekst-zacht";
    text.textContent = detail;
    root.append(text);
  }
  if (note) {
    const text = document.createElement("p");
    text.className = "text-body-s text-waarschuwing";
    text.textContent = note;
    root.append(text);
  }
  if (actions.length > 0) {
    const row = document.createElement("div");
    row.className = "flex gap-2";
    for (const action of actions) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "h-11 flex-1 rounded-xl bg-oppervlak px-3 text-body-m font-semibold text-accent hover:bg-rand";
      button.textContent = action.label;
      button.addEventListener("click", action.onClick);
      row.append(button);
    }
    root.append(row);
  }
  return root;
}

/** Popup listing every line that runs where the user clicked, each with a "show only" button. */
function linesPopupContent(lines: NetworkLine[], onShowOnly: (line: NetworkLine) => void): HTMLElement {
  const root = document.createElement("div");
  root.className = "flex w-64 flex-col gap-2 p-4 text-tekst";
  const heading = document.createElement("p");
  heading.className = "text-kop-m";
  heading.textContent = lines.length === 1 ? "1 lijn op dit stuk" : `${lines.length} lijnen op dit stuk`;
  root.append(heading);
  const list = document.createElement("ul");
  list.className = "max-h-56 space-y-1 overflow-auto";
  for (const line of lines) {
    const item = document.createElement("li");
    const button = document.createElement("button");
    button.type = "button";
    button.title = "Toon alleen deze lijn";
    button.className = "flex min-h-11 w-full items-center gap-2.5 rounded-lg px-1 text-left hover:bg-oppervlak";
    const badge = document.createElement("span");
    badge.className = "inline-flex min-w-[34px] shrink-0 justify-center rounded-[6px] px-[7px] py-[3px] text-badge-m";
    badge.style.background = lineColor(line);
    badge.style.color = textOn(lineColor(line));
    badge.textContent = line.line || "?";
    const text = document.createElement("span");
    text.className = "min-w-0 flex-1 truncate text-body-s text-tekst";
    text.textContent = `${MODE_LABEL[line.mode]}${line.name ? ` · ${line.name}` : ""}`;
    button.append(badge, text);
    button.addEventListener("click", () => onShowOnly(line));
    item.append(button);
    list.append(item);
  }
  root.append(list);
  const hint = document.createElement("p");
  hint.className = "text-body-s text-tekst-zacht";
  hint.textContent = "Klik een lijn om alleen die te tonen.";
  root.append(hint);
  return root;
}

/** A pole's letter on the map: the blue dot of the stop card ("Paal" in the design). */
const POLE_STYLE =
  "display:inline-flex;align-items:center;justify-content:center;min-width:24px;height:24px;padding:0 4px;border-radius:9999px;background:#1f5bd8;color:white;font:700 12px/16px var(--font-sans);flex-shrink:0";

function poleMarker(pole: StopPole): L.Marker {
  const icon = L.divIcon({
    className: "",
    iconSize: [22, 22],
    iconAnchor: [11, 11],
    html: `<span style="${POLE_STYLE};border:2px solid white;box-shadow:0 1px 3px rgba(0,0,0,.4)">${pole.label.replace(/[^\w-]/g, "")}</span>`,
  });
  return L.marker([pole.lat, pole.lon], { icon, interactive: false, keyboard: false });
}

/** Squared pixel distance from p to segment a-b. */
function pixelDistanceSquared(p: L.Point, a: L.Point, b: L.Point): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lengthSquared = dx * dx + dy * dy;
  let t = lengthSquared === 0 ? 0 : ((p.x - a.x) * dx + (p.y - a.y) * dy) / lengthSquared;
  t = Math.max(0, Math.min(1, t));
  const ex = p.x - (a.x + t * dx);
  const ey = p.y - (a.y + t * dy);
  return ex * ex + ey * ey;
}

/** How a stop dot is drawn: a normal stop, one on the searched or reachable lines, or out of focus. */
type StopLook = "normal" | "focus" | "faded";

/** Dots grow when zoomed in, so they stay easy to hit with a finger. */
function stopRadius(look: StopLook, zoom: number): number {
  const step = zoom >= 16 ? 2 : zoom >= 14 ? 1 : 0;
  if (look === "focus") return [6, 7, 9][step] as number;
  if (look === "faded") return [2, 3, 4][step] as number;
  return [4, 5, 7][step] as number;
}

const STOP_STYLE: Record<StopLook, L.CircleMarkerOptions> = {
  normal: { weight: 2, color: "#111418", fillColor: "#ffffff", opacity: 1, fillOpacity: 1 },
  focus: { weight: 2.5, color: "#111418", fillColor: "#ffffff", opacity: 1, fillOpacity: 1 },
  faded: { weight: 1, color: FADED, fillColor: "#ffffff", opacity: 0.4, fillOpacity: 0.4 },
};

function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (char) => `&#${char.charCodeAt(0)};`);
}

/**
 * On touch screens a stop reacts to a tap within this many pixels of its centre, whatever its
 * drawn size: a fingertip is far less precise than a mouse.
 */
const TOUCH_HIT_RADIUS = 20;

/**
 * Widens the area that counts as a tap on the dot without drawing it bigger. Leaflet 1.9
 * hit-tests canvas circles with radius + _clickTolerance(); there is no public option per layer.
 */
function widenTouchTarget(layer: L.CircleMarker): void {
  if (typeof window === "undefined" || !window.matchMedia("(pointer: coarse)").matches) return;
  const target = layer as unknown as { _clickTolerance: () => number };
  const original = target._clickTolerance.bind(layer);
  // Zoomed out the stops lie too close together for this; there you zoom in first anyway.
  target._clickTolerance = () =>
    (layer as unknown as { _map?: L.Map })._map && (layer as unknown as { _map: L.Map })._map.getZoom() >= 14
      ? Math.max(original(), TOUCH_HIT_RADIUS - layer.getRadius())
      : original();
}

/** From this zoom on, stops get a label with their lines where there is room for it. */
const LABEL_MIN_ZOOM = 15;
const LABEL_MAX_LINES = 5;
/** Stop areas asked for at once for label times (the API refuses more than 120). */
const NEXT_TIMES_MAX_AREAS = 120;
const LABEL_CHAR_PX = 8;
const LABEL_HEIGHT_PX = 26;

/** Where you leave from: a blue dot with a white ring ("Van" in the design). */
function originMarker(): L.DivIcon {
  return L.divIcon({
    className: "",
    iconSize: [24, 24],
    iconAnchor: [12, 12],
    html: '<div style="width:24px;height:24px;border-radius:9999px;background:#2f6fed;border:3px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,.35)"></div>',
  });
}

/** Where you are going: the red pin ("Naar"), drawn with the design's pin icon. */
function destinationMarker(): L.DivIcon {
  const mask = "url(/icons/pin.svg) center / 100% 100% no-repeat";
  return L.divIcon({
    className: "",
    iconSize: [38, 38],
    iconAnchor: [19, 34],
    html: `<div style="position:relative;width:38px;height:38px;filter:drop-shadow(0 2px 3px rgba(0,0,0,.35))"><div style="position:absolute;inset:12.5% 20.83%"><div style="position:absolute;inset:-5.56% -7.14%;background:#e5484d;mask:${mask};-webkit-mask:${mask}"></div></div></div>`,
  });
}

export function NetworkMap({ fromId, toId, walk, walkLegs = [], onPick, pickTarget = null, lineSearchOpen = false }: NetworkMapProps) {
  const container = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const linesLayer = useRef<L.LayerGroup | null>(null);
  const stopsLayer = useRef<L.LayerGroup | null>(null);
  const markersLayer = useRef<L.LayerGroup | null>(null);
  const polylines = useRef<{ line: NetworkLine; layer: L.Polyline }[]>([]);
  const segmentsLayer = useRef<L.LayerGroup | null>(null);
  const segmentLines = useRef<{ line: NetworkLine; layer: L.Polyline }[]>([]);
  const circles = useRef<{ stop: NetworkStop; layer: L.CircleMarker; look: StopLook }[]>([]);
  const labelsLayer = useRef<L.LayerGroup | null>(null);
  /** Line indexes the labels show; null for all lines of a stop. */
  const labelFocus = useRef<Set<number> | null>(null);
  const updateLabels = useRef<() => void>(() => {});
  /** Stops whose labels may carry times: the in-focus stops in view, busiest first. */
  const labelCandidates = useRef<() => NetworkStop[]>(() => []);
  /**
   * Next ride per line towards the destination, per stop area, for the stops in view. `key` is
   * the selection it belongs to; labels ignore times of another selection.
   */
  const nextTimes = useRef<{ key: string; areas: Map<string, NextDepartures["areas"][string]> }>({
    key: "",
    areas: new Map(),
  });
  // Re-run when a hidden map (mobile, behind the "Kaart" button) becomes visible: fitting a
  // 0x0 map gives a nonsense view.
  const refit = useRef<(() => void) | null>(null);
  // Popups are built once per click; they read the latest props through refs.
  const onPickRef = useRef(onPick);
  onPickRef.current = onPick;
  const pickTargetRef = useRef(pickTarget);
  pickTargetRef.current = pickTarget;
  /** The stop whose card is open: a popup next to it, or the bottom sheet on a phone. */
  const [openStop, setOpenStop] = useState<OpenStop | null>(null);
  const setOpenStopRef = useRef(setOpenStop);
  const [stopBoard, setStopBoard] = useState<StopBoard | null>(null);
  const [stopFailed, setStopFailed] = useState(false);
  /** Direction picked in the card; undefined until the first load picks the default. */
  const [stopDirection, setStopDirection] = useState<string | null | undefined>(undefined);
  /** The popup's content element, for the card to render into (wide screens). */
  const [popupHost, setPopupHost] = useState<HTMLElement | null>(null);
  const stopPopup = useRef<L.Popup | null>(null);
  const [portalTarget, setPortalTarget] = useState<HTMLElement | null>(null);
  useEffect(() => setPortalTarget(document.body), []);
  const selectionRef = useRef({ fromId, toId, walk });
  selectionRef.current = { fromId, toId, walk };

  const { settings, loaded: settingsLoaded } = useSettings();
  // Walking settings as query parameters; a change refetches everything that depends on them.
  const walkQuery = settingsLoaded ? new URLSearchParams(walkParams(settings)).toString() : null;
  const walkQueryRef = useRef(walkQuery);
  walkQueryRef.current = walkQuery;
  const mapStyleRef = useRef(settings.mapStyle);
  mapStyleRef.current = settings.mapStyle;
  const baseLayers = useRef<Record<Settings["mapStyle"], L.TileLayer> | null>(null);

  const { network, failed } = useNetwork();
  const [reachable, setReachable] = useState<Reachable | null>(null);
  const [lineQuery, setLineQuery] = useState("");
  /** Minutes of the walking area drawn around the origin, for the legend. */
  const [walkMinutes, setWalkMinutes] = useState<number | null>(null);
  const reachableRef = useRef(reachable);
  reachableRef.current = reachable;
  const setLineQueryRef = useRef(setLineQuery);

  // Every stop area of a merged stop finds it, whichever id the selection uses.
  const stopsById = useMemo(
    () => new Map(network?.stops.flatMap((stop) => stop.areaIds.map((id) => [id, stop] as const)) ?? []),
    [network],
  );

  useEffect(() => {
    if (!container.current) return;
    // One canvas for every vector layer. With a second canvas (Leaflet's default one, which the
    // walking-radius circle would land on) the top canvas swallows every click on the lines below.
    const map = L.map(container.current, {
      renderer: L.canvas({ tolerance: 6 }),
      // No zoom buttons, as in the design: pinch, scroll wheel or double click.
      zoomControl: false,
      attributionControl: true,
    });
    // Two backgrounds, neither needs a key: the quiet PDOK map (default) and standard
    // OpenStreetMap (fine for light use, see the OSM tile usage policy).
    const bases: Record<Settings["mapStyle"], L.TileLayer> = {
      calm: L.tileLayer(CALM_TILES, { attribution: CALM_ATTRIBUTION, maxZoom: 19, className: "network-tiles" }),
      detailed: L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: TILE_ATTRIBUTION,
        maxZoom: 19,
        className: "network-tiles",
      }),
    };
    baseLayers.current = bases;
    // The background is picked in "Kaart & instellingen" (a stored setting, see the effect below).
    bases[mapStyleRef.current].addTo(map);
    map.setView([52.09, 5.12], 12);
    linesLayer.current = L.layerGroup().addTo(map);
    segmentsLayer.current = L.layerGroup().addTo(map);
    stopsLayer.current = L.layerGroup().addTo(map);
    labelsLayer.current = L.layerGroup().addTo(map);
    markersLayer.current = L.layerGroup().addTo(map);
    map.on("zoomend", () => {
      for (const circle of circles.current) circle.layer.setRadius(stopRadius(circle.look, map.getZoom()));
    });
    map.on("moveend", () => updateLabels.current());

    map.on("click", (event: L.LeafletMouseEvent) => {
      const id = pointId({ lat: event.latlng.lat, lon: event.latlng.lng });
      const place = { id, name: "Punt op de kaart" };
      if (pickTargetRef.current) {
        onPickRef.current(pickTargetRef.current, place);
        return;
      }
      const popup = L.popup({ className: "card-popup", offset: [0, -4] })
        .setLatLng(event.latlng)
        .setContent(
          popupContent("Punt op de kaart", "Gebruikt de haltes in de buurt van dit punt.", null, [
            { label: "Van hier", onClick: () => (onPickRef.current("from", place), map.closePopup()) },
            { label: "Naar hier", onClick: () => (onPickRef.current("to", place), map.closePopup()) },
          ]),
        );
      popup.openOn(map);
    });

    let wasHidden = container.current.clientWidth === 0;
    const resize = new ResizeObserver(([entry]) => {
      map.invalidateSize();
      const hidden = !entry || entry.contentRect.width === 0;
      if (wasHidden && !hidden) refit.current?.();
      wasHidden = hidden;
    });
    resize.observe(container.current);
    mapRef.current = map;
    return () => {
      resize.disconnect();
      map.remove();
      mapRef.current = null;
    };
  }, []);

  // The stored background arrives after the map is made (or changes in another tab): switch to it.
  useEffect(() => {
    const map = mapRef.current;
    const bases = baseLayers.current;
    if (!map || !bases) return;
    const wanted = bases[settings.mapStyle];
    if (map.hasLayer(wanted)) return;
    for (const layer of Object.values(bases)) if (layer !== wanted) map.removeLayer(layer);
    wanted.addTo(map);
    wanted.bringToBack();
  }, [settings.mapStyle]);


  useEffect(() => {
    if (!fromId && !toId) {
      setReachable(null);
      return;
    }
    if (walkQuery === null) return;
    const controller = new AbortController();
    const query = new URLSearchParams(`${walkQuery}&walk=${walk ? "1" : "0"}`);
    if (fromId) query.set("from", fromId);
    if (toId) query.set("to", toId);
    fetch(`/api/reachable?${query}`, { signal: controller.signal })
      .then((response) => (response.ok ? response.json() : Promise.reject(new Error())))
      .then(
        (body: {
          direction: Reachable["direction"];
          areas: string[];
          routes: string[];
          segments: Reachable["segments"];
          positions?: Record<string, [number, number]>;
          boardAreas?: string[] | null;
        }) =>
          setReachable({
            direction: body.direction,
            areas: new Set(body.areas),
            routes: new Set(body.routes),
            segments: body.segments ?? null,
            positions: new Map(Object.entries(body.positions ?? {})),
            boardAreas: body.boardAreas ? new Set(body.boardAreas) : null,
          }),
      )
      .catch(() => {
        if (!controller.signal.aborted) setReachable(null);
      });
    return () => controller.abort();
  }, [fromId, toId, walk, walkQuery]);

  // The open stop: its departures, refreshed like the board, and its poles on the map.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !openStop) return;
    const { stop } = openStop;
    setStopBoard(null);
    setStopFailed(false);
    setStopDirection(undefined);
    let popup: L.Popup | null = null;
    if (openStop.phone) {
      map.closePopup();
    } else {
      const host = document.createElement("div");
      // The card scrolls inside itself, so a busy stop never pushes the map away.
      host.className = "max-h-[min(640px,calc(100dvh-120px))] w-[400px] overflow-y-auto overscroll-contain p-5";
      popup = L.popup({
        offset: [0, -4],
        maxWidth: 400,
        minWidth: 400,
        className: "card-popup",
        autoPanPaddingTopLeft: [24, 80],
        autoPanPaddingBottomRight: [84, 24],
      })
        .setLatLng(openStop.latlng)
        .setContent(host)
        .openOn(map);
      popup.on("remove", () => setOpenStop((current) => (current?.key === openStop.key ? null : current)));
      stopPopup.current = popup;
      setPopupHost(host);
    }

    const { fromId: origin, toId: destination, walk: walking } = selectionRef.current;
    const query = new URLSearchParams(walkQueryRef.current ?? "");
    query.set("stop", stop.id);
    query.set("walk", walking ? "1" : "0");
    if (destination && !stop.areaIds.includes(destination)) query.set("to", destination);
    if (origin && !stop.areaIds.includes(origin)) query.set("from", origin);
    // The stop's poles, lettered as in the card, while it is open.
    const poleLayer = L.layerGroup().addTo(map);
    let controller: AbortController | null = null;
    let first = true;
    const load = () => {
      controller?.abort();
      controller = new AbortController();
      fetch(`/api/departures?${query}`, { signal: controller.signal })
        .then((response) => (response.ok ? (response.json() as Promise<StopBoard>) : Promise.reject(new Error())))
        .then((board) => {
          setStopBoard(board);
          if (first) setStopDirection(defaultDirection(board));
          first = false;
          poleLayer.clearLayers();
          if (board.poles.length > 1 || board.poles.some((pole) => pole.walkMeters !== null)) {
            for (const pole of board.poles) poleMarker(pole).addTo(poleLayer);
          }
        })
        .catch((error: unknown) => {
          if (error instanceof DOMException && error.name === "AbortError") return;
          // A failed refresh keeps the last times on screen; only a failed first load says so.
          if (first) setStopFailed(true);
        });
    };
    load();
    const timer = setInterval(load, STOP_REFRESH_MS);
    return () => {
      clearInterval(timer);
      controller?.abort();
      poleLayer.remove();
      if (popup) {
        popup.off("remove");
        map.closePopup(popup);
      }
      stopPopup.current = null;
      setPopupHost(null);
    };
    // walkQuery and the selection are read when the card opens, like the old popup did.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openStop]);

  // The popup grows with its content; let Leaflet re-measure and keep it in view.
  useEffect(() => {
    stopPopup.current?.update();
  }, [stopBoard, stopDirection, popupHost]);

  /** Every visible line with a path within LINE_HIT_PIXELS of a screen point, once per route. */
  const linesNear = (map: L.Map, point: L.Point): NetworkLine[] => {
    const box = L.latLngBounds(
      map.containerPointToLatLng(L.point(point.x - LINE_HIT_PIXELS, point.y - LINE_HIT_PIXELS)),
      map.containerPointToLatLng(L.point(point.x + LINE_HIT_PIXELS, point.y + LINE_HIT_PIXELS)),
    );
    const limit = LINE_HIT_PIXELS * LINE_HIT_PIXELS;
    const found = new Map<string, NetworkLine>();
    for (const { line, layer } of [...polylines.current, ...segmentLines.current]) {
      if (found.has(line.id) || !map.hasLayer(layer) || !layer.getBounds().intersects(box)) continue;
      const points = layer.getLatLngs() as L.LatLng[];
      let previous = map.latLngToContainerPoint(points[0] as L.LatLng);
      for (let i = 1; i < points.length; i++) {
        const next = map.latLngToContainerPoint(points[i] as L.LatLng);
        if (pixelDistanceSquared(point, previous, next) <= limit) {
          found.set(line.id, line);
          break;
        }
        previous = next;
      }
    }
    return [...found.values()].sort(sortLines);
  };

  /** Popup with every line under the pointer; `fallback` is the line that was hit. */
  const openLinesPopup = (event: L.LeafletMouseEvent, fallback: NetworkLine) => {
    const map = mapRef.current;
    if (!map) return;
    L.DomEvent.stopPropagation(event);
    const lines = linesNear(map, event.containerPoint);
    if (lines.length === 0) lines.push(fallback);
    const content = linesPopupContent(lines, (chosen) => {
      setLineQueryRef.current(chosen.line);
      map.closePopup();
    });
    L.popup({ maxWidth: 320, className: "card-popup" }).setLatLng(event.latlng).setContent(content).openOn(map);
  };

  // Draw lines and stops once the network is in.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !network || !linesLayer.current || !stopsLayer.current) return;
    linesLayer.current.clearLayers();
    stopsLayer.current.clearLayers();

    polylines.current = network.lines.flatMap((line) =>
      line.paths.map((path) => {
        const layer = L.polyline(path, { weight: 3, color: lineColor(line), opacity: 0.8 });
        layer.on("click", (event: L.LeafletMouseEvent) => openLinesPopup(event, line));
        layer.addTo(linesLayer.current as L.LayerGroup);
        return { line, layer };
      }),
    );

    circles.current = network.stops.map((stop) => {
      const layer = L.circleMarker([stop.lat, stop.lon], { ...STOP_STYLE.normal, radius: stopRadius("normal", map.getZoom()) });
      widenTouchTarget(layer);
      layer.on("click", (event: L.LeafletMouseEvent) => {
        L.DomEvent.stopPropagation(event);
        if (pickTargetRef.current) {
          onPickRef.current(pickTargetRef.current, { id: stop.id, name: stop.name });
          return;
        }
        const served = stop.lines
          .map((index) => network.lines[index])
          .filter((line): line is NetworkLine => line !== undefined)
          .sort(sortLines)
          .map((line) => line.line)
          .filter((value, index, all) => value && all.indexOf(value) === index);
        const reach = reachableRef.current;
        const note =
          !reach || stop.areaIds.some((id) => reach.areas.has(id))
            ? null
            : reach.direction === "to"
              ? "Vanaf hier geen rechtstreekse rit naar je bestemming."
              : reach.direction === "both"
                ? "Geen van de lijnen naar je bestemming komt hier."
                : "Geen rechtstreekse rit vanaf je vertrekpunt.";
        setOpenStopRef.current({ stop, served, note, latlng: event.latlng, phone: isPhone(), key: Date.now() });
      });
      layer.addTo(stopsLayer.current as L.LayerGroup);
      return { stop, layer, look: "normal" as StopLook };
    });

    /**
     * Line numbers next to the stops in view, top right of the dot, wherever they do not overlap
     * a label already placed. Stops with the most lines go first; faded stops get none.
     */
    const visibleCircles = () => {
      if (map.getZoom() < LABEL_MIN_ZOOM) return [];
      const bounds = map.getBounds().pad(0.1);
      const focus = labelFocus.current;
      return circles.current
        .filter(({ layer, look }) => look !== "faded" && bounds.contains(layer.getLatLng()))
        .map((circle) => {
          const lines = circle.stop.lines
            .filter((index) => !focus || focus.has(index))
            .map((index) => network.lines[index])
            .filter((line): line is NetworkLine => line !== undefined && line.line !== "")
            .sort(sortLines)
            .filter((line, i, all) => all.findIndex((other) => other.line === line.line) === i);
          return { ...circle, lines };
        })
        .filter((candidate) => candidate.lines.length > 0)
        .sort((a, b) => b.lines.length - a.lines.length);
    };
    /** Where you can get on: times belong there, not at stops further along the ride. */
    const isBoarding = (stop: NetworkStop) => {
      const board = reachableRef.current?.boardAreas;
      return !board || stop.areaIds.some((id) => board.has(id));
    };
    labelCandidates.current = () => visibleCircles().map((circle) => circle.stop).filter(isBoarding);

    updateLabels.current = () => {
      const labels = labelsLayer.current;
      if (!labels) return;
      labels.clearLayers();
      const { toId: destination, walk: walking } = selectionRef.current;
      const times =
        destination && nextTimes.current.key.startsWith(`${destination}|${walking}|`) ? nextTimes.current.areas : null;
      const now = Math.floor(Date.now() / 1000);

      const placed: { x1: number; y1: number; x2: number; y2: number }[] = [];
      for (const { layer, stop, lines: allLines } of visibleCircles()) {
        // With a destination and times loaded: only lines that go there from here, soonest first.
        let lines = allLines.map((line) => ({ line, wait: "" }));
        if (times && isBoarding(stop) && stop.areaIds.some((id) => times.has(id))) {
          const soonest = new Map<string, number>();
          for (const id of stop.areaIds) {
            for (const next of times.get(id) ?? []) {
              const key = `${next.mode}|${next.line}`;
              soonest.set(key, Math.min(soonest.get(key) ?? Infinity, next.expectedDeparture));
            }
          }
          lines = allLines
            .map((line) => ({ line, at: soonest.get(`${line.mode}|${line.line}`) }))
            .filter((entry): entry is { line: NetworkLine; at: number } => entry.at !== undefined)
            .sort((a, b) => a.at - b.at)
            .map(({ line, at }) => ({ line, wait: formatWait(at, now) }));
          if (lines.length === 0) continue;
        }
        const shown = lines.slice(0, LABEL_MAX_LINES);
        const more = lines.length - shown.length;
        const width =
          shown.reduce(
            (sum, { line, wait }) => sum + Math.max(24, line.line.length * LABEL_CHAR_PX + 10) + 4 + (wait ? wait.length * LABEL_CHAR_PX + 5 : 0),
            0,
          ) +
          (more > 0 ? String(more).length * LABEL_CHAR_PX + 14 : 0) +
          10;
        const point = map.latLngToContainerPoint(layer.getLatLng());
        const radius = layer.getRadius();
        const box = {
          x1: point.x + radius + 1,
          y1: point.y - radius - LABEL_HEIGHT_PX,
          x2: point.x + radius + 1 + width,
          y2: point.y - radius,
        };
        if (placed.some((other) => box.x1 < other.x2 && box.x2 > other.x1 && box.y1 < other.y2 && box.y2 > other.y1)) {
          continue;
        }
        placed.push(box);
        const chips = shown
          .map(
            ({ line, wait }) =>
              // The time next to the badge, in plain text: a number inside it would read as a line.
              `<span style="background:${lineColor(line)};color:${textOn(lineColor(line))};border-radius:5px;padding:1px 5px;min-width:24px;text-align:center;font:700 13px/17px var(--font-sans)">${escapeHtml(line.line)}</span>${
                wait ? `<span style="color:var(--color-tekst);font:600 13px/17px var(--font-sans);padding:0 4px 0 1px">${escapeHtml(wait)}</span>` : ""
              }`,
          )
          .join("");
        const html = `<div style="display:flex;align-items:center;gap:4px;width:max-content;padding:3px 5px;border-radius:9px;background:var(--color-achtergrond);box-shadow:0 4px 16px rgba(0,0,0,.2)">${chips}${
          more > 0 ? `<span style="color:var(--color-tekst-zacht);font:600 13px/17px var(--font-sans);padding:0 2px">+${more}</span>` : ""
        }</div>`;
        const marker = L.marker(layer.getLatLng(), {
          icon: L.divIcon({ className: "", html, iconSize: [0, 0], iconAnchor: [-(radius + 1), radius + LABEL_HEIGHT_PX] }),
          keyboard: false,
          title: lines.map(({ line, wait }) => (wait ? `Lijn ${line.line}: ${wait}` : line.line)).join(", "),
        });
        // The label opens the stop, like the dot.
        marker.on("click", (event: L.LeafletMouseEvent) => {
          L.DomEvent.stopPropagation(event);
          layer.fire("click", { latlng: layer.getLatLng() });
        });
        labels.addLayer(marker);
      }
    };

    if (network.stops.length > 0 && !fromId && !toId) {
      map.fitBounds(L.latLngBounds(network.stops.map((stop) => [stop.lat, stop.lon])), fitPadding(10));
    }
    // Only when the network arrives; later selections move the map in the marker effect.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [network]);

  const query = lineQuery.trim().toLowerCase();
  const matchingLines = useMemo(
    () => (network && query ? network.lines.filter((line) => line.line.toLowerCase() === query) : []),
    [network, query],
  );

  // Restyle on every change of focus: a searched line, or what is reachable from the origin.
  useEffect(() => {
    if (!network) return;
    const focusLines = query ? new Set(matchingLines.map((line) => line.id)) : (reachable?.routes ?? null);
    const focusIndexes = new Set<number>();
    network.lines.forEach((line, index) => {
      if (focusLines?.has(line.id)) focusIndexes.add(index);
    });

    // With origin and destination, only the stretches you ride are drawn, not whole lines.
    const segments = !query && reachable?.direction === "both" ? reachable.segments : null;
    segmentsLayer.current?.clearLayers();
    segmentLines.current = [];
    if (segments && segmentsLayer.current) {
      const linesById = new Map(network.lines.map((line) => [line.id, line]));
      for (const segment of segments) {
        const line = linesById.get(segment.routeId);
        if (!line) continue;
        // The design's "Rand lijn": a dark casing under the line's colour.
        const casing = L.polyline(segment.path, { color: CASING, weight: 9, opacity: 0.85, interactive: false });
        const layer = L.polyline(segment.path, { color: lineColor(line), weight: 6, opacity: 1 });
        layer.on("click", (event: L.LeafletMouseEvent) => openLinesPopup(event, line));
        segmentsLayer.current.addLayer(casing);
        segmentsLayer.current.addLayer(layer);
        // Under the stops, so a click on a stop still opens the stop.
        layer.bringToBack();
        casing.bringToBack();
        segmentLines.current.push({ line, layer });
      }
    }

    // Lines outside the focus are taken off the map, not faded: they cannot take you there.
    const group = linesLayer.current;
    for (const { line, layer } of polylines.current) {
      const focused = segments === null && (focusLines === null || focusLines.has(line.id));
      if (!focused) {
        group?.removeLayer(layer);
        continue;
      }
      layer.setStyle({
        color: lineColor(line),
        weight: focusLines === null ? 3 : 5,
        opacity: focusLines === null ? 0.8 : 1,
      });
      if (group && !group.hasLayer(layer)) group.addLayer(layer);
    }
    for (const circle of circles.current) {
      const { stop, layer } = circle;
      // A ride ends at its platform; draw the stop there rather than at the middle of the area.
      const memberPositions = query
        ? []
        : stop.areaIds.map((id) => reachable?.positions?.get(id)).filter((point) => point !== undefined);
      const position: [number, number] | false =
        memberPositions.length > 0 && [
          memberPositions.reduce((sum, point) => sum + point[0], 0) / memberPositions.length,
          memberPositions.reduce((sum, point) => sum + point[1], 0) / memberPositions.length,
        ];
      const at = layer.getLatLng();
      const [lat, lon] = position || [stop.lat, stop.lon];
      if (at.lat !== lat || at.lng !== lon) layer.setLatLng([lat, lon]);
      let look: StopLook = "normal";
      let style = STOP_STYLE.normal;
      if (query) {
        look = stop.lines.some((index) => focusIndexes.has(index)) ? "focus" : "faded";
        style = STOP_STYLE[look];
      } else if (reachable) {
        look = stop.areaIds.some((id) => reachable.areas.has(id)) ? "focus" : "faded";
        style = look === "focus" ? STOP_STYLE.focus : STOP_STYLE.faded;
      }
      circle.look = look;
      layer.setStyle({ ...style, radius: stopRadius(look, mapRef.current?.getZoom() ?? 12) });
      if (look === "focus") layer.bringToFront();
    }
    // Labels list only the lines in focus: the searched line, or the lines you can ride.
    labelFocus.current = query || reachable ? focusIndexes : null;
    updateLabels.current();

    if (query && matchingLines.length > 0 && mapRef.current) {
      const points = matchingLines.flatMap((line) => line.paths.flat());
      if (points.length > 0) mapRef.current.fitBounds(L.latLngBounds(points), fitPadding(20));
    }
  }, [network, reachable, query, matchingLines]);

  // With a destination, labels show when each line next leaves towards it (the chosen direction):
  // fetched for the stops in view after every move and every half minute.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !network || !toId) {
      nextTimes.current = { key: "", areas: new Map() };
      updateLabels.current();
      return;
    }
    if (walkQuery === null) return;
    const key = `${toId}|${walk}|${walkQuery}`;
    let controller: AbortController | null = null;
    let debounce: ReturnType<typeof setTimeout> | null = null;
    const load = () => {
      const areaIds = [...new Set(labelCandidates.current().flatMap((stop) => stop.areaIds))].slice(0, NEXT_TIMES_MAX_AREAS);
      if (areaIds.length === 0) return;
      controller?.abort();
      controller = new AbortController();
      const query = new URLSearchParams(`${walkQuery}&walk=${walk ? "1" : "0"}`);
      query.set("to", toId);
      query.set("areas", areaIds.join(","));
      fetch(`/api/next-departures?${query}`, { signal: controller.signal })
        .then((response) => (response.ok ? (response.json() as Promise<NextDepartures>) : Promise.reject(new Error())))
        .then((body) => {
          // Keep times of stops just scrolled away: moving back shows them at once.
          const areas = nextTimes.current.key === key ? nextTimes.current.areas : new Map();
          for (const [id, list] of Object.entries(body.areas)) areas.set(id, list);
          nextTimes.current = { key, areas };
          updateLabels.current();
        })
        .catch(() => {
          // Labels keep their line numbers without times.
        });
    };
    const schedule = () => {
      if (debounce) clearTimeout(debounce);
      debounce = setTimeout(load, 300);
    };
    load();
    map.on("moveend", schedule);
    const timer = setInterval(load, STOP_REFRESH_MS);
    return () => {
      map.off("moveend", schedule);
      clearInterval(timer);
      if (debounce) clearTimeout(debounce);
      controller?.abort();
    };
  }, [network, toId, walk, reachable, walkQuery]);

  // Where you can walk from the origin (blue: stops inside count to get on) and to the destination
  // (red: where you can get off). Along real streets and footpaths, the same limit as the board;
  // a circle when the server has no road network.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || walkQuery === null || (!fromId && !toId)) return;
    const controller = new AbortController();
    const group = L.layerGroup().addTo(map);
    const ends = [
      { id: fromId, role: "from", color: "#2f6fed" },
      { id: toId, role: "to", color: "#e5484d" },
    ] as const;
    for (const end of ends) {
      if (!end.id) continue;
      const query = new URLSearchParams(`${walkQuery}&walk=${walk ? "1" : "0"}`);
      query.set("id", end.id);
      query.set("role", end.role);
      fetch(`/api/walk-area?${query}`, { signal: controller.signal })
        .then((response) => (response.ok ? (response.json() as Promise<WalkArea>) : Promise.reject(new Error())))
        .then((body) => {
          if (body.radiusMeters <= 0) return;
          // "Loopgebied" in the design: a light fill inside a dashed edge.
          const style: L.PathOptions = { color: end.color, weight: 1.5, opacity: 0.7, dashArray: "6 5", fillOpacity: 0.13, interactive: false };
          const shape = body.polygon
            ? L.polygon(body.polygon, { ...style, smoothFactor: 1.5 })
            : L.circle(body.center, { ...style, radius: body.radiusMeters });
          shape.addTo(group);
          shape.bringToBack();
          // "binnen ~12 min lopen" on the bottom edge of the origin's area.
          if (end.role === "from" && body.minutes) {
            const bounds = shape.getBounds();
            L.marker([bounds.getSouth(), bounds.getCenter().lng], {
              interactive: false,
              keyboard: false,
              icon: L.divIcon({
                className: "",
                iconSize: [0, 0],
                html: `<div class="map-label map-label-walk">binnen ~${body.minutes} min lopen</div>`,
              }),
            }).addTo(group);
          }
          if (end.role === "from") setWalkMinutes(body.polygon ? body.minutes : null);
        })
        .catch(() => {});
    }
    return () => {
      controller.abort();
      group.remove();
      setWalkMinutes(null);
    };
  }, [fromId, toId, walk, walkQuery]);

  // The walks of the departure picked on the board, dashed along the real streets, with the stop
  // at the bus end marked. The map zooms to them.
  const legsKey = JSON.stringify(walkLegs);
  useEffect(() => {
    const map = mapRef.current;
    const legs = JSON.parse(legsKey) as WalkLeg[];
    if (!map || legs.length === 0) return;
    const controller = new AbortController();
    const group = L.layerGroup().addTo(map);
    const point = ([lat, lon]: [number, number]) => `@${lat.toFixed(5)},${lon.toFixed(5)}`;
    Promise.all(
      legs.map((leg) =>
        fetch(`/api/walk-route?${new URLSearchParams({ from: point(leg.from), to: point(leg.to) })}`, { signal: controller.signal })
          .then((response) => (response.ok ? (response.json() as Promise<{ path: [number, number][] | null }>) : { path: null }))
          .catch(() => ({ path: null })),
      ),
    ).then((results) => {
      if (controller.signal.aborted) return;
      const all: [number, number][] = [];
      legs.forEach((leg, i) => {
        const route = results[i]?.path;
        const path: [number, number][] = route ? [leg.from, ...route, leg.to] : [leg.from, leg.to];
        const color = leg.kind === "to" ? "#2f6fed" : "#e5484d";
        L.polyline(path, { color: "#ffffff", weight: 8, opacity: 0.9, interactive: false }).addTo(group);
        L.polyline(path, { color, weight: 5, dashArray: "1 10", lineCap: "round", interactive: false }).addTo(group);
        const stop = leg.kind === "to" ? leg.to : leg.from;
        L.circleMarker(stop, { radius: 8, color: "#111418", weight: 3, fillColor: "#ffffff", fillOpacity: 1, interactive: false })
          .bindTooltip(leg.kind === "to" ? `Hier opstappen: ${leg.label}` : `Hier uitstappen: ${leg.label}`, {
            permanent: true,
            direction: "bottom",
            offset: [0, 10],
            className: leg.kind === "to" ? "map-label map-label-board" : "map-label map-label-alight",
          })
          .addTo(group);
        all.push(...path);
      });
      if (all.length > 0) map.fitBounds(L.latLngBounds(all), { ...fitPadding(50), maxZoom: 17 });
    });
    return () => {
      controller.abort();
      group.remove();
    };
  }, [legsKey]);

  // Origin and destination markers.
  useEffect(() => {
    const map = mapRef.current;
    const layer = markersLayer.current;
    if (!map || !layer) return;
    layer.clearLayers();
    const position = (id: string | null): L.LatLngTuple | null => {
      if (!id) return null;
      const point = parsePointId(id);
      if (point) return [point.lat, point.lon];
      const stop = stopsById.get(id);
      return stop ? [stop.lat, stop.lon] : null;
    };
    const from = position(fromId);
    const to = position(toId);
    if (from) {
      L.marker(from, { icon: originMarker(), keyboard: false, interactive: false }).addTo(layer);
    }
    if (to) {
      L.marker(to, { icon: destinationMarker(), keyboard: false, interactive: false }).addTo(layer);
    }
    const known = [from, to].filter((value): value is L.LatLngTuple => value !== null);
    const fit = () => {
      if (known.length > 0) map.fitBounds(L.latLngBounds(known), { ...fitPadding(60), maxZoom: known.length === 2 ? 15 : 14 });
      else if (stopsById.size > 0) {
        map.fitBounds(L.latLngBounds([...stopsById.values()].map((stop) => [stop.lat, stop.lon])), fitPadding(10));
      }
    };
    refit.current = fit;
    if (known.length === 2 || (known.length === 1 && known[0] && !map.getBounds().contains(known[0]))) fit();
  }, [fromId, toId, walk, stopsById]);

  const lineSuggestions = useMemo(() => {
    if (!network) return [];
    const unique = new Map<string, NetworkLine>();
    for (const line of [...network.lines].sort(sortLines)) if (line.line && !unique.has(line.line)) unique.set(line.line, line);
    return [...unique.values()];
  }, [network]);

  const stopCard = openStop ? (
        <StopCard
          name={openStop.stop.name}
          lines={[...new Set([...openStop.served, ...(stopBoard?.departures.map((departure) => departure.line) ?? [])])]
            .filter(Boolean)
            .sort((a, b) => a.localeCompare(b, "nl", { numeric: true }))}
          note={openStop.note}
          board={stopBoard}
          failed={stopFailed}
          direction={stopDirection ?? null}
          onDirection={setStopDirection}
          onPick={(key) => {
            onPickRef.current(key, { id: openStop.stop.id, name: openStop.stop.name });
            setOpenStop(null);
          }}
          onClose={() => setOpenStop(null)}
        />
      
  ) : null;

  const legend = failed
    ? "Kaart kon niet laden."
    : !network
      ? "Lijnen laden…"
      : query && matchingLines.length === 0
        ? `Geen lijn ${lineQuery} gevonden.`
        : pickTarget
          ? `Tik op een halte of plek: wordt je ${pickTarget === "from" ? "vertrekpunt" : "bestemming"}.`
          : reachable && !query && reachable.routes.size === 0
              ? "Geen rechtstreekse lijn vandaag."
              : null;

  return (
    <div className="relative h-full">
      <div ref={container} className="absolute inset-0" aria-label="Kaart met alle lijnen en haltes" />
      <label
        className={`${lineSearchOpen ? "flex" : "hidden"} absolute top-[calc(var(--map-top)+0.75rem)] left-3 z-[1000] h-11 w-[260px] items-center gap-2 rounded-full bg-achtergrond px-3.5 text-body-s shadow-[0_4px_20px_rgba(0,0,0,0.16)] lg:top-6 lg:left-6 lg:flex`}
      >
        <Icon name="search" size={18} className="text-tekst" />
        <span className="sr-only">Lijn zoeken</span>
        <input
          name="line"
          list="network-lines"
          value={lineQuery}
          onChange={(event) => setLineQuery(event.target.value)}
          placeholder="Zoek een lijn (bijv. 28)"
          maxLength={10}
          className="h-full min-w-0 flex-1 bg-transparent text-tekst outline-none placeholder:text-tekst-zacht"
        />
        <datalist id="network-lines">
          {lineSuggestions.map((line) => (
            <option key={line.id} value={line.line}>
              {MODE_LABEL[line.mode]} {line.name}
            </option>
          ))}
        </datalist>
        {lineQuery && (
          <button
            type="button"
            onClick={() => setLineQuery("")}
            aria-label="Alle lijnen tonen"
            className="-mr-2 flex size-9 items-center justify-center rounded-full text-tekst-zacht hover:bg-oppervlak"
          >
            <Icon name="x" size={18} />
          </button>
        )}
      </label>
      {legend && (
        <p
          className={`pointer-events-none absolute bottom-[calc(min(var(--sheet-h,0px),var(--app-h,100dvh)*0.55)+0.75rem)] left-[max(0.75rem,env(safe-area-inset-left))] z-[1000] max-w-[70%] rounded-[10px] px-[9px] py-[5px] text-body-s font-semibold shadow-[0_4px_16px_rgba(0,0,0,0.16)] lg:bottom-6 lg:left-6 ${
            pickTarget ? "bg-donker text-op-donker" : "bg-achtergrond text-tekst"
          }`}
        >
          {legend}
        </p>
      )}
      {/* The stop card: in its popup on a wide screen; on a phone a sheet in <body>, because the
          map sits in its own stacking context under the board's sheet. */}
      {openStop && !openStop.phone && popupHost && createPortal(stopCard, popupHost)}
      {openStop?.phone &&
        portalTarget &&
        createPortal(
          <section
            aria-label={`Halte ${openStop.stop.name}`}
            className="fixed inset-x-0 bottom-0 z-[1200] max-h-[calc(var(--app-h,100dvh)*0.78)] overflow-y-auto overscroll-contain rounded-t-3xl bg-achtergrond px-4 pb-[max(1.75rem,env(safe-area-inset-bottom))] shadow-[0_-4px_20px_rgba(0,0,0,0.16)] lg:hidden"
          >
            <div className="flex justify-center pt-2 pb-1">
              <span className="h-[5px] w-10 rounded-[3px] bg-rand" />
            </div>
            {stopCard}
          </section>,
          portalTarget,
        )}
    </div>
  );
}
