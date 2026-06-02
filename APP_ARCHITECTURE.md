# Hoops Master — Architecture

> Reference doc for engineers and AI agents. Describes the current Neon/Drizzle
> architecture. For language/copy conventions, see [`VOCABULARY.md`](./VOCABULARY.md).

## What it is

Hoops Master is a multi-crew (multi-tenant) basketball event organizer. App admins
create **crews** (groups), schedule **games** (events), and manage who plays.
Players claim spots, trade them, sit on a waitlist, and every spot movement is
tracked as credit scoped to the crew. The UI is a 1980s NYC subway-graffiti theme.

## Stack

- **Framework**: Next.js 15 (App Router) + React 19 + TypeScript
- **Auth**: NextAuth v4, Google OAuth, JWT sessions (invite-only — see below)
- **DB**: Neon Postgres (serverless, free tier)
- **ORM**: Drizzle ORM + drizzle-kit (migrations)
- **DB driver**: `@neondatabase/serverless` WebSocket `Pool` (supports transactions)
- **Feature flags**: LaunchDarkly (Vercel server SDK + Edge Config) — additive only
- **Styling**: Tailwind CSS + shadcn/ui (Radix primitives)
- **Hosting**: Vercel (free tier). Package manager: `pnpm`.

## Layout

```
app/
  page.tsx                 # Home: crew list, create/join/Black Book, onboarding gate
  api/                     # Route handlers (see API map below)
components/
  groups/                  # GroupDashboard, modals, RosterTab, CreditDashboard, etc.
  InvitePlayerModal.tsx    # "Black Book" — app-admin player + role management
  OnboardingScreen.tsx     # First-login username picker
lib/
  db/schema.ts             # Drizzle schema (source of truth for tables)
  db/index.ts              # Neon Pool + drizzle client
  queries/                 # All DB access (events, groups, users, waitlist, credits, ...)
  apiGuards.ts             # requireAuth / requireMember / requireGroupAdmin / requireCrewManager
  auth.ts                  # NextAuth config (invite-only signIn callback)
  session.ts               # getSessionUser() — id/email/globalRole from JWT
  launchdarkly.ts          # isAppAdmin() + server flag eval (fail-closed)
  roles.ts                 # Role labels + capability helpers (client + server)
  datetime.ts / eventTiming.ts / eventRules.ts  # timezone + signup-window logic
scripts/
  seedPlayers.ts           # Seed/allowlist players (idempotent, onConflictDoNothing)
  setRole.ts               # Set a user's global role (owner|admin|user)
```

## Data model (`lib/db/schema.ts`)

| Table | Purpose | Key columns / notes |
|---|---|---|
| `users` | App users / invite allowlist | `email` unique, `display_name`, `global_role` (`owner`/`admin`/`user`), `onboarded` |
| `groups` | Crews | `invite_code` unique, `timezone` (IANA), `default_event_spots`, `default_slot_cost`, `round_robin_slide` |
| `group_members` | Crew membership | `group_role` (`admin`=Capo / `coleader`=King / `member`), `status`; unique `(group,user)` |
| `events` | Games | `starts_at`/`ends_at` (timestamptz), `total_spots`, `slot_cost`, `assignment_mode`, `signup_opens_at`, `round_robin_offset`, `status` |
| `event_attendees` | Spot holders | `user_id` (current), `original_user_id`, `status` (`confirmed`/`offered`); unique `(event,user)` |
| `event_waitlist` | "The Bench" | FIFO by `joined_at`; unique `(event,user)` |
| `round_robin_rosters` | Rotation order | `sort_key` (gapped doubles), `is_active` |
| `spot_transactions` | Append-only credit ledger | `from_user_id` (nullable), `to_user_id`, `amount`, `type` (audit only) |
| `payments` | Admin-recorded cash in | `user_id`, `amount`, `payment_date` |
| `player_credit_balances` | **View** | `balance = paid − spent(to_user) + earned(from_user)` per active member |

Notes for agents:
- **Times are absolute** (`timestamptz`). The crew's `timezone` is the source of
  truth for rendering/input conversions (`lib/datetime.ts`). Don't store wall-clock.
- **Credit math is symmetric & type-agnostic.** The ledger balance never filters on
  `type`; `type` is display/audit only. Claiming/being assigned a spot debits
  `to_user`; giving up a spot credits `from_user`. Initial admin/round-robin/waitlist
  assignments are all recorded the same way (`from_user` may be NULL).
- **Cascades:** deleting a `group` cascades `group_members`, `events`
  (→ `event_attendees`, `event_waitlist`), and `round_robin_rosters`.
  `spot_transactions` and `payments` have **no** cascade FK — `deleteGroup()`
  removes them first inside a transaction.

## Authorization

Two independent role axes:

- **App role** (`users.global_role`): `owner` > `admin` > `user`.
  Owner == admin functionally, but the owner cannot be demoted by others.
  App admins can create crews, use the Black Book (invites + role changes), and
  delete any crew (owner) — see `lib/roles.ts` `isAppAdminRole`.
- **Crew role** (`group_members.group_role`): `admin` (**Capo**) > `coleader`
  (**King**) > `member`. `isCapo` = full crew control; `isCrewManager` = Capo or
  King (manage games + add players).

API guards (`lib/apiGuards.ts`): `requireAuth`, `requireMember`,
`requireGroupAdmin` (Capo only), `requireCrewManager` (Capo or King).

**LaunchDarkly** (`lib/launchdarkly.ts`) is an *additive* override for app-admin
only via the `app-admins` flag (list of emails). The DB is authoritative and the
system **fails closed**: if LD/Edge Config is unreachable, only the DB role grants
access. Never make authorization depend on a flag being reachable.

