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
- **Feature flags**: LaunchDarkly (Vercel server SDK + Edge Config server-side; React client SDK with session/user multi-context) — additive only
- **Image storage**: Vercel Blob (`@vercel/blob`) for crew banners and player "pieces" (avatars)
- **Styling**: Tailwind CSS + shadcn/ui (Radix primitives). Graffiti theme tokens
  in `app/globals.css` and `lib/design-tokens.ts`; texture assets in
  `public/textures/` (see `public/textures/README.md`).
- **Hosting**: Vercel (free tier). Package manager: `pnpm`. Local dev uses port
  **3000** (`pnpm dev`); set `NEXTAUTH_URL=http://localhost:3000` in `.env.local`.

## Layout & UI shell

```
app/
  page.tsx                 # Home: sign-in, crew list, create/join/Black Book, onboarding
  globals.css              # Theme tokens, concrete texture, marker-card / graffiti-dialog utilities
  api/                     # Route handlers (see API map below)
components/
  AppShell.tsx             # Concrete background + page content + Footer
  LogoBanner.tsx           # Full-width logo strip (authenticated views)
  SettingsMenu.tsx         # Fresh tags (in-app notifications) / Your Tag / Bounce
  NotificationsPanel.tsx # GraffitiDialog inbox — opened from SettingsMenu
  Footer.tsx               # Asphalt bar; Hoops Master + © year
  groups/
    CrewMuralHero.tsx      # Crew banner hero (or default wall placeholder)
    GroupDashboard.tsx     # Crew tabs, mural, games, settings (sticky back + settings row)
    GroupList.tsx          # Poster-frame crew cards
    EventListCard.tsx      # Game list cards — poster-frame for special/burner games, marker-card for regular
    ...                    # Modals, LineupEditor, CreditDashboard, BannerUploadField, etc.
  ui/GraffitiDialog.tsx    # Shared modal chrome for graffiti-styled dialogs
  Header.tsx               # Legacy header (superseded by LogoBanner + in-dashboard nav)
  PlayerAvatar.tsx         # Circular "piece" avatar with initials fallback
  ProfileSettingsModal.tsx # Edit handle/tag and upload your piece
  InvitePlayerModal.tsx    # "Black Book" — app-admin player + role management
  OnboardingScreen.tsx     # First-login username picker
  LaunchDarklyProvider.tsx # Client LD init (session context) + mounts LDIdentify
  LDIdentify.tsx           # Syncs LD context with auth (session-only → session+user)
lib/
  design-tokens.ts         # JS mirror of CSS palette (for non-Tailwind use)
  db/schema.ts             # Drizzle schema (source of truth for tables)
  db/index.ts              # Neon Pool + drizzle client
  queries/                 # All DB access (events, groups, users, waitlist, credits, notifications, ...)
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
| `users` | App users / invite allowlist | `email` unique, `display_name`, `piece_url` (optional avatar, Vercel Blob), `global_role` (`owner`/`admin`/`user`), `onboarded` |
| `groups` | Crews | `invite_code` unique, `timezone` (IANA), `default_event_spots`, `default_slot_cost`, `default_pricing_mode` (`per_spot`/`split_total`), `default_total_cost`, `round_robin_slide`, `banner_url`, `banner_orientation` |
| `group_members` | Crew membership | `group_role` (`admin`=Capo / `coleader`=King / `member`), `status`; unique `(group,user)` |
| `events` | Games | `starts_at`/`ends_at`, `total_spots`, `slot_cost` (per-spot mode), `pricing_mode`, `total_cost` (split-total mode), `pricing_finalized_at`, `finalized_per_share`, `remainder_policy`, `effective_total_cost`, plus `event_type`, `name`, `description`, `banner_*`, `assignment_mode`, `signup_opens_at`, `round_robin_offset`, `status` |
| `event_attendees` | Spot holders | `user_id` (current), `original_user_id`, `status` (`confirmed`/`offered`), `parent_attendee_id` (self-FK, null = primary spot, non-null = Rider/+1 spot); partial unique index `(event,user) WHERE parent_attendee_id IS NULL` — allows one primary + one Rider row per user per event |
| `event_waitlist` | "The Bench" | FIFO by `joined_at`; unique `(event,user)` |
| `round_robin_rosters` | Rotation order | `sort_key` (gapped doubles), `is_active` |
| `spot_transactions` | Append-only credit ledger | `from_user_id` (nullable), `to_user_id`, `amount`, `type` (audit only) |
| `payments` | Admin-recorded cash in | `user_id`, `amount`, `payment_date` |
| `notifications` | In-app inbox (per user) | `user_id`, `group_id`, `event_id`, `type` (`spot_offered_claimed`/`bench_promoted`), `title`, `body`, `read_at`; partial index on unread |
| `player_credit_balances` | **View** | `balance = paid − spent(to_user) + earned(from_user)` per active member |

Notes for agents:
- **Rider (+1) spots:** `parent_attendee_id` is non-null for +1 rows. A user may hold
  at most one primary + one +1 per event. Offering/releasing the primary is blocked
  while the +1 is confirmed — handle the +1 first. +1 rows show inline as *"Name's +1"*.
- **Unified bench:** One FIFO queue (`event_waitlist` ordered by `joinedAt`). Primary
  and +1 waiters share the same line and global `#N` position. When any spot opens
  (offer, release, or join triggering a match), **bench #1 always receives it** —
  the backend morphs the row shape (primary vs +1) invisibly. `offerSpot` auto-matches
  to bench #1 when the bench is non-empty; otherwise the spot stays on the marketplace
  until claimed (bench empty) or someone joins the bench. Direct claims bypass nobody:
  if the bench is non-empty and the claimer is not #1, the API returns 409. Logic lives
  in `lib/queries/benchMatching.ts` (`assignOpeningToBenchHead`, `transferOpeningToUser`).
  `EventDetailModal` re-fetches on window focus to keep button states fresh.
