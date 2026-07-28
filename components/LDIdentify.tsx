"use client";

import { useEffect } from "react";
import { useSession } from "next-auth/react";
import { useLDClient } from "launchdarkly-react-client-sdk";
import { getDeviceType, getBrowserName, getOrCreateSessionId } from "@/lib/utils";
import { buildLdContext } from "@/lib/ldContext";

/**
 * Keeps the LaunchDarkly evaluation context in sync with auth state.
 *
 * - Pre-login (anonymous): a single `session` context kind only.
 * - Logged in: a multi-context with `session` + `user` kinds, carrying the
 *   global `appRole`. The per-crew `crewRole` defaults to 'none' here and is
 *   enriched by the dashboard when a crew is opened (see app/page.tsx).
 *
 * Must be rendered inside both the NextAuth SessionProvider and the LD provider.
 */
export default function LDIdentify() {
  const { data: session, status } = useSession();
  const ldClient = useLDClient();

  const email = session?.user?.email ?? null;
  const name = session?.user?.name ?? null;
  const appRole = session?.user?.globalRole ?? null;

  useEffect(() => {
    if (!ldClient || status === "loading") return;
    ldClient.identify(
      buildLdContext({
        sessionId: getOrCreateSessionId(),
        deviceType: getDeviceType(),
        browser: getBrowserName(),
        email,
        name,
        appRole,
      })
    );
  }, [ldClient, status, email, name, appRole]);

  return null;
}
