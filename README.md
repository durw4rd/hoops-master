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
- **The Bench (waitlist)** — FIFO; releasing a spot auto-promotes the next player.
- **Credit ledger** — per-crew balances (`paid − spent + earned`), admin-recorded
  payments, and CSV export.
- **Invite-only auth** — Google sign-in restricted to pre-invited/seeded emails,
  with a first-login username picker and an editable handle ("Your Tag").
- **Player pieces** — upload your profile picture ("Your Piece", stored in Vercel
  Blob); shown as your settings avatar and beside your name in player lists.
- **Crew banners** — upload a banner per crew (stored in Vercel Blob) with a
  landscape/portrait toggle; the crew card splits vertically for portrait banners,
  and the banner doubles as the crew-page header.
- **Quality-of-life UI** — settings menu in the header, collapsible crew info,
  a "Show past games" toggle (hidden by default), "My Games" filter, and subtle
  crown/star markers for Capos and Kings in player lists.

## Tech stack

- Next.js 15 (App Router) · React 19 · TypeScript
- Neon Postgres · Drizzle ORM (`@neondatabase/serverless` Pool driver)
- NextAuth v4 (Google OAuth) · LaunchDarkly (additive app-admin override + session/user multi-context)
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

# Optional — LaunchDarkly app-admin override + observability
NEXT_PUBLIC_LAUNCHDARKLY_CLIENT_SIDE_ID=...
EDGE_CONFIG=...
```

### Install & run

```bash
pnpm install
pnpm db:push                      # create tables from the Drizzle schema
pnpm tsx scripts/seedPlayers.ts   # seed the invite allowlist (idempotent)
pnpm dev                          # http://localhost:3000
```

To make yourself the Owner:

```bash
EMAIL=you@example.com ROLE=owner pnpm tsx scripts/setRole.ts
```

## Scripts

| Command | Purpose |
|---|---|
| `pnpm dev` / `pnpm build` / `pnpm start` | Next.js dev / build / serve |
| `pnpm db:generate` | Generate a migration from schema changes |
| `pnpm db:push` | Push schema directly to the DB (dev) |
| `pnpm db:migrate` | Apply migrations |
| `pnpm db:studio` | Drizzle Studio |
| `pnpm tsx scripts/seedPlayers.ts` | Seed / extend the player allowlist |
| `pnpm tsx scripts/setRole.ts` | Set a user's app role (`owner`/`admin`/`user`) |

## Deployment

Deploys to Vercel. Set the same env vars in the Vercel project (connect a Neon
store for `DATABASE_URL`, and a Blob store for `BLOB_READ_WRITE_TOKEN`), then push
to `main`. Run migrations/seed against the production `DATABASE_URL` as needed.

---

**Hoops Master** — get up, get on the bench, run the season. 🏀
