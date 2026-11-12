import type { MetadataRoute } from "next";
import { cookies } from "next/headers";
import { authMode, SESSION_COOKIE, verifySessionToken } from "@/lib/auth";
import { scheduledRoute } from "@/lib/saved-routes";
import { getUserStore } from "@/lib/user-data";

export const dynamic = "force-dynamic";

/** Home-screen shortcuts (long press on the app icon): the saved routes, regular trips first. */
const MAX_SHORTCUTS = 4;

async function shortcuts(): Promise<MetadataRoute.Manifest["shortcuts"]> {
  // The manifest is public (browsers may fetch it without cookies); route names are not.
  if (authMode() === "misconfigured") return [];
  if (authMode() === "on" && verifySessionToken((await cookies()).get(SESSION_COOKIE)?.value) === null) return [];
  try {
    const routes = getUserStore().routes();
    const now = new Date();
    const current = scheduledRoute(routes, now);
    const ordered = [...routes].sort((a, b) => Number(b === current) - Number(a === current) || Number(!!b.schedule) - Number(!!a.schedule));
    return ordered.slice(0, MAX_SHORTCUTS).map((route) => {
      const query = new URLSearchParams({ from: route.from.id, to: route.to.id });
      if (!route.walk) query.set("walk", "0");
      return {
        name: route.name,
        short_name: route.name.slice(0, 12),
        description: `${route.from.name} → ${route.to.name}`,
        url: `/?${query}`,
        icons: [{ src: "/icon.svg", sizes: "any", type: "image/svg+xml" }],
      };
    });
  } catch {
    // No user database yet (or unreadable): an app without shortcuts.
    return [];
  }
}

/** Lets the board be added to a phone's home screen and open like an app. */
export default async function manifest(): Promise<MetadataRoute.Manifest> {
  return {
    name: "Bestemmingsbord",
    short_name: "Bestemming",
    description: "Alle bussen en trams naar jouw bestemming op één vertrekbord.",
    start_url: "/",
    display: "standalone",
    background_color: "#f5f5f4",
    theme_color: "#1c1917",
    icons: [{ src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" }],
    shortcuts: await shortcuts(),
  };
}