- **Self-reassign (non-admin):** Non-admin players can hand over their own spot via
  "Hand It Over" in `EventDetailModal`. The reassign route previously blocked any
  `attendeeId` param for non-admins; it now allows it and instead `reassignSpot`
  enforces ownership: if `!isAdmin && source.userId !== byUserId`, it throws 403.
- **Times are absolute** (`timestamptz`). The crew's `timezone` is the source of
  truth for rendering/input conversions (`lib/datetime.ts`). Don't store wall-clock.
- **Credit math is symmetric & type-agnostic.** The ledger balance never filters on
  `type`; `type` is display/audit only. Claiming/being assigned a spot debits
  `to_user`; giving up a spot credits `from_user`. Initial admin/round-robin/waitlist
  assignments are all recorded the same way (`from_user` may be NULL).
- **Pricing modes:** `per_spot` charges `slot_cost` on each spot mutation (existing).
  `split_total` defers all charges until the Capo/King **finalizes** the roster via
  `POST .../finalize-pricing`; each occupied attendee row (including +1 rows, debited
  to the primary holder's account) gets a `split_settle` row at `round(total_cost /
  occupancy, 1)`. Remainder handling: `ignore`, `admin_absorb_surplus`, or
  `adjust_total_deficit`. After finalize, spot mutations are blocked. Per-spot
  `slot_cost` edits on existing rosters append `price_adjustment` correction rows.
  Logic in `lib/queries/pricing.ts`.
- **Cascades:** deleting a `group` cascades `group_members`, `events`
  (→ `event_attendees`, `event_waitlist`), and `round_robin_rosters`.
  `spot_transactions` and `payments` have **no** cascade FK — `deleteGroup()`
  removes them first inside a transaction.
- **In-app notifications:** persisted rows in `notifications`, created inside spot
  mutations via `notifySpotChange()` in `lib/queries/notifications.ts`. Triggers:
  (1) someone claims your offered primary or Rider spot; (2) you (or your Rider
  slot) are promoted off the bench via `releaseSpot` / `releaseRiderSpot`.
  Recipient is always the primary account holder; copy differs by slot kind only.
  No email/push — badge + **Fresh tags** panel in `SettingsMenu` (`hooks/useNotifications.ts`:
  fetch on mount, window focus, 60s poll). Tapping a tag marks it read and deep-links
  to the game (`app/page.tsx` → `GroupDashboard` → `EventDetailModal`).

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

**LD client context** (`components/LaunchDarklyProvider.tsx` + `LDIdentify.tsx`):
pre-login the app evaluates a single `session` context (key = persisted session id,
plus `deviceType`/`browser`). On login, `LDIdentify` re-identifies to a `multi`
context adding a `user` kind (key = email, with `email`/`name`/`deviceType`/`browser`).
This is for targeting/analytics only — it does not grant authorization.

## Crew member management

The **Players tab** in `GroupDashboard.tsx` exposes all member admin actions:

| Action | Who | Notes |
|---|---|---|
| Put 'Em On (add) | Capo or King | User must exist (be signed in at least once); re-activates inactive rows |
| Make King / Demote | Capo only | Toggle between `coleader` and `member`; cannot target other Capos |
| Remove (Boot) | Capo only | Soft-delete (`status → inactive`); blocked if the player has ≥1 confirmed spot in any upcoming game — unassign them from those events first. Credit/payment history is retained. |

`removeGroupMember()` in `lib/queries/groups.ts` queries `event_attendees JOIN events` to find upcoming confirmed spots before setting `group_members.status = 'inactive'`. The check is intentionally conservative (any upcoming event, not just active-status events) to prevent orphaned credit rows.

## Balances tab (`CreditDashboard.tsx`)

The **Balances** crew tab shows collapsible ledger sections (all collapsed by default):

| Section | Who | Lazy-loaded on expand |
|---|---|---|
| Square Up | Capo/King | Payment form only (no prefetch) |
| Payments | Capo/King | `GET .../payments` |
| Spot Ledger | Capo/King | `GET .../transactions` (credit-moving rows only — excludes offer/retract audit entries) |
| Balances | All members | `GET .../credits` |

CSV export buttons (Balances / Transactions / Payments) remain in the admin card header. Recording a payment refreshes balances and the payments list when those sections have already been loaded.

## Auth flow (invite-only)

1. Google OAuth via NextAuth. The `signIn` callback allows login **only if a
   `users` row already exists** for that email (created by an admin invite or the
   seed). No auto-provisioning — unknown emails are denied (`?error=AccessDenied`).
   Denied users see a "Try a different account" button which signs out to
   `/?chooseAccount=1`; on the next page load, `signIn` is called with
   `prompt: "select_account"` so Google shows the account picker instead of
   silently reusing the previous session.
2. JWT caches the DB `userId` and `globalRole` (avoids per-request lookups).
   After a role change, the token can be stale until re-login — for owner-gated
   destructive actions, re-read the role from the DB (see `DELETE /api/groups/[id]`).
3. First login with `onboarded=false` → `OnboardingScreen` forces the user to pick
   a unique username (`display_name`), then flips `onboarded=true`.

## Concurrency

Spot-mutating operations (claim, offer, release, reassign, batch/round-robin
assign, waitlist promotion, Rider claim/drop) run inside **serializable
transactions** with `SELECT ... FOR UPDATE` on the event row
(`lib/queries/_tx.ts`, `lib/queries/events.ts`, `waitlist.ts`). This prevents
oversell and double-claims.

## Assignment modes (`events.assignment_mode`)

- `admin_assign` — Capo/King assigns players (single or batch).
- `player_signup` — players self-claim once `signup_opens_at` passes.
- `round_robin` — sliding-window auto-assignment over the active rotation roster.
  For event _k_: `start = (startOffset + k*slide) mod N`, take `min(spots, N)`
  players cyclically. Chosen as the assignment mode in the **Recurring** tab of the
  create-game flow, which embeds the `LineupEditor` (order players + toggle who's
  active) — the saved roster the slide runs over. There is no separate rotation tab.

**Weekly schedules** (`lib/schedule.ts`): a fixed weekly schedule is a set of slots
(day-of-week + start/end time), each optionally split into fixed-length **blocks**
(e.g. Mon 18:00–20:00 + Wed 17:00–19:00 with 60-min blocks → 4 one-hour games/week).
`expandWeeklySchedule()` turns slots + block length + a date range into concrete
event blocks sorted chronologically. The shared `WeeklyScheduleBuilder` component
drives the recurring creator: with `player_signup`/`admin_assign` it posts the block
array to `POST /events/bulk`; with `round_robin` it posts the same blocks to
`POST /events/round-robin` (with a fairness preview gate before committing), which
slides players across all blocks in order.

## API map

```
POST   /api/setup                                   # one-time bootstrap
GET    /api/user/profile                            # current user (incl. piece_url) + memberships
PATCH  /api/user/profile                            # update handle/tag (display_name) and/or piece (pieceUrl)
POST   /api/user/piece                              # upload your piece (avatar) to Blob (any signed-in user)
POST   /api/user/onboard                            # set username (first login)
GET    /api/user/notifications                      # inbox list + unreadCount
PATCH  /api/user/notifications/[id]                 # mark one read
POST   /api/user/notifications/read-all             # mark all read

