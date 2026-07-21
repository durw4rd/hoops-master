"use client";

import { useEffect } from "react";
import { useSession } from "next-auth/react";
import { useLDClient } from "launchdarkly-react-client-sdk";
import { getDeviceType, getBrowserName, getOrCreateSessionId } from "@/lib/utils";
import { APP_VERSION } from "@/lib/appVersion";

/**
 * Keeps the LaunchDarkly evaluation context in sync with auth state.
 *
 * - Pre-login (anonymous): a single `session` context kind only.
 * - Logged in: a multi-context with both `session` and `user` kinds.
 *
 * Device + browser attributes are attached to every context. Must be rendered
 * inside both the NextAuth SessionProvider and the LaunchDarkly provider.
 */
export default function LDIdentify() {
  const { data: session, status } = useSession();
  const ldClient = useLDClient();

  const email = session?.user?.email ?? null;
  const name = session?.user?.name ?? null;

  useEffect(() => {
    if (!ldClient || status === "loading") return;

    const deviceType = getDeviceType();
    const browser = getBrowserName();
    const appVersion = APP_VERSION;
    const sessionContext = { key: getOrCreateSessionId(), deviceType, browser, appVersion };

    if (email) {
      ldClient.identify({
        kind: "multi",
        session: sessionContext,
        user: {
          key: email,
          email,
          name: name || email,
          deviceType,
          browser,
          appVersion,
        },
      });
    } else {
      ldClient.identify({ kind: "session", ...sessionContext });
    }
  }, [ldClient, status, email, name]);

  return null;
}
