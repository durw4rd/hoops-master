/**
 * Verify server-side LaunchDarkly (Vercel Edge Config) wiring.
 *
 * Usage (after `vercel env pull .env.local`):
 *   pnpm tsx scripts/verify-launchdarkly-server.ts
 */

import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';

function loadEnvLocal() {
  const path = resolve(process.cwd(), '.env.local');
  if (!existsSync(path)) {
    console.warn('No .env.local — run: npx vercel env pull .env.local');
    return;
  }
  const text = readFileSync(path, 'utf8');
  for (const line of text.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq);
    let value = trimmed.slice(eq + 1);
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = value;
  }
}

async function main() {
  loadEnvLocal();

  const { getLaunchDarklyServerConfigStatus, evalServerFlag } = await import(
    '../lib/launchdarkly'
  );

  const status = getLaunchDarklyServerConfigStatus();
  console.log('LaunchDarkly server wiring:');
  console.log(JSON.stringify(status, null, 2));

  if (!status.serverClientReady) {
    console.log('\nServer LD is not ready. See docs/launchdarkly-vercel-setup.md');
    process.exit(1);
  }

  const testEmail = process.env.VERIFY_LD_EMAIL ?? 'verify@example.com';
  const SERVER_FLAGS = [
    'guest-spots',
    'player-spot-reassignment',
    'group-settlement',
    'email-notifications',
  ] as const;

  console.log(`\nServer flag evaluations (context ${testEmail}):`);
  for (const key of SERVER_FLAGS) {
    console.log(`  ${key}: ${await evalServerFlag(key, testEmail, false)}`);
  }

  await printSnapshot();
  console.log('\nOK — server client initialized.');
}

/**
 * Dump what the Edge Config snapshot actually holds per flag. The server reads
 * ONLY this snapshot, so a flag whose `version` here is behind the version shown
 * in the LaunchDarkly dashboard is being evaluated against stale data — the one
 * failure mode that looks identical to a normal evaluation at runtime.
 */
async function printSnapshot() {
  const clientSideId =
    process.env.NEXT_PUBLIC_LAUNCHDARKLY_CLIENT_SIDE_ID || process.env.LD_CLIENT_SIDE_ID;
  const connection = process.env.EDGE_CONFIG;
  if (!clientSideId || !connection) return;

  const { createClient } = await import('@vercel/edge-config');
  const payload = (await createClient(connection).get(`LD-Env-${clientSideId}`)) as
    | { flags?: Record<string, { version?: number; on?: boolean }> }
    | undefined;

  if (!payload?.flags) {
    console.log(`\nEdge Config item LD-Env-${clientSideId} is missing or has no flags.`);
    return;
  }

  console.log('\nEdge Config snapshot (compare `version` against the LD dashboard):');
  for (const [key, flag] of Object.entries(payload.flags).sort()) {
    console.log(`  ${key}: version=${flag.version ?? '?'} on=${flag.on ?? '?'}`);
  }
  console.log(
    '\nFlags used in code but absent above never reach the server — they need\n' +
      '"SDKs using Client-side ID" enabled in LaunchDarkly to be synced here.'
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
