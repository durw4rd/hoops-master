# Hoops Master 🏀

A multi-crew basketball event organizer. Spin up a **crew**, drop **games**, manage
who plays, trade spots, and keep everyone's credit straight — all in an 80s NYC
subway-graffiti skin.

## Features

- **Crews (multi-tenant groups)** — public or private, with invite codes and
  role-based access (Owner / Admin app roles; Capo / King / Player crew roles).
- **Games** — single or recurring series, 15-min time precision, configurable
  signup windows, spot limits, per-crew default price.
- **Assignment modes** — admin-assign (single/batch), player self-signup, and a
  sliding **round-robin rotation** for when there are more players than spots.
- **Spot trading** — claim, offer, release, reassign; every move recorded.
- **Rider spots** — bring a plus-one into the game. Each player can hold one
  primary spot + one Rider (+1). Both cost the same and are tracked in the ledger.
  Drop the Rider first before releasing your own spot.
- **The Bench (waitlist)** — FIFO; any freed spot (player release, offer, admin
  removal, extra capacity) auto-promotes the next seatable player — a spot never
  sits open while the bench is occupied. Within **24h of tip-off** the promoted
  player must approve first (decline passes it down the bench; if the bench runs
  dry the spot opens for anyone). Capo/King can remove players from the bench.
- **Guest spots** (LaunchDarkly `guest-spots`) — Capo/King can assign a spot to a
  named guest (roster only, credit-neutral — settle outside the app); gated
  server-side via Vercel Edge Config.
- **Credit ledger (append-only)** — per-crew balances (`paid − spent + earned`),
  admin-recorded payments (single or batch), and CSV export. Nothing is ever
  deleted from the books: admin removals, game cancellations, and pricing undos
  write visible compensating refund entries.
- **Email notifications (Resend)** — 48h game reminders (Vercel Cron) and bench
  promotion emails (incl. last-minute approval requests), with per-type opt-out
  toggles in profile settings. Gated behind the LD boolean flag
  `email-notifications` (fail-closed) — deploy first, flip the flag when your
  Resend domain is verified.
- **Upgrade banner** — the LD boolean flag `app-version-upgrade-banner` (targeting
  rule on the `appVersion` context attribute, e.g. semVerLessThan the latest
  release) prompts users on stale bundles to reload; version shown in the footer.
- **Invite-only auth** — Google sign-in restricted to pre-invited/seeded emails,
  with a first-login username picker and an editable handle ("Your Tag").
- **Player pieces** — upload your profile picture ("Your Piece", stored in Vercel
  Blob); shown as your settings avatar and beside your name in player lists.
- **Crew banners** — upload a banner per crew (stored in Vercel Blob) with a
  landscape/portrait toggle; portrait banners split crew cards vertically, and
  the banner fills a mural hero at the top of the crew dashboard.
- **Graffiti UI** — 80s NYC subway / Martha Cooper palette (concrete texture,
  sticker shadows, Bangers + Permanent Marker type), shared shell with logo
  banner, crew mural hero, and poster-style crew cards.
- **Quality-of-life UI** — settings menu, collapsible crew info, "Show past games"
  toggle (hidden by default), "My Games" filter, crown/star markers for Capos
  and Kings in player lists.

## Tech stack

- Next.js 15 (App Router) · React 19 · TypeScript
- Neon Postgres · Drizzle ORM (`@neondatabase/serverless` Pool driver)
- NextAuth v4 (Google OAuth) · LaunchDarkly (client SDK + Vercel Edge Config for server flags)
- Vercel Blob (crew banner + player piece images)
- Tailwind CSS · shadcn/ui · Vercel · pnpm

See **[`APP_ARCHITECTURE.md`](./APP_ARCHITECTURE.md)** for the full architecture and
**[`VOCABULARY.md`](./VOCABULARY.md)** for the app's voice/terminology.

## Getting started

### Prerequisites
- Node.js 18+ and `pnpm`
- A Neon Postgres database (free tier is fine)
- A Google OAuth client (Client ID + Secret)

### Environment

Create `.env.local`:

