/**
 * Server-side LaunchDarkly client (Vercel SDK + Edge Config).
 *
 * The database is the source of truth for authorization. LaunchDarkly is used
 * ONLY as an additive, on-the-fly override layer for app-level admin (who can
 * create crews/groups). It never replaces the DB role columns.
 *
 * Resolution for "can create groups":
 *   user.global_role === 'admin' (DB)  OR  email present in the `app-admins` flag
 *
 * Fail-closed: if LD/Edge Config is unreachable or unconfigured, the flag is
 * treated as empty and only the DB `global_role` grants access. Authorization
 * never fails open.
 */

import { init, type LDClient } from '@launchdarkly/vercel-server-sdk';
import { createClient, type EdgeConfigClient } from '@vercel/edge-config';
import { APP_VERSION } from '@/lib/appVersion';
const APP_ADMINS_FLAG = 'app-admins';

let ldClient: LDClient | null = null;
let edgeConfigClient: EdgeConfigClient | null = null;

function getClient(): LDClient | null {
  if (ldClient) return ldClient;

  const clientSideId =
    process.env.NEXT_PUBLIC_LAUNCHDARKLY_CLIENT_SIDE_ID || process.env.LD_CLIENT_SIDE_ID;
  const edgeConfigConnection = process.env.EDGE_CONFIG;

  if (!clientSideId || !edgeConfigConnection) {
    // Not configured for server-side eval → fail closed to DB-only.
    return null;
  }

  try {
    edgeConfigClient = edgeConfigClient ?? createClient(edgeConfigConnection);
    // Vercel edge SDK only supports `logger` in options (not `application`).
    ldClient = init(clientSideId, edgeConfigClient);
    return ldClient;
  } catch (err) {
    console.warn('[launchdarkly] failed to init server client:', err);
    return null;
  }
}

/**
 * Returns the list of admin emails configured in the `app-admins` LD flag.
 * Returns [] on any failure (fail-closed).
 */
export async function getAppAdminEmails(email: string): Promise<string[]> {
  const client = getClient();
  if (!client) return [];

  try {
    await client.waitForInitialization();
    // The edge SDK doesn't support application metadata, so the running app
    // version travels as a context attribute instead.
    const context = { kind: 'user', key: email, email, appVersion: APP_VERSION } as const;
    const admins = (await client.variation(APP_ADMINS_FLAG, context, [])) as unknown;
    if (Array.isArray(admins)) {
      return admins.map((a) => String(a).toLowerCase());
    }
    return [];
  } catch (err) {
    console.warn('[launchdarkly] app-admins variation failed:', err);
    return [];
  }
}

/**
 * Whether the user can act as an app admin (create crews/groups).
 *
 * @param email          the user's email
 * @param dbGlobalRole   the user's global_role from the DB ('admin' | 'user')
 */
export async function isAppAdmin(email: string, dbGlobalRole: string): Promise<boolean> {
  // DB is authoritative / fallback. Owner and admin both have app-admin rights.
  if (dbGlobalRole === 'admin' || dbGlobalRole === 'owner') return true;

  const normalized = email.toLowerCase();
  const admins = await getAppAdminEmails(normalized);
  return admins.includes(normalized);
}

export function isServerLdConfigured(): boolean {
  return getClient() !== null;
}

/** Non-secret diagnostics for setup scripts and support. */
export function getLaunchDarklyServerConfigStatus(): {
  hasClientSideId: boolean;
  hasEdgeConfig: boolean;
  serverClientReady: boolean;
} {
  const hasClientSideId = Boolean(
    process.env.NEXT_PUBLIC_LAUNCHDARKLY_CLIENT_SIDE_ID || process.env.LD_CLIENT_SIDE_ID
  );
  const hasEdgeConfig = Boolean(process.env.EDGE_CONFIG);
  return {
    hasClientSideId,
    hasEdgeConfig,
    serverClientReady: isServerLdConfigured(),
  };
}

/** One warning per flag key per instance — enough to diagnose, not a log flood. */
const warnedFlags = new Set<string>();

/**
 * Evaluate an arbitrary server-side flag with a sensible default.
 * Returns the default on any failure (fail-closed for booleans/strings/json).
 *
 * Uses variationDetail rather than variation so an unevaluated flag is visible.
 * A flag that LaunchDarkly serves but that is missing (or a version behind) in
 * the Edge Config snapshot returns the default through the SUCCESS path — no
 * throw, nothing logged, and no LD evaluation event either (the edge SDK runs
 * with sendEvents: false). That silence once cost an afternoon of debugging a
 * client-shows/API-403 split, so the reason is logged here instead.
 */
export async function evalServerFlag<T>(
  flagKey: string,
  email: string,
  defaultValue: T,
  attrs?: Record<string, string>
): Promise<T> {
  const client = getClient();
  if (!client) return defaultValue;

  try {
    await client.waitForInitialization();
    // Optional role attributes (crewRole/appRole) let flags target by role.
    // They inform targeting only — authorization stays DB-authoritative in code.
    const context = { kind: 'user', key: email, email, appVersion: APP_VERSION, ...attrs } as const;
    const detail = await client.variationDetail(flagKey, context, defaultValue as never);

    // 'ERROR' covers FLAG_NOT_FOUND (the stale/missing-snapshot case) plus
    // CLIENT_NOT_READY, MALFORMED_FLAG, WRONG_TYPE and EXCEPTION — the kinds
    // where the value below is our default rather than what LD is serving.
    // FLAG_NOT_FOUND is a reason.errorKind, not a reason.kind.
    if (detail.reason?.kind === 'ERROR' && !warnedFlags.has(flagKey)) {
      warnedFlags.add(flagKey);
      console.warn(
        `[launchdarkly] flag ${flagKey} not evaluated (errorKind=${
          detail.reason.errorKind ?? 'unknown'
        }, variationIndex=${detail.variationIndex ?? 'null'}) — serving the fail-closed default. ` +
          'Check that the flag is in the Edge Config snapshot and available to client-side SDKs.'
      );
    }
    return detail.value as T;
  } catch (err) {
    console.warn(`[launchdarkly] flag ${flagKey} eval failed:`, err);
    return defaultValue;
  }
}
