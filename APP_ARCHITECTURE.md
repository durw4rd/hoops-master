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
  UpdateBanner.tsx         # "Reload to update" banner (polls /api/version, compares build id)
lib/
  design-tokens.ts         # JS mirror of CSS palette (for non-Tailwind use)
  db/schema.ts             # Drizzle schema (source of truth for tables)
  db/index.ts              # Neon Pool + drizzle client
  queries/                 # All DB access (events, groups, users, waitlist, credits, notifications, ...)
    spotOpening.ts         # ★ Unified opening handler — ALL freed spots resolve here
    benchMatching.ts       # Seatable-head picking + transferOpeningToUser
    benchPromotion.ts      # <24h pending-approval flow (create/approve/decline/cascade)
    transactions.ts        # recordTransaction + getNetChargedByUser (refund basis)
    emailOutbox.ts         # Transactional email outbox (enqueue in-tx, drain post-commit)
    eventReminders.ts      # 48h reminder emails (cron-driven, idempotent claim)
  email/send.ts            # Resend wrapper (no-op without RESEND_API_KEY)
  email/templates.ts       # Plain-HTML email templates
  apiGuards.ts             # requireAuth / requireMember / requireGroupAdmin / requireCrewManager
  auth.ts                  # NextAuth config (invite-only signIn callback)
  session.ts               # getSessionUser() — id/email/globalRole from JWT
  launchdarkly.ts          # isAppAdmin() + server flag eval (fail-closed)
  roles.ts                 # Role labels + capability helpers (client + server)
  appVersion.ts / version.ts  # APP_VERSION (from package.json) + semver compare
  datetime.ts / eventTiming.ts / eventRules.ts  # timezone + signup/24h/48h-window logic
test/                      # Vitest suite on embedded Postgres (see Automated tests)
scripts/
  seedPlayers.ts           # Seed/allowlist players (idempotent, onConflictDoNothing)
  setRole.ts               # Set a user's global role (owner|admin|user)
  audit-unassign-credits.ts # Read-only credit/ledger consistency audit (prod)
