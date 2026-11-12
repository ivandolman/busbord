import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import type { SavedRoute } from "@/lib/saved-routes";
import { parseWalkTieMinutes, UserStore } from "@/lib/user-data";

const route = (id: string, fromId: string, toId: string, savedAt: number): SavedRoute => ({
  id,
  name: `Route ${id}`,
  from: { id: fromId, name: "A" },
  to: { id: toId, name: "B" },
  walk: true,
  savedAt,
  schedule: { days: [1, 2, 3, 4, 5], start: "07:30", end: "09:00" },
});

describe("UserStore", () => {
  it("keeps routes newest first, replaces the same trip and deletes", () => {
    const store = new UserStore(new DatabaseSync(":memory:"));
    store.saveRoute(route("a", "stoparea:1", "stoparea:2", 1));
    store.saveRoute(route("b", "stoparea:3", "@52.09848,5.12513", 2));
    expect(store.routes().map((r) => r.id)).toEqual(["b", "a"]);
    expect(store.routes()[0]?.schedule).toEqual({ days: [1, 2, 3, 4, 5], start: "07:30", end: "09:00" });

    // Same pair under a new id replaces the old entry.
    const routes = store.saveRoute(route("c", "stoparea:1", "stoparea:2", 3));
    expect(routes.map((r) => r.id)).toEqual(["c", "b"]);

    expect(store.deleteRoute("b").map((r) => r.id)).toEqual(["c"]);
  });

  it("stores the walking tie, with a default", () => {
    const store = new UserStore(new DatabaseSync(":memory:"));
    expect(store.settings().walkTieMinutes).toBe(2);
    expect(store.saveSettings({ walkTieMinutes: 5 }).walkTieMinutes).toBe(5);
    expect(store.settings().mapStyle).toBe("calm");
    expect(store.saveSettings({ mapStyle: "detailed" })).toEqual({ walkTieMinutes: 5, mapStyle: "detailed", maxWalkMinutes: 12 });
    expect(store.saveSettings({ maxWalkMinutes: 8 }).maxWalkMinutes).toBe(8);
  });

  it("accepts only whole minutes in range", () => {
    expect(parseWalkTieMinutes("3")).toBe(3);
    expect(parseWalkTieMinutes(0)).toBe(0);
    expect(parseWalkTieMinutes("-1")).toBeNull();
    expect(parseWalkTieMinutes("1.5")).toBeNull();
    expect(parseWalkTieMinutes("99")).toBeNull();
    expect(parseWalkTieMinutes(null)).toBeNull();
    expect(parseWalkTieMinutes("")).toBeNull();
  });
});
