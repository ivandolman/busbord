"use client";

import { useEffect } from "react";

/**
 * When the session runs out while the app is open, API calls answer 401 with X-Auth-Required.
 * Instead of showing errors everywhere, go to the login page and come back here afterwards.
 */
export function SessionGuard() {
  useEffect(() => {
    const original = window.fetch;
    let leaving = false;
    window.fetch = async (...args: Parameters<typeof fetch>) => {
      const response = await original(...args);
      if (!leaving && response.status === 401 && response.headers.get("X-Auth-Required") === "1") {
        leaving = true;
        const next = window.location.pathname + window.location.search;
        window.location.assign(`/login?${new URLSearchParams({ next })}`);
      }
      return response;
    };
    return () => {
      window.fetch = original;
    };
  }, []);
  return null;
}

/** "Uitloggen" in the settings. Clears this device's offline copies first, then ends the session. */
export function LogoutRow() {
  return (
    <form
      method="post"
      action="/api/logout"
      onSubmit={() => {
        // Best effort; the form submits either way. Saved routes must not stay readable offline.
        if ("caches" in window) void caches.keys().then((keys) => Promise.all(keys.map((key) => caches.delete(key))));
      }}
    >
      <button type="submit" className="flex min-h-14 w-full items-center justify-between gap-3 border-b border-rand py-2.5 text-left">
        <span>
          <span className="block text-body-m font-semibold">Uitloggen</span>
          <span className="block text-body-s text-tekst-zacht">Op dit apparaat</span>
        </span>
      </button>
    </form>
  );
}