GET    /api/groups                                  # my crews (+ member/event counts)
POST   /api/groups                                  # create crew (app-admin; accepts bannerUrl + bannerOrientation)
POST   /api/groups/banner                           # upload crew banner to Blob (app-admin create / Capo+King edit)
GET    /api/groups/public                           # public crews
POST   /api/groups/join                             # join by invite code
GET    /api/groups/[id]                             # crew detail
PATCH  /api/groups/[id]                             # update settings incl. banner + orientation (Capo/King)
DELETE /api/groups/[id]                             # hard delete (Owner any / Capo own)

GET    /api/groups/[id]/members                     # list members
POST   /api/groups/[id]/members                     # add member (Capo/King)
PATCH  /api/groups/[id]/members                     # change crew role (Capo)
DELETE /api/groups/[id]/members                     # remove member (Capo; blocked if upcoming confirmed spots)
GET    /api/groups/[id]/members/available           # addable player profiles

GET    /api/groups/[id]/events                      # list games
POST   /api/groups/[id]/events                      # create game (Capo/King); accepts eventType, description, bannerUrl, bannerOrientation
POST   /api/groups/[id]/events/banner               # upload event banner to Blob (Capo/King)
GET    /api/groups/[id]/events/[eventId]            # game detail
PATCH  /api/groups/[id]/events/[eventId]            # edit game (Capo/King)
DELETE /api/groups/[id]/events/[eventId]            # delete game (Capo/King)
POST   /api/groups/[id]/events/bulk                 # recurring series
POST   /api/groups/[id]/events/round-robin          # rotation series (+preview)
POST   /api/groups/[id]/events/batch-assign         # batch assign
POST   .../events/[eventId]/claim|offer|retract|release|reassign|unassign|waitlist
POST   .../events/[eventId]/claim-rider     # bring a +1 (Rider) into the game
POST   .../events/[eventId]/drop-rider      # remove your Rider spot (refund)