## Auth flow (invite-only)

1. Google OAuth via NextAuth. The `signIn` callback allows login **only if a
   `users` row already exists** for that email (created by an admin invite or the
   seed). No auto-provisioning — unknown emails are denied (`?error=AccessDenied`).
2. JWT caches the DB `userId` and `globalRole` (avoids per-request lookups).
   After a role change, the token can be stale until re-login — for owner-gated
   destructive actions, re-read the role from the DB (see `DELETE /api/groups/[id]`).
3. First login with `onboarded=false` → `OnboardingScreen` forces the user to pick
   a unique username (`display_name`), then flips `onboarded=true`.

## Concurrency

Spot-mutating operations (claim, offer, release, reassign, batch/round-robin
assign, waitlist promotion) run inside **serializable transactions** with
`SELECT ... FOR UPDATE` on the event row (`lib/queries/_tx.ts`,
`lib/queries/events.ts`, `waitlist.ts`). This prevents oversell and double-claims.

## Assignment modes (`events.assignment_mode`)

- `admin_assign` — Capo/King assigns players (single or batch).
- `player_signup` — players self-claim once `signup_opens_at` passes.
- `round_robin` — sliding-window auto-assignment over the active rotation roster.
  For event _k_: `start = (startOffset + k*slide) mod N`, take `min(spots, N)`
  players cyclically. Configured + generated from the **Rotation** tab.

**Weekly schedules** (`lib/schedule.ts`): a fixed weekly schedule is a set of slots
(day-of-week + start/end time), each optionally split into fixed-length **blocks**
(e.g. Mon 18:00–20:00 + Wed 17:00–19:00 with 60-min blocks → 4 one-hour games/week).
`expandWeeklySchedule()` turns slots + block length + a date range into concrete
event blocks sorted chronologically. The shared `WeeklyScheduleBuilder` component
drives both the recurring creator (`POST /events/bulk` accepts an explicit `events`
block array) and the Rotation tab (`POST /events/round-robin`, which slides players
across all blocks in order).

## API map

```
POST   /api/setup                                   # one-time bootstrap
GET    /api/user/profile                            # current user + memberships
POST   /api/user/onboard                            # set username (first login)

GET    /api/groups                                  # my crews (+ member/event counts)
POST   /api/groups                                  # create crew (app-admin)
GET    /api/groups/public                           # public crews
POST   /api/groups/join                             # join by invite code
GET    /api/groups/[id]                             # crew detail
PATCH  /api/groups/[id]                             # update settings (Capo)
DELETE /api/groups/[id]                             # hard delete (Owner any / Capo own)

GET    /api/groups/[id]/members                     # list members
POST   /api/groups/[id]/members                     # add member (Capo/King)
PATCH  /api/groups/[id]/members                     # change crew role (Capo)
GET    /api/groups/[id]/members/available           # addable player profiles

GET    /api/groups/[id]/events                      # list games
POST   /api/groups/[id]/events                      # create game (Capo/King)
GET    /api/groups/[id]/events/[eventId]            # game detail
PATCH  /api/groups/[id]/events/[eventId]            # edit game (Capo/King)
DELETE /api/groups/[id]/events/[eventId]            # delete game (Capo/King)
POST   /api/groups/[id]/events/bulk                 # recurring series
POST   /api/groups/[id]/events/round-robin          # rotation series (+preview)
POST   /api/groups/[id]/events/batch-assign         # batch assign
POST   .../events/[eventId]/claim|offer|retract|release|reassign|waitlist

GET    /api/groups/[id]/roster                      # rotation roster
PUT    /api/groups/[id]/roster                      # set/reorder roster (Capo/King)

GET    /api/groups/[id]/credits                     # balances (view)
GET    /api/groups/[id]/credits/[userId]/transactions
POST   /api/groups/[id]/payments                    # record payment (Capo)
GET    /api/groups/[id]/export                      # CSV export

GET    /api/admin/invite  POST /api/admin/invite    # Black Book invites (app-admin)
PATCH  /api/admin/role                              # change app role (app-admin)
```

## Environment variables

```bash
DATABASE_URL=             # Neon POOLED connection string (required)
NEXTAUTH_SECRET=          # random secret
NEXTAUTH_URL=             # no trailing slash
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
SEED_ADMIN_EMAIL=         # email promoted to admin on seed/setup (optional)
# LaunchDarkly (optional; app-admin override + observability/session replay)
NEXT_PUBLIC_LAUNCHDARKLY_CLIENT_SIDE_ID=
EDGE_CONFIG=              # Vercel Edge Config connection (server-side LD eval)
```

## Common workflows

```bash
pnpm install
pnpm dev                       # local dev (reads .env.local)
pnpm db:generate               # generate migration from schema changes
pnpm db:push                   # push schema to DB (dev)
pnpm db:migrate                # apply migrations
pnpm tsx scripts/seedPlayers.ts        # seed/allowlist players (idempotent)
EMAIL=x@y.com ROLE=owner pnpm tsx scripts/setRole.ts
npx tsc --noEmit && pnpm build # verify before commit
```

## Conventions for agents

- All DB access goes through `lib/queries/*` — don't query Drizzle directly from
  route handlers or components.
- Use the `apiGuards` helpers for authz; don't re-implement role checks inline.
- Currency is always **€**. Display players by `display_name`, never raw email.
- Keep authorization fail-closed; LD is additive, never required.
- Match the app's voice — read [`VOCABULARY.md`](./VOCABULARY.md) before writing copy.
