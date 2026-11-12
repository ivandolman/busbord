"use client";

import type { ReactNode } from "react";
import { Icon } from "./Icon";
import { PanelHeader } from "./PanelHeader";
import { useSettings, type Settings } from "./useSettings";

/** Choices for how much longer a trip may take to walk less (see pickBestPairPerTrip). */
const WALK_TIE_OPTIONS = [0, 1, 2, 3, 4, 5, 7, 10, 15];
/** Choices for the longest walk to a stop. */
const MAX_WALK_OPTIONS = [3, 5, 8, 10, 12, 15, 20, 25];

const MAP_STYLES: { value: Settings["mapStyle"]; label: string }[] = [
  { value: "calm", label: "Rustige kaart" },
  { value: "detailed", label: "Gedetailleerde kaart" },
];

/** "Instellingsrij": title and explanation left, the control right, a rule below. */
function Row({ title, detail, children }: { title: string; detail?: string; children: ReactNode }) {
  return (
    <label className="flex min-h-14 items-center gap-3 border-b border-rand py-2.5">
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="text-body-m font-semibold">{title}</span>
        {detail && <span className="text-body-s text-tekst-zacht">{detail}</span>}
      </span>
      {children}
    </label>
  );
}

/** "Keuze": a native select dressed as the design's value + chevron box. */
function Choice({ name, value, disabled, options, onChange }: { name: string; value: number; disabled?: boolean; options: { value: number; label: string }[]; onChange: (value: number) => void }) {
  return (
    <span className="relative inline-flex shrink-0">
      <select
        name={name}
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(Number(event.target.value))}
        className="h-11 appearance-none rounded-lg border border-rand bg-achtergrond pr-8 pl-3 text-body-m font-semibold text-tekst disabled:opacity-50"
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      <span className="pointer-events-none absolute top-1/2 right-3 flex -translate-y-1/2">
        <Icon name="chevD" size={16} />
      </span>
    </span>
  );
}

/** "Schakelaar": 51×31 on/off switch over a real checkbox (the row is the touch target). */
export function Switch({ checked, disabled, onChange }: { checked: boolean; disabled?: boolean; onChange: (checked: boolean) => void }) {
  return (
    <span className="relative inline-flex h-[31px] w-[51px] shrink-0">
      <input
        type="checkbox"
        role="switch"
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange(event.target.checked)}
        className="peer absolute inset-0 z-10 cursor-pointer opacity-0 disabled:cursor-not-allowed"
      />
      <span className="absolute inset-0 rounded-full bg-rand transition-colors peer-checked:bg-succes peer-focus-visible:ring-2 peer-focus-visible:ring-accent peer-disabled:opacity-50" />
      <span className="absolute top-[2px] left-[2px] size-[27px] rounded-full bg-achtergrond shadow transition-transform peer-checked:translate-x-5" />
    </span>
  );
}

/**
 * "Kaart & instellingen": the options you set once and rarely touch, behind the layers button on
 * the map instead of always on screen.
 */
export function SettingsPanel({
  walk,
  onWalkChange,
  notifications,
  savedRoutes,
  account,
  onClose,
}: {
  walk: boolean;
  onWalkChange: (walk: boolean) => void;
  /** Slot for the "Vertrek nu" switch, which lives with the notifications code. */
  notifications?: ReactNode;
  /** Slot for the "Mijn routes" row. */
  savedRoutes?: ReactNode;
  /** Slot for "Uitloggen" when the app has a login. */
  account?: ReactNode;
  onClose: () => void;
}) {
  const { settings, update } = useSettings();

  return (
    <div className="flex flex-col gap-3">
      <PanelHeader title="Kaart & instellingen" onClose={onClose} />
      <div role="radiogroup" aria-label="Achtergrondkaart" className="flex gap-2.5">
        {MAP_STYLES.map((style) => {
          const active = settings.mapStyle === style.value;
          return (
            <button
              key={style.value}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => void update({ ...settings, mapStyle: style.value })}
              className={`flex min-w-0 flex-1 flex-col gap-1.5 rounded-[14px] p-1 text-left ${
                active ? "border-[2.5px] border-accent" : "border border-rand hover:border-tekst-zacht"
              }`}
            >
              {/* eslint-disable-next-line @next/next/no-img-element -- small static preview from the design */}
              <img src={`/map-styles/${style.value}.png`} alt="" width={163} height={84} className="h-[84px] w-full rounded-[10px] object-cover" />
              <span className="flex items-center justify-between px-1.5 pb-1 text-body-s font-semibold">
                {style.label}
                {active && <Icon name="check" size={18} className="text-accent" />}
              </span>
            </button>
          );
        })}
      </div>
      <div className="flex items-center justify-between pt-2">
        <h3 className="text-body-m font-semibold">Instellingen</h3>
        <span className="text-body-s text-tekst-zacht">{walk ? `max ${settings.maxWalkMinutes} min lopen` : "alleen gekozen haltes"}</span>
      </div>
      <div className="flex flex-col">
        <Row title="Ook haltes op loopafstand" detail="Ook verderop instappen als dat sneller is">
          <Switch checked={walk} onChange={onWalkChange} />
        </Row>
        <Row title="Maximaal lopen naar een halte" detail={walk ? MAX_WALK_OPTIONS.join(" · ") + " min" : "Zet haltes op loopafstand aan"}>
          <Choice
            name="max-walk"
            value={settings.maxWalkMinutes}
            disabled={!walk}
            options={MAX_WALK_OPTIONS.map((minutes) => ({ value: minutes, label: `${minutes} min` }))}
            onChange={(minutes) => void update({ ...settings, maxWalkMinutes: minutes })}
          />
        </Row>
        <Row title="Minder lopen mag langer duren" detail="nee, of tot 1 … 15 min">
          <Choice
            name="walk-tie"
            value={settings.walkTieMinutes}
            options={WALK_TIE_OPTIONS.map((minutes) => ({ value: minutes, label: minutes === 0 ? "nee" : `tot ${minutes} min` }))}
            onChange={(minutes) => void update({ ...settings, walkTieMinutes: minutes })}
          />
        </Row>
        {notifications}
        {savedRoutes}
        {account}
      </div>
    </div>
  );
}
