"use client";

import { useState } from "react";
import { useFlags } from "launchdarkly-react-client-sdk";
import { RefreshCw, X } from "lucide-react";
import { APP_VERSION } from "@/lib/appVersion";

/**
 * "New version available" banner, driven by the LaunchDarkly BOOLEAN flag
 * `app-version-upgrade-banner`. The running bundle's version travels on every
 * LD context as the `appVersion` attribute (see LDIdentify/LaunchDarklyProvider),
 * so the flag's targeting rule decides who is outdated — e.g.
 * `appVersion semVerLessThan <latest release>` → serve true; default off.
 * The app just renders the banner whenever the flag evaluates true.
 */
export default function UpdateBanner() {
  const flags = useFlags();
  const [dismissed, setDismissed] = useState(false);

  const updateAvailable = flags?.appVersionUpgradeBanner === true;

  if (!updateAvailable || dismissed) return null;

  return (
    <div className="bg-dull-gold border-b-4 border-asphalt">
      <div className="max-w-4xl mx-auto px-4 py-2 flex items-center justify-between gap-3">
        <p className="font-graffiti text-sm text-asphalt">
          Fresh drop: a new version is out — you&apos;re on v{APP_VERSION}.
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