```

## Data model (`lib/db/schema.ts`)

| Table | Purpose | Key columns / notes |
|---|---|---|
| `users` | App users / invite allowlist | `email` unique, `display_name`, `piece_url` (optional avatar, Vercel Blob), `global_role` (`owner`/`admin`/`user`), `onboarded` |
| `groups` | Crews | `invite_code` unique, `timezone` (IANA), `default_event_spots`, `default_slot_cost`, `default_pricing_mode` (`per_spot`/`split_total`), `default_total_cost`, `round_robin_slide`, `banner_url`, `banner_orientation` |
| `group_members` | Crew membership | `group_role` (`admin`=Capo / `coleader`=King / `member`), `status`; unique `(group,user)` |
| `events` | Games | `starts_at`/`ends_at`, `total_spots`, `slot_cost` (per-spot mode), `pricing_mode`, `total_cost` (split-total mode), `pricing_finalized_at`, `finalized_per_share`, `remainder_policy`, `effective_total_cost`, `reminder_sent_at` (48h email claim marker), plus `event_type`, `name`, `description`, `banner_*`, `assignment_mode`, `signup_opens_at`, `round_robin_offset`, `status` |
| `event_attendees` | Spot holders | `user_id` (current holder, **nullable** — NULL + `status='open'` = held-open placeholder while a bench promotion approval is pending), `original_user_id`, `status` (`confirmed`/`offered`/`open`), `parent_attendee_id` (self-FK, null = primary spot, non-null = Rider/+1 spot), `guest_display_name` (non-null = guest spot, no `users` row), `no_show_at`/`no_show_by` (post-tip-off no-show marker, record-keeping only); partial unique index `(event,user) WHERE parent_attendee_id IS NULL` — allows one primary + one Rider row per user per event |
| `event_waitlist` | "The Bench" | FIFO by `joined_at`; unique `(event,user,for_rider)` |
| `bench_promotion_requests` | Pending bench handoff | Any opening arising within 24h of `starts_at` requires the target's approval; unique pending row per `attendee_id` |
| `round_robin_rosters` | Rotation order | `sort_key` (gapped doubles), `is_active` |
| `spot_transactions` | **Append-only** credit ledger | `from_user_id` (nullable), `to_user_id`, `amount`, `type` (audit only), `attendee_id` (FK `ON DELETE SET NULL` — ledger rows outlive attendee rows). **Never deleted** — reversals are compensating entries |
| `payments` | Admin-recorded cash in | `user_id`, `amount`, `payment_date` |
| `notifications` | In-app inbox (per user) | `user_id`, `group_id`, `event_id`, `type` (`spot_offered_claimed` / `bench_promoted` / `bench_promotion_pending`), `title`, `body`, `read_at`; partial index on unread |
| `email_outbox` | Transactional email queue | Enqueued inside spot-mutation transactions, drained after commit; `email_type` (`bench_promotion` / `bench_promotion_pending`), `sent_at` |
| `users` (email prefs) | Opt-outs | `email_game_reminders`, `email_bench_promotions` — both default `true`, checked at send time |
| `player_credit_balances` | **View** | `balance = paid − spent(to_user) + earned(from_user)` per active member |

## Spot lifecycle & credit invariants (READ BEFORE TOUCHING SPOT/CREDIT CODE)

These are the load-bearing rules of the domain. The automated test suite
(`test/*.test.ts`) enforces them — any change to `lib/queries/*` must keep
`pnpm test` green. Do not add per-action special cases; extend the unified
handler instead.

1. **Every freed spot is an "opening"** and MUST go through
   `handleSpotOpening()` in `lib/queries/spotOpening.ts`. That is the ONLY
   place that decides what happens to a vacated spot. An opening carries a
   funding mode which alone determines the ledger entry when it is filled:
   - `holder_funded` — the previous holder keeps paying until someone takes
     over (release/offer semantics); fill = zero-sum transfer
     (`from = old holder, to = new holder`).
   - `vacant` — the previous holder was already refunded (admin unassign) or
     never existed (capacity increase); fill = fresh debit (`from = NULL`).
2. **Bench invariant:** a spot is never open/offered/unfilled while a seatable
   player waits on the bench. Resolution order (identical for player- and
   admin-initiated actions): seatable bench head gets the spot instantly when
   >24h before start; within 24h a `bench_promotion_requests` row is created
   and the target must approve. Bench exhausted → holder-funded spots become
   `offered` (free-for-all claimable); vacant openings dissolve into plain
   capacity. Capacity increases run `reconcileCapacityWithBench()`.
   **Bench matching is skipped for past events** (`assignOpeningToBenchHeadOrPending`
   returns matched:false first thing): an opening on a played game dissolves
   into capacity slack (vacant) or sits `offered` (holder-funded) — never a
   promotion or pending request. Note `isWithin24HoursOfEvent` is TRUE for past
   dates, so this early-return must stay first.
3. **24h approval flow:** decline removes the decliner from the bench and
   cascades to the next seatable player; when the bench runs dry the spot is
   marked open. While a `vacant` opening waits on approval it is held as a
   placeholder attendee row (`user_id NULL`, `status 'open'`) so capacity
   can't be stolen. A pending target leaving the bench (self or admin removal)
   cancels + re-matches the opening (`cancelPendingTargetsForUser`).
4. **Whoever lands a spot leaves the bench** — every fill path
   (`fillSpot(s)`, `claimSpot`, `claimRiderSpot`, `reassignSpot`, transfers)
   calls `removeUserFromBench` for the recipient.
5. **The ledger is append-only.** No code path deletes `spot_transactions`
   rows. Reversals are explicit compensating entries: `unassign_refund`
   (admin removal — refund computed from the player's *actual net* for the
   event via `getNetChargedByUser`, which absorbs price adjustments),
   `event_cancelled_refund` (event cancellation zeroes every player's net),
   `split_unsettle` (split-pricing undo). Events with ledger history cannot
   be hard-deleted — the DELETE route cancels them instead (`cancelEvent`).
6. **Credit rules are identical for admin- and player-initiated actions.**
   +1 (Rider) spots debit/credit the bringing player. The single exception:
   **guest assignment is credit-neutral** (`guest_assign`, amount 0 — the
   holder keeps funding and settles outside the app).
7. **Invariant checks:** for every event, a player currently holding N spots
   must have net charged = N × `getSpotChargeAmount(event)`; everyone else
   nets 0 (see `test/invariants.ts`). If your change breaks this, the change
   is wrong — not the invariant.
8. **Actor-aware blocking:** `spotMutationBlockedMessage(event, { actorIsManager })`
   (`lib/eventRules.ts`) skips the past-event check for Capo/King so they can
   fix rosters retroactively; cancelled + finalized-pricing stay locked for
   everyone. Routes accepting the manager bypass: reassign, unassign,
   assign-guest, retract, batch-assign, and claim-rider's admin-assign path
   only (an admin SELF-claiming on a past game is still blocked). Player
   self-service routes (offer, release, claim, waitlist, drop-rider) stay
   player-strict — the marketplace/bench is meaningless on played games.
9. **On-behalf offer/retract:** `offerSpot`/`retractOffer` accept `isAdmin`;
   the HOLDER (not the caller) is always the funding party, the excluded bench
   user, and the from/to on audit rows.
10. **No-show is record-keeping only** (`setAttendeeNoShow`): Capo/King, only
    after tip-off, confirmed non-placeholder rows; sets
    `event_attendees.no_show_at/no_show_by` and **never writes ledger rows** —
    the player stays charged for the spot they burned.

Notes for agents:
- **Rider (+1) spots:** `parent_attendee_id` is non-null for +1 rows. A user may hold
  at most one primary + one +1 per event. Offering/releasing the primary is blocked
  while the +1 is confirmed — handle the +1 first. +1 rows show inline as *"Name's +1"*.
  A user can hold a primary bench entry AND a rider bench entry independently
  (`for_rider` distinguishes them — API + UI must always pass it through).
- **Unified bench:** One FIFO queue (`event_waitlist` ordered by `joinedAt`). Primary
  and +1 waiters share the same line and global `#N` position. When any spot opens,
  the first **seatable** bench entry receives it (`getSeatableBenchHead` skips players
  already targeted by a pending request or already holding primary + rider) — the
  backend morphs the row shape (primary vs +1) invisibly via `transferOpeningToUser`.
  All opening resolution goes through `handleSpotOpening` (`lib/queries/spotOpening.ts`)
  — see the invariants section above. Direct claims bypass nobody: if a seatable bench
  head exists and the claimer is not it, the API returns 409.
  `EventDetailModal` re-fetches on window focus to keep button states fresh.
- **Bench promotion <24h:** any opening inside 24h of `starts_at` creates a
  `bench_promotion_requests` row instead of an instant transfer
  (`assignOpeningToBenchHeadOrPending` in `lib/queries/benchPromotion.ts`).
  Holder-funded openings stay `confirmed` with the releaser until approval; vacant
  openings (admin unassign, capacity increase) become `user_id NULL / status 'open'`
  placeholders. Decline cascades to the next seatable player; an exhausted bench
  marks the spot open (offered) or dissolves the placeholder. Capo/King can remove
  bench rows via `DELETE .../waitlist` (`removeFromBench`) — removing a pending
  target cancels + re-matches the opening.
- **Guest spots:** When LD flag `guest-spots` is on (client + server), Capo/King
  assign via `POST .../assign-guest` with a display name; `guest_display_name` is set,
  `user_id` points at the assignee for ledger purposes, and `guest_assign` ledger
  rows are recorded like other spot charges.
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
  Switching `per_spot` → `split_total` on an unfinalized event credits current
  attendees via `applySlotCostAdjustment(slot_cost, 0)` before `slot_cost` is zeroed,
  so finalize does not double-charge. Un-finalizing writes per-user `split_unsettle`
  compensating entries (append-only — nothing is deleted). Logic in `lib/queries/pricing.ts`.
- **Deleting vs cancelling events:** `deleteEvent` is only allowed while an event has
  zero ledger rows. Otherwise the DELETE route calls `cancelEvent`, which writes
  `event_cancelled_refund` entries zeroing every player's net, cancels pending
  promotions, and sets `status='cancelled'` (which blocks further spot mutations
  via `eventRules.ts`).
- **Cascades:** deleting a `group` cascades `group_members`, `events`
  (→ `event_attendees`, `event_waitlist`), and `round_robin_rosters`.
  `spot_transactions` and `payments` have **no** cascade FK — `deleteGroup()`
  removes them first inside a transaction (the only sanctioned ledger deletion,
  since the whole crew's books go with it).
- **In-app notifications:** persisted rows in `notifications`, created inside spot
  mutations via `notifySpotChange()` in `lib/queries/notifications.ts`. Triggers:
  (1) someone claims your offered primary or Rider spot; (2) you (or your Rider
  slot) are promoted off the bench; (3) a last-minute spot is pending your approval.
  Recipient is always the primary account holder; copy differs by slot kind only.
  Badge + **Fresh tags** panel in `SettingsMenu` (`hooks/useNotifications.ts`:
  fetch on mount, window focus, 60s poll). Tapping a tag marks it read and deep-links
  to the game (`app/page.tsx` → `GroupDashboard` → `EventDetailModal`).

## Email notifications (Resend + Vercel Cron)

- **Kill-switch**: all dispatch is gated behind the LD **boolean flag
  `email-notifications`** (`isEmailNotificationsEnabled()` in `lib/email/send.ts`,
  evaluated server-side, fail-closed — no LD/Edge Config → emails off). Enqueueing
  is NOT gated, so flipping the flag needs no deploy; while off, outbox rows stay
  unclaimed and reminder events stay unclaimed. When the flag turns on, queued
  rows for already-started games are claimed but skipped (no stale backlog blast).
- **Sending** (`lib/email/send.ts`): Resend wrapper; graceful no-op with a log line
  when `RESEND_API_KEY`/`EMAIL_FROM` are unset. Never throws — email failure must
  never break a spot mutation or cron run. Templates in `lib/email/templates.ts`.
- **Bench promotion emails** (`bench_promotion`, `bench_promotion_pending`) use a
  **transactional outbox** (`email_outbox` table, `lib/queries/emailOutbox.ts`):
  rows are enqueued INSIDE the serializable spot-mutation transaction (in
  `transferOpeningToUser` / `createPendingForHead`), so retried/rolled-back
  transactions never produce stray emails. `withEventLock` (`lib/queries/_tx.ts`)
  schedules `drainEmailOutbox()` after commit via `next/server` `after()`; the cron
  sweeps leftovers. Drain claims rows with `FOR UPDATE SKIP LOCKED` and marks them
  sent BEFORE dispatch (at-most-once — a lost email beats a duplicate).
  **Do not send emails inline inside transactions.** New email types go through
  the outbox, not direct sends.
- **48h game reminders** (`lib/queries/eventReminders.ts`): Vercel Cron hits
  `GET /api/cron/event-reminders` once daily at 07:00 UTC (`vercel.json` —
  the Hobby plan rejects deployments with sub-daily cron schedules; players
  effectively get their reminder 1–2 days before tip-off). Guarded by
  `Authorization: Bearer $CRON_SECRET`. Idempotent: due events are claimed
  atomically (`reminder_sent_at` set in the same UPDATE that selects them), so
  the schedule can be tightened (Pro plan or an external scheduler hitting the
  same URL with the Bearer secret) without any code change.
  Recipients: distinct non-removed spot holders with `email_game_reminders=true`.
- **Preferences**: `users.email_game_reminders` / `users.email_bench_promotions`
  (default true; both `bench_promotion` types share the latter). Edited via the
  "Mail Drops" toggles in `ProfileSettingsModal` → `PATCH /api/user/profile`.
  Preferences are checked at **send time**, not enqueue time.

## App version & upgrade banner

`lib/appVersion.ts` exports two identifiers:
- `APP_VERSION` — human semver from `package.json`. Shown as `v{X.Y.Z}` in the
  footer, sent as LD application metadata + the `appVersion` context attribute
  (telemetry/targeting only), and bumped **only at releases** (see below).
- `APP_BUILD_ID` — the Vercel git commit SHA (`dev` locally), stamped at build
  by `next.config.mjs` (`NEXT_PUBLIC_APP_BUILD_ID` ← `VERCEL_GIT_COMMIT_SHA`).
  Changes **every deploy**, even when semver doesn't.

**Upgrade banner (fully automatic, no LaunchDarkly).** `GET /api/version` returns
`{ version, buildId }` for the live deployment (force-dynamic, no-store).
`components/UpdateBanner.tsx` polls it (mount, window focus, every 5 min) and
compares `buildId` to its own baked-in `APP_BUILD_ID`; a mismatch means the tab
is running an older bundle, so it shows the dismissible "reload to update"
banner. No per-deploy action, no flag — any new deploy auto-invalidates old
tabs. Locally both ids are `dev`, so the banner never shows.

**Release process.** Bump the semver with `pnpm version {patch|minor|major}`
(edits `package.json` + creates a `vX.Y.Z` git commit and tag), then
`git push --follow-tags`. The footer version updates; the upgrade banner fires
on its own from the new commit SHA regardless.

## Automated tests (`test/`)

`pnpm test` (Vitest) boots a **real embedded Postgres** (`embedded-postgres` dev
dependency — no Docker required), applies the drizzle migrations, and swaps
`@/lib/db` to a `node-postgres` handle via `vi.mock` in `test/setup.ts`. The whole
query layer — including `withEventLock` serializable transactions and the
`player_credit_balances` view — runs unmodified. Scenarios live in
`test/spotLifecycle.test.ts`, `test/ledger.test.ts`, `test/benchPromotion.test.ts`,
`test/emailOutbox.test.ts`; shared checks in `test/invariants.ts`
(`assertLedgerInvariant`, `assertBenchInvariant`) run at the end of every scenario.
Factories (`test/factories.ts`) build a fresh crew/event/users per test; the
`startsInHours` option flips the 24h pending-approval branch. Tests run serially.
**Any change to spot/credit behavior needs a scenario here, and `pnpm test` must
stay green.**

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

**LaunchDarkly** (`lib/launchdarkly.ts`): client SDK for UI; server evaluation via
`@launchdarkly/vercel-server-sdk` + **`EDGE_CONFIG`** (synced by the
[Vercel ↔ LaunchDarkly integration](docs/launchdarkly-vercel-setup.md)). LD is
**additive and fail-closed** — it never grants authorization the DB doesn't, and
without `EDGE_CONFIG` (or on any eval error) every server flag returns its
default. See the flag inventory below.

**LD client context** (`components/LaunchDarklyProvider.tsx` + `LDIdentify.tsx`):
pre-login the app evaluates a single `session` context (key = persisted session id,
plus `deviceType`/`browser`/`appVersion`). On login, `LDIdentify` re-identifies to a
`multi` context adding a `user` kind (key = email, with `email`/`name`/`deviceType`/
`browser`/`appVersion`). This is for targeting/analytics only — it does not grant
authorization.

## Feature flags

All flags are consumed additively. **Server-side** flags are evaluated with
`evalServerFlag(key, email, default)` (`lib/launchdarkly.ts`) using a
`{ kind: 'user', key: email, email, appVersion }` context — so they are
**per-user targetable** (rules on email/segment/percentage all work) — except
`email-notifications`, which is a backend kill-switch evaluated with the fixed
synthetic key `hoops-master-backend` (per-user rules do NOT apply to it; use the
default/fallthrough). **Client-side** flags come from `useFlags()` (camelCased
key) on the same email-keyed `user` context. All server flags are fail-closed:
missing/unreachable LD → the default column below.

| Flag key | Type | Side | Default (fail) | Targetable per user | Purpose |
|---|---|---|---|---|---|
| `app-admins` | string[] | server | `[]` | n/a (email list) | Email allowlist that grants app-admin (create crews, Black Book) on top of DB `global_role`. `isAppAdmin()`. |
| `guest-spots` | bool | server + client | `false` (off) | yes | Enables assigning a spot to an outside-crew guest (credit-neutral). Server gate in `assign-guest`; client shows the "Guest (outside crew)" option. |
| `player-spot-reassignment` | bool | server + client | `false` (off) | yes | Enables **player** self-service handover: the "Hand over spot/2nd spot" UI + the non-admin paths of `reassign` and `assign-guest`. Admin SWAP/ASSIGN is never gated by this. |
| `email-notifications` | bool | server | `false` (off) | **no** (kill-switch) | Master on/off for ALL outgoing email; checked at dispatch time (`isEmailNotificationsEnabled()`). Outbox keeps enqueueing while off. |

The upgrade banner is **not** flag-controlled — it compares build ids against
`/api/version` (see below).

## Crew member management

The **Players tab** in `GroupDashboard.tsx` exposes all member admin actions:

| Action | Who | Notes |
|---|---|---|
| Put 'Em On (add) | Capo or King | User must exist (be signed in at least once); re-activates inactive rows |
| Make King / Demote | Capo only | Toggle between `coleader` and `member`; cannot target other Capos |
| Remove (Boot) | Capo or King | King: `member` only; Capo: `member` or `coleader`; never Capo/self. Soft-delete (`status → inactive`); blocked if the player has ≥1 confirmed spot in any upcoming game — unassign them from those events first. Credit/payment history is retained. |
| Leave crew (Cut Loose) | Player or King (not Capo) | Self-only; same upcoming-spots guard as boot. Credit/payment history is retained. |

`removeGroupMember()` in `lib/queries/groups.ts` queries `event_attendees JOIN events` to find upcoming confirmed spots before setting `group_members.status = 'inactive'`. The check is intentionally conservative (any upcoming event, not just active-status events) to prevent orphaned credit rows.

## Black Book (app-admin player management)

`InvitePlayerModal.tsx` — **The Black Book** on the home screen (app-admin / LD `app-admins` only):

| Action | Who | Notes |
|---|---|---|
| Put On (invite) | App admin | Creates allowlist row; re-activates previously buffed emails |
| Promote / Demote | App admin | Toggle `admin` ↔ `user`; Owner and self protected |
| Edit email | App admin | Inline pencil on user row |
| Buff 'Em (remove) | App admin | Soft-delete (`users.removed_at`); deactivates all crew memberships; warns on upcoming confirmed spots + non-zero balances (warn-only, admin can proceed). Ledger/event history retained. Owner and self protected. |

Removed users cannot sign in (`lib/auth.ts`). `listUsers()` excludes buffed rows (Black Book + The Yard).

## Balances tab (`CreditDashboard.tsx`)

The **Balances** crew tab: **Balances** (all members) loads on mount and stays visible.
Capo/King sections (Square Up, Payments, Spot Ledger) remain collapsible and lazy-load on expand:

| Section | Who | Lazy-loaded on expand |
|---|---|---|
| Square Up | Capo/King | Payment form only (no prefetch) |
| Payments | Capo/King | `GET .../payments` |
| Spot Ledger | Capo/King | `GET .../transactions` (credit-moving rows only — excludes offer/retract audit entries). Client-side filters: by game and by player, with row count + clear |
| Balances | All members | `GET .../credits` (loaded on tab mount) |

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
DELETE /api/groups/[id]/members                     # boot member (Capo/King) or leave crew (self; blocked if upcoming confirmed spots)
GET    /api/groups/[id]/members/available           # addable player profiles

GET    /api/groups/[id]/events                      # list games
POST   /api/groups/[id]/events                      # create game (Capo/King); accepts eventType, description, bannerUrl, bannerOrientation
POST   /api/groups/[id]/events/banner               # upload event banner to Blob (Capo/King)
GET    /api/groups/[id]/events/[eventId]            # game detail
PATCH  /api/groups/[id]/events/[eventId]            # edit game (Capo/King)
DELETE /api/groups/[id]/events/[eventId]            # delete game (no ledger) or cancel + refund (Capo/King)
POST   /api/groups/[id]/events/bulk                 # recurring series
POST   /api/groups/[id]/events/round-robin          # rotation series (+preview)
POST   /api/groups/[id]/events/batch-assign         # batch assign
POST   .../events/[eventId]/claim|offer|retract|release|reassign|unassign|waitlist
                                                    # offer/retract: Capo/King may act on a player's behalf via attendeeId
                                                    # reassign (non-admin) + assign-guest (non-admin): LD player-spot-reassignment
DELETE .../events/[eventId]/waitlist              # leave bench (self) or remove player (Capo/King)
POST   .../events/[eventId]/no-show                 # mark/unmark no-show (Capo/King; after tip-off; no credit effect)
POST   .../events/[eventId]/assign-guest            # guest spot (LD guest-spots; players also need player-spot-reassignment)
POST   .../events/[eventId]/bench-promotion/[id]/approve|decline
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
PATCH  /api/admin/invite  DELETE /api/admin/invite  # email edit / buff player
GET    /api/admin/users/removal-warnings            # pre-buff warnings (app-admin)
PATCH  /api/admin/role                              # change app role (app-admin)

GET    /api/cron/event-reminders                    # 48h reminders + outbox sweep (Bearer CRON_SECRET; Vercel Cron)
GET    /api/version                                  # { version, buildId } for the upgrade banner (public, uncached)
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
# LaunchDarkly (optional; see docs/launchdarkly-vercel-setup.md)
NEXT_PUBLIC_LAUNCHDARKLY_CLIENT_SIDE_ID=
# EDGE_CONFIG=              # auto-set by LaunchDarkly ↔ Vercel integration
# Email (optional locally — sending no-ops without these)
RESEND_API_KEY=           # Resend API key
EMAIL_FROM=               # verified sender, e.g. "Hoops Master <notifications@domain.com>"
CRON_SECRET=              # Bearer secret for /api/cron/event-reminders (Vercel Cron sends it)
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
pnpm tsx scripts/verify-launchdarkly-server.ts   # after vercel env pull (EDGE_CONFIG)
pnpm tsx scripts/audit-unassign-credits.ts       # read-only credit audit against prod
pnpm test                      # Vitest suite on embedded Postgres (must stay green)
pnpm lint                      # ESLint (flat config, eslint.config.mjs)
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

- **Spot/credit changes:** read **Spot lifecycle & credit invariants** above first.
  Freed spots go through `handleSpotOpening()`; the ledger is append-only (reversals
  are compensating entries, never deletes); admin and player actions follow identical
  credit rules. Add/extend a scenario in `test/` and keep `pnpm test` green.
- **Schema changes:** follow **Database migrations** above (`db:generate` → `db:migrate`,
  load `DATABASE_URL`, verify columns). Never ship code that references new columns
  without a registered, applied migration.
- All DB access goes through `lib/queries/*` — don't query Drizzle directly from
  route handlers or components.
- Use the `apiGuards` helpers for authz; don't re-implement role checks inline.
- **Emails:** never send inline inside a transaction — enqueue in `email_outbox`
  and let the post-commit drain / cron dispatch. Respect the per-type user opt-outs.
- Currency is always **€**. Display players by `display_name`, never raw email.
- Keep authorization fail-closed; LD is additive, never required.
- Native `window.confirm`/`alert` are banned — use `components/ui/ConfirmDialog`
  (GraffitiDialog styling) with inline error states.
- **Verification gates before commit:** `pnpm lint`, `npx tsc --noEmit`,
  `pnpm test`, `pnpm build` — all four must pass.
- Match the app's voice — read [`VOCABULARY.md`](./VOCABULARY.md) before writing copy.
- **Theme colors**: Tailwind classes (`text-asphalt`, `bg-terracotta`, etc.) use
  `*-rgb` channel variables so opacity modifiers (`/70`, `/80`) work. Raw hex vars
  (`var(--asphalt-black)`) remain in CSS utilities; prefer Tailwind tokens in JSX.
