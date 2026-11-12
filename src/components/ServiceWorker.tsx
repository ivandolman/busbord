"use client";

import { useEffect } from "react";

/**
 * Registers the service worker (offline use, "Vertrek nu" notifications) in production builds.
 * Not in development: a caching worker would serve stale code between edits.
 */
export function ServiceWorker() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js").catch(() => {
      // Without it the app still works, only not offline.
    });
  }, []);
  return null;
}
