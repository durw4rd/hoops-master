# Hoops Master — Agent Instructions

Multi-crew basketball game organizer: crews → games → priced spots + a credit
ledger. Next.js 15 App Router, Drizzle + Neon Postgres, NextAuth, LaunchDarkly,
Vercel. Package manager: `pnpm`.

**[`APP_ARCHITECTURE.md`](./APP_ARCHITECTURE.md) is the authoritative architecture
spec. Read the relevant sections before making structural changes, and update it
in the same change when you alter the architecture.** App voice/copy conventions
live in [`VOCABULARY.md`](./VOCABULARY.md).

## `.env.local` points at the PRODUCTION database

There is no dev or staging database. `DATABASE_URL` in `.env.local` is the live
Neon database with real crews, players, and ledger rows — and `pnpm dev` runs
against it too. Treat every command that reads that file as production access:

- **Ask before running anything that writes.** That includes `pnpm db:migrate`,
  seed/backfill scripts, and anything invoked via `node --env-file=.env.local`.
  Read-only investigation (`SELECT`) is fine without asking; say which database
  you queried when you report the results.
- **Migrations must be backward-compatible (expand-only):** new tables, new
  nullable columns, relaxed constraints. Production keeps running the OLD code
  until the deploy lands, so anything the old code can't tolerate — a new
  `NOT NULL` without a default, a renamed or dropped column, a tightened
  constraint — breaks the live app during that gap. Split those into
  expand → deploy → contract across two changes.
- **Never point the test suite at it.** `pnpm test` boots its own embedded
  Postgres on port 55432; that isolation is why the suite is safe to run freely.

## Hard invariants (do not deviate)

These rules are enforced by the test suite; the full rationale is in
APP_ARCHITECTURE.md → "Spot lifecycle & credit invariants".

1. **Every freed spot resolves through `handleSpotOpening()`**
   (`lib/queries/spotOpening.ts`). Never hand-roll release/offer/unassign flows;
   extend the unified handler instead of adding per-action special cases.
2. **The credit ledger (`spot_transactions`) is append-only.** Reversals are
   compensating entries (`unassign_refund`, `event_cancelled_refund`,
   `split_unsettle`) — never `DELETE` ledger rows.
3. **A spot never sits open while a seatable player waits on the bench**
   (auto-match always; within 24h of tip-off via a pending approval request).
   Bench matching is **skipped for past events** — openings on played games
   dissolve into capacity slack or sit offered; no promotions or pending
   requests are ever created after tip-off.
4. **Admin- and player-initiated actions follow identical credit rules.**
   Sole exception: guest assignment is credit-neutral. Capo/King may act on a
   player's behalf (offer/retract/reassign) and edit past games
   (`spotMutationBlockedMessage(event, { actorIsManager })`); the HOLDER is
   always the funding party on audit/transfer rows.
   **No-show is record-keeping only** (`setAttendeeNoShow`) — it never writes
   ledger rows; the player stays charged.
5. **Whoever lands a spot leaves the bench** (all fill paths call
   `removeUserFromBench`).
6. **Emails are never sent inline inside DB transactions** — enqueue in
   `email_outbox`; the post-commit drain / cron dispatches. Respect the
   per-type opt-outs on `users`.

## Non-negotiable conventions

- All DB access via `lib/queries/*`; authz via `lib/apiGuards.ts` helpers.
- Schema changes: edit `lib/db/schema.ts` → `pnpm db:generate` → review SQL →
  `pnpm db:migrate` (needs `DATABASE_URL` exported from `.env.local` — drizzle-kit
  does not read `.env.local` itself). **That migrates production — see the warning
  above; confirm first and keep the migration expand-only.** Never reference
  unapplied columns.
- Spot mutations run inside `withEventLock` (serializable + `SELECT FOR UPDATE`).
- No native `window.confirm`/`alert` — use `components/ui/ConfirmDialog`.
- Currency is €; show `display_name`, never raw emails. LD flags are additive,
  authorization is fail-closed.

## Verification gates (all must pass before committing)

```bash
pnpm lint            # ESLint flat config
npx tsc --noEmit     # types (next build ignores TS errors — this is the real gate)
pnpm test            # Vitest on embedded Postgres; spot/ledger/bench invariants
pnpm build
```

Any behavioral change to spot/credit/bench logic needs a scenario in `test/`
(factories in `test/factories.ts`, invariant asserts in `test/invariants.ts`).
