# LaunchDarkly + Vercel (server-side flags)

Hoops Master evaluates feature flags in two places:

| Layer | SDK | Env vars | Used for |
|-------|-----|----------|----------|
| **Browser** | `launchdarkly-react-client-sdk` | `NEXT_PUBLIC_LAUNCHDARKLY_CLIENT_SIDE_ID` | UI (`useFlags()` → e.g. `guestSpots`, `groupSettlementUi`) |
| **Server (API routes)** | `@launchdarkly/vercel-server-sdk` + Edge Config | `EDGE_CONFIG` + same client-side ID | `evalServerFlag('guest-spots', …)` |

Without **`EDGE_CONFIG`**, the server **never** reads LaunchDarkly (fail-closed). That is why `POST .../assign-guest` returns `403` with `"Guest spots are not enabled"` even when the flag is on in the LD UI.

Implementation: [`lib/launchdarkly.ts`](../lib/launchdarkly.ts).

## Prerequisites

1. **LaunchDarkly** project with your flags (e.g. `guest-spots`, `group-settlement`).
2. **Vercel** project linked to this repo.
3. **LaunchDarkly ↔ Vercel integration** — LaunchDarkly documents this as an **Enterprise** integration. If your LD plan does not include it, contact LaunchDarkly or use a different server-side approach (Node SDK + server-side SDK key).

References:

- [Vercel: LaunchDarkly + Edge Config](https://vercel.com/docs/edge-config/edge-config-integrations/launchdarkly-edge-config)
- [LaunchDarkly: Vercel integration](https://docs.launchdarkly.com/integrations/vercel)

## One-time setup (production)

### 1. Install the integration

1. Open [LaunchDarkly on the Vercel Integrations marketplace](https://vercel.com/integrations/launchdarkly).
2. Click **Add integration** and select your Vercel **team** and **hoops-master** project.
3. Complete **Authorize** in LaunchDarkly.
4. On the configuration screen:
   - **Environment** — pick the LD environment you use in prod (must match the client-side ID you use in Vercel).
   - **Edge Config** — choose **Create new Edge Config** (recommended) or an existing store.
5. Save. LaunchDarkly will **sync flag data into that Edge Config** on changes.

After this, you should see an **Edge Config** store under the Vercel project (Storage / Edge Config), not only Blob + Neon.

### 2. Link Edge Config to the project (if not automatic)

1. Vercel project → **Settings** → **Edge Config** (or Storage → Edge Config).
2. Connect the store created by the integration to this project.
3. Confirm **`EDGE_CONFIG`** appears under **Settings → Environment Variables** (often added automatically for Production/Preview). It is a connection string, not a flag value.

### 3. Client-side ID (browser SDK)

Use the **same** LaunchDarkly environment as step 1.

1. LD → **Project settings** → your environment → copy **Client-side ID**.
2. Vercel → **Settings → Environment Variables**:
   - `NEXT_PUBLIC_LAUNCHDARKLY_CLIENT_SIDE_ID` = that client-side ID  
   (Optional alias supported in code: `LD_CLIENT_SIDE_ID`.)

### 4. Flags to configure

| Flag key | Type | Client SDK name | Server |
|----------|------|-----------------|--------|
| `guest-spots` | Boolean | `guestSpots` | `assign-guest` API |
| `player-spot-reassignment` | Boolean | `playerSpotReassignment` | `reassign` / `assign-guest` APIs |
| `group-settlement` | Boolean | — (server only) | all four `settlement` handlers |
| `group-settlement-ui` | Boolean | `groupSettlementUi` | — (client only) |

App-admin is **not** flag-driven: it comes from `users.global_role`, managed in the
Black Book.

Enable **SDKs using Client-side ID** (or “available to client-side SDK”) in LaunchDarkly for **every** flag here — not just the browser ones. The LD→Edge Config integration only syncs client-side-available flags, and the server SDK reads exclusively from that snapshot, so a server-only flag without this setting never reaches the server and silently fails closed.

Turn **`guest-spots`** on in the environment wired to Edge Config. After changing a flag, the integration writes to Edge Config (may take a few seconds).

### 5. Redeploy

Redeploy production (and preview if you use it) so serverless functions pick up `EDGE_CONFIG`.

### 6. Verify

```bash
npx vercel env pull .env.local   # after integration; pulls EDGE_CONFIG locally
pnpm tsx scripts/verify-launchdarkly-server.ts
```

Expected: `serverClientReady: true`. Then retry guest assign in the app.

## Local development

1. Complete Vercel integration (steps above).
2. `npx vercel login` and `npx vercel link` in the repo (select the hoops-master project).
3. `npx vercel env pull .env.local`
4. Confirm `.env.local` contains **`EDGE_CONFIG`** and **`NEXT_PUBLIC_LAUNCHDARKLY_CLIENT_SIDE_ID`**.
5. Restart `pnpm dev`.

`drizzle.config.ts` does **not** load `.env.local`; only `pnpm dev` / Next.js do. The verify script loads `.env.local` explicitly.

## Troubleshooting

| Symptom | Likely cause |
|---------|----------------|
| No Edge Config in Vercel Storage | Integration not installed or store not created — repeat step 1. |
| `EDGE_CONFIG` missing in Vercel env | Store not linked to project — step 2. |
| Client flag on, API 403 guest | `EDGE_CONFIG` missing locally or wrong LD environment vs client-side ID. |
| `serverClientReady: false` after pull | Wrong/missing connection string; redeploy; check integration status in LD. |
| Flag changes not reflected server-side | Integration sync delay; toggle flag again; check LD integration logs. |
| UI shows the feature but the API returns 403 "not enabled" | The Edge Config snapshot is a flag **version** behind what LD streams to the browser (this happened to `group-settlement`: Edge Config held v2 `on:false` while LD served v3). Re-save the flag in LD to force a sync, confirm the Edge Config item changed, and look for `[launchdarkly] flag <key> not evaluated` in the server logs. Gating UI and API on *separate* keys avoids the split. |
| A brand-new flag always fails closed server-side | The key isn't in the Edge Config item yet — new flags land on their next change, and only if they're client-side available. `errorKind=FLAG_NOT_FOUND` in the server log confirms it. |
| Local dev keeps serving a stale flag value | `@vercel/edge-config` uses a stale-while-revalidate cache whenever `NODE_ENV=development`, so the first request after a change still returns the old value. Set `EDGE_CONFIG_DISABLE_DEVELOPMENT_SWR=1` in `.env.local` and restart `pnpm dev`. |

## Security note

Server flags gate **authorization-style** behavior (`assign-guest`, the settlement API). Client flags only control UI visibility. Always keep the server check (`evalServerFlag`).

Settlement deliberately uses a **split pair**: `group-settlement` is the API gate, `group-settlement-ui` only controls visibility and is the one to target per player. Authorization itself is always DB-authoritative — crew membership and role are enforced by `lib/apiGuards.ts` regardless of any flag.