GET    /api/groups/[id]/roster                      # rotation roster
PUT    /api/groups/[id]/roster                      # set/reorder roster (Capo/King)

GET    /api/groups/[id]/credits                     # balances (view)
GET    /api/groups/[id]/credits/[userId]/transactions
GET    /api/groups/[id]/transactions                # group spot ledger JSON (Capo/King)
POST   /api/groups/[id]/payments                    # record payment (Capo/King); GET lists payments (members)
GET    /api/groups/[id]/export                      # CSV export (balances / transactions / payments)

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
SEED_ADMIN_EMAILS=        # comma-separated emails promoted to admin on seed (optional)
BLOB_READ_WRITE_TOKEN=    # Vercel Blob store token (crew banners + player pieces); auto-set when the Blob store is linked to the project
# LaunchDarkly (optional; app-admin override + observability/session replay)
NEXT_PUBLIC_LAUNCHDARKLY_CLIENT_SIDE_ID=
EDGE_CONFIG=              # Vercel Edge Config connection (server-side LD eval)
```

## Common workflows

```bash
pnpm install
pnpm dev                       # local dev on port 3000 (reads .env.local)
pnpm db:generate               # generate migration from schema changes
pnpm db:push                   # push schema to DB (dev)
pnpm db:migrate                # apply migrations (see Database migrations below)
pnpm tsx scripts/seedPlayers.ts        # seed/allowlist players (idempotent)
EMAIL=x@y.com ROLE=owner pnpm tsx scripts/setRole.ts
npx tsc --noEmit && pnpm build # verify before commit
```

## Database migrations

Drizzle tracks schema in `lib/db/schema.ts` and versioned SQL under
`lib/db/migrations/`. The migration **journal** (`lib/db/migrations/meta/_journal.json`)
is the list of migrations `drizzle-kit migrate` actually runs — a `.sql` file on disk
that is not in the journal is **skipped silently**.

### Workflow (required for shipped schema changes)

1. Edit `lib/db/schema.ts`.
2. `pnpm db:generate` — produces `NNNN_*.sql` plus journal + snapshot updates. **Do not**
   hand-write SQL without this step (or equivalent manual journal/snapshot edits).
3. Review the generated migration.
4. Load `DATABASE_URL` and apply (see below).
5. Verify columns/tables exist before assuming the app will work.

### `DATABASE_URL` and drizzle-kit

`drizzle.config.ts` reads `process.env.DATABASE_URL` only; it does **not** load
`.env.local`. Next.js dev (`pnpm dev`) loads `.env.local` automatically — migration
commands do not.

```bash
export $(grep -E '^DATABASE_URL=' .env.local | xargs)
pnpm db:migrate
```

Use the Neon **pooled** connection string (same as in `.env.local`).

### `db:push` vs `db:migrate`

| Command | Use when |
|---|---|
| `pnpm db:push` | One-off local sync; no migration file. Interactive prompt. |
| `pnpm db:migrate` | Shared DBs and production; applies journal-tracked migrations. **Default for features.** |

Feature work that adds/changes columns: **generate + migrate**, commit the SQL and
`meta/` changes together with the code that depends on them.

### Success and failure signals

`drizzle-kit migrate` prints config and a Neon websocket driver warning first — that
warning is expected. A successful run ends with:

```text
[✓] migrations applied successfully!
```

If migrate “succeeds” but the app 500s with `column "…" does not exist`, the migration
was likely never registered or never applied. Check the journal and query
`information_schema.columns` (or the affected API) before debugging application code.

### Verify after migrate

```bash
export $(grep -E '^DATABASE_URL=' .env.local | xargs)
node -e "
const { neon } = require('@neondatabase/serverless');
const sql = neon(process.env.DATABASE_URL);
sql\`SELECT column_name FROM information_schema.columns
    WHERE table_name = 'your_table' AND column_name = 'your_column'\`
  .then(r => console.log(r.length ? 'OK — column exists' : 'MISSING — migration not applied'));
"
```

### Emergency manual apply

If SQL was applied directly to Neon (bypassing drizzle-kit), also add the migration tag
to `meta/_journal.json` and insert into `drizzle.__drizzle_migrations` so future
`db:migrate` runs do not double-apply. Prefer regenerating from a clean schema diff
when possible.

## Conventions for agents

- **Schema changes:** follow **Database migrations** above (`db:generate` → `db:migrate`,
  load `DATABASE_URL`, verify columns). Never ship code that references new columns
  without a registered, applied migration.
- All DB access goes through `lib/queries/*` — don't query Drizzle directly from
  route handlers or components.
- Use the `apiGuards` helpers for authz; don't re-implement role checks inline.
- Currency is always **€**. Display players by `display_name`, never raw email.
- Keep authorization fail-closed; LD is additive, never required.
- Match the app's voice — read [`VOCABULARY.md`](./VOCABULARY.md) before writing copy.
- **Theme colors**: Tailwind classes (`text-asphalt`, `bg-terracotta`, etc.) use
  `*-rgb` channel variables so opacity modifiers (`/70`, `/80`) work. Raw hex vars
  (`var(--asphalt-black)`) remain in CSS utilities; prefer Tailwind tokens in JSX.
