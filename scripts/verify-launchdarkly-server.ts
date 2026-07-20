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
  const guestSpots = await evalServerFlag('guest-spots', testEmail, false);
  console.log(`\nguest-spots variation (context ${testEmail}):`, guestSpots);
  console.log('\nOK — server client initialized.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
