"use client";

import { useEffect, useState } from "react";
import { RefreshCw, X } from "lucide-react";
import { APP_BUILD_ID } from "@/lib/appVersion";

/**
 * "New version available" banner — fully automatic, no LaunchDarkly.
 * Polls /api/version (on mount, on window focus, every 5 min) and compares the
 * live deployment's build id against this tab's baked-in APP_BUILD_ID. On a
 * mismatch the tab is running an older bundle, so prompt a reload. In dev both
 * ids are 'dev', so the banner never shows locally.
 */
export default function UpdateBanner() {
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const check = async () => {
      try {
        const res = await fetch("/api/version", { cache: "no-store" });
        if (!res.ok) return;
        const { buildId } = await res.json();
        if (!cancelled && buildId && APP_BUILD_ID && buildId !== APP_BUILD_ID) {
          setUpdateAvailable(true);
        }
      } catch {
        // Offline / transient — ignore; we retry on focus + interval.
      }
    };

    check();
    const onFocus = () => check();
    window.addEventListener("focus", onFocus);
    const interval = setInterval(check, 5 * 60 * 1000);
    return () => {
      cancelled = true;
      window.removeEventListener("focus", onFocus);
      clearInterval(interval);
    };
  }, []);

  if (!updateAvailable || dismissed) return null;

  return (
    <div className="bg-dull-gold border-b-4 border-asphalt">
      <div className="max-w-4xl mx-auto px-4 py-2 flex items-center justify-between gap-3">
        <p className="font-graffiti text-sm text-asphalt">
          Fresh drop: a new version is out — reload to catch up.
        </p>
        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="flex items-center gap-1.5 bg-asphalt text-sticker-white px-3 py-1.5 border-2 border-asphalt font-graffiti text-xs hover:bg-terracotta transition-colors"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            RELOAD TO UPDATE
          </button>
          <button
            type="button"
            onClick={() => setDismissed(true)}
            aria-label="Dismiss update banner"
            className="p-1 text-asphalt/60 hover:text-asphalt transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
