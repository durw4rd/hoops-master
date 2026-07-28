import { APP_VERSION } from '@/lib/appVersion';

/**
 * Shared builder for the LaunchDarkly client context, so every `identify()`
 * caller (LDIdentify on auth, the dashboard on active-crew change) produces the
 * same shape and never drops an attribute.
 *
 * `appRole` (global users.global_role) and `crewRole` (the viewing player's role
 * in the currently-open crew, or 'none') are targeting attributes only —
 * authorization stays DB-authoritative in the API layer.
 */
export interface LdContextInput {
  sessionId: string;
  deviceType: string;
  browser: string;
  email?: string | null;
  name?: string | null;
  appRole?: string | null;
  crewRole?: string | null;
}

export function buildLdContext(input: LdContextInput) {
  const session = {
    key: input.sessionId,
    deviceType: input.deviceType,
    browser: input.browser,
    appVersion: APP_VERSION,
  };

  if (!input.email) {
    return { kind: 'session' as const, ...session };
  }

  return {
    kind: 'multi' as const,
    session,
    user: {
      key: input.email,
      email: input.email,
      name: input.name || input.email,
      deviceType: input.deviceType,
      browser: input.browser,
      appVersion: APP_VERSION,
      appRole: input.appRole || 'user',
      crewRole: input.crewRole || 'none',
    },
  };
}