```bash
DATABASE_URL=postgres://...           # Neon POOLED connection string
NEXTAUTH_SECRET=your-random-secret
NEXTAUTH_URL=http://localhost:3000    # no trailing slash
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
SEED_ADMIN_EMAILS=you@example.com     # optional: comma-separated emails promoted to admin on seed

# Crew banner uploads (Vercel Blob). Auto-added to .env.local when you link a
# Blob store: `vercel blob create-store <name> --access public --yes`
BLOB_READ_WRITE_TOKEN=...

# Optional — LaunchDarkly (see docs/launchdarkly-vercel-setup.md)
NEXT_PUBLIC_LAUNCHDARKLY_CLIENT_SIDE_ID=...
# EDGE_CONFIG=...   # added by LaunchDarkly ↔ Vercel integration (server API flags)

# Optional — email notifications (sending no-ops without these; see APP_ARCHITECTURE.md)
RESEND_API_KEY=...                    # Resend API key
EMAIL_FROM="Hoops Master <notifications@yourdomain.com>"   # verified sender
CRON_SECRET=...                       # Bearer secret for /api/cron/event-reminders
```

Server APIs (`guest-spots`, `app-admins` on routes) need **`EDGE_CONFIG`**. Install the
[Vercel LaunchDarkly integration](docs/launchdarkly-vercel-setup.md), then
`npx vercel env pull .env.local` and `pnpm tsx scripts/verify-launchdarkly-server.ts`.

The app uses five LaunchDarkly flags (`app-admins`, `guest-spots`,
`player-spot-reassignment`, `email-notifications`, `app-version-upgrade-banner`)
— all additive and fail-closed. See the flag inventory table in
[`APP_ARCHITECTURE.md`](./APP_ARCHITECTURE.md#feature-flags) for types, defaults,
and which are per-user targetable.

### Install & run

```bash
pnpm install
pnpm db:push                      # create tables from the Drizzle schema
pnpm tsx scripts/seedPlayers.ts   # seed the invite allowlist (idempotent)
pnpm dev                          # http://localhost:3000 (port pinned in package.json)
```

To make yourself the Owner:

```bash
EMAIL=you@example.com ROLE=owner pnpm tsx scripts/setRole.ts
```

## Scripts

| Command | Purpose |
|---|---|
| `pnpm dev` / `pnpm build` / `pnpm start` | Next.js dev / build / serve (dev & start bind to port **3000**) |
| `pnpm test` | Vitest suite on an embedded Postgres (no Docker needed) — spot lifecycle, ledger, and bench invariants |
| `pnpm lint` | ESLint (flat config) |
| `pnpm db:generate` | Generate a migration from schema changes (updates journal + snapshot) |
| `pnpm db:push` | Push schema directly to the DB (dev, no migration file) |
| `pnpm db:migrate` | Apply journal-tracked migrations — requires `DATABASE_URL` in the shell (see [`APP_ARCHITECTURE.md`](./APP_ARCHITECTURE.md#database-migrations)) |
| `pnpm db:studio` | Drizzle Studio |
| `pnpm tsx scripts/seedPlayers.ts` | Seed / extend the player allowlist |
| `pnpm tsx scripts/setRole.ts` | Set a user's app role (`owner`/`admin`/`user`) |
| `pnpm tsx scripts/verify-launchdarkly-server.ts` | Check `EDGE_CONFIG` + server LD client (after `vercel env pull`) |

## Deployment

Deploys to Vercel on push to `main` (Git integration). Set the same env vars in
the Vercel project (connect a Neon store for `DATABASE_URL`, and a Blob store for
`BLOB_READ_WRITE_TOKEN`). For server-side flags, link **Edge Config** and set
`EDGE_CONFIG` (see [`docs/launchdarkly-vercel-setup.md`](docs/launchdarkly-vercel-setup.md)).
Ensure `NEXTAUTH_URL` matches your production domain
(no trailing slash). Run `pnpm db:migrate` against production `DATABASE_URL` when
shipping schema changes, then seed/role scripts as needed.

For emails, set `RESEND_API_KEY`, `EMAIL_FROM`, and `CRON_SECRET` in Vercel — the
reminder cron in `vercel.json` activates on the next deploy. It runs once daily
(07:00 UTC): the Hobby plan rejects deploys with sub-daily cron schedules. For a
tighter cadence, upgrade to Pro or hit the same URL from an external scheduler
with the `Authorization: Bearer $CRON_SECRET` header — the route is idempotent.
After each release, update the `app-version-upgrade-banner` flag's targeting rule
(`appVersion` semVerLessThan the new version → true) so stale tabs get the
reload banner.

---

**Hoops Master** — get up, get on the bench, run the season. 🏀
