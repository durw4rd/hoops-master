# Hoops Master — Voice & Vocabulary

The app speaks in **1980s NYC streetball + subway-graffiti slang** — the voice of
the writers and ballplayers in Martha Cooper & Henry Chalfant's *Subway Art* and
the *Spray Nation* interviews. Raw, first-person, confident, communal.

**Golden rule:** flavor never beats clarity. A button must still tell the user
what it does. When a slang term would confuse, keep the plain word (or pair the
slang with a clear tooltip). Stats/tracking language stays neutral — the culture
is about *showing up and organizing the squad*, not box scores.

## Canonical term map

These are the terms currently used in the product. **Reuse them — don't invent new
synonyms for the same concept.**

| Concept | Term in app | Notes |
|---|---|---|
| Group / team | **Crew** | The core tenant unit. |
| Crew leader (group admin) | **Capo** | DB `group_role = 'admin'`. Full control. |
| Crew co-leader | **King** | DB `group_role = 'coleader'`. Manage games + add players. |
| Crew member | **Player** / **Head** | Tab is "Players"; prose may say "heads". |
| App owner | **Owner** | DB `global_role = 'owner'`. Immutable super-admin. |
| App admin | **Admin** | DB `global_role = 'admin'`. |
| Event / session | **Game** | "Drop a Game" to create. |
| Create single game (button) | **Drop It** / **Drop a Game** | |
| Special / standout game | **Special** / **Burner** | `event_type = 'special'`; poster card on crew wall; Drop It tab only. |
| Create recurring series (button) | **Lock the Season** | Always creates regular games. |
| Waitlist | **The Bench** | "GET ON THE BENCH" / "OFF THE BENCH" / "#N on the bench". |
| Join waitlist | **Get on the Bench** | |
| Leave waitlist | **Off the Bench** | |
| Round-robin rotation tab | **Rotation** | |
| Round-robin lineup ordering | **Lineup Order** | |
| Generate rotation series | **Run the Series** / **Drop the Series** | |
| Player management dashboard | **The Black Book** | App-admin invites + role mgmt (a writer's blackbook). |
| Remove player from Black Book | **Buff 'Em** | Soft-delete from allowlist; warns on spots/balances. |
| Invite a player (button) | **Put On** | "put someone on" = bring into the scene. |
| Add player to crew (button) | **Put 'Em On** | Modal title; subtext mentions "the yard". |
| Pool of all known players | **The Yard** | Search placeholder: "Search the yard…". |
| Credits / balances tab | **Balances** | |
| Record a payment (toggle) | **Square Up** | Collapsible form. |
| Crew credit settlement (section) | **Squash the Beef** | Pair players in the black with players in the red so the crew gets square. Button in the Balances card. |
| Open a running settlement (button) | **See the Beef (N open)** | Same button once a settlement is in play; "all squared" when nothing is open. |
| Viewer's own pairings (Balances card) | **Your beef** | "You owe X €Y" / "X owes you €Y" + a Mark Paid shortcut. |
| Sum of every balance (Balances table) | **Crew total** | Footer row. The crew's net position — zero only when everyone is square. |
| Crew total is negative (Capo/King) | **The crew still owes €X for spots nobody has paid in for yet** | Informational, not an alarm: spot charges are one-sided, so this is normal until payments land. |
| Crew total is positive (Capo/King) | **The crew is holding €X of credit players haven't used yet** | E.g. after a season buy-in, before the games are played. |
| Add a pairing (builder button) | **Match Up** | Pick one or more players on each side; one-on-one lets you set the amount, otherwise biggest debts match the biggest credits. |
| Submit the pairings (button) | **Lock It In** | Persists the settlement and tags everyone involved. |
| Player fully matched (builder) | **squared** | Dimmed row — nothing left to pair. |
| Mark a pairing paid (confirm) | **Squared** | Row action stays plain "Mark Paid"; writes both payment records. |
| Cancel the settlement (button) | **Tear It Up** | Scraps unpaid pairings; anything already squared stands. |
| Settlement notifications (titles) | **Beef to squash** / **Squared up** / **Beef's off** | Created / a pairing was paid / settlement torn up. |
| Member/game counts (crew card) | **HEADS** / **GAMES** | Graffiti tag-style badges. |
| Display name / handle | **Tag** / **Your Tag** | Edit in the settings menu. |
| Profile picture / avatar | **Piece** / **Your Piece** | A writer's signature artwork → a player's avatar. Stored in Vercel Blob. |
| Logout (settings menu) | **Bounce** | |
| In-app notification inbox (settings menu) | **Fresh tags** | Unread count badge on profile piece; graffiti-styled panel title. |
| Mark all notifications read | **Clear the wall** | Button in the Fresh tags panel. |
| Empty notification inbox | **All quiet — no fresh tags.** | |
| Offered spot claimed (notification title) | **Spot got snatched** / **+1 ride claimed** | Primary vs Rider slot; body names the claimer and game. |
| Bench promotion (notification title) | **You're up** / **Your Rider's up** | Off the bench into the lineup. |
| Empty crew list | **No Crews Yet!** | |
| Empty games list | **No Games Yet!** | |
| Danger zone (delete crew) | **Burn It Down** | "buffed" = erased; deletion is permanent. |
| Leave crew voluntarily | **Cut Loose** | Players tab; self-only; Capo must delete crew or hand off leadership. |

## Spot-action verbs (kept clear on purpose)

`CLAIM SPOT`, `OFFER`, `RELEASE`, `RETRACT` — these stay plain because they map to
distinct, irreversible spot mechanics. Tooltips carry the flavor where helpful.

## Vocabulary bank (available, not all adopted)

Pull from here when adding new copy so the voice stays consistent. Adopt selectively.

- **King / Queen** — dominant writer / crew leader → admin tier.
- **Heads** — people deep in the scene → players/members.
- **Tagging** — manual assignment ("you've been tagged for Saturday").
- **The Outline** — a draft/not-yet-open game.
- **Roll Call** — an open-signup game.
- **Getting Up** — putting your name up; joining a game.
- **On Lock** — a fully-rostered, locked game (an outline becomes locked). _("Piece" is now the player avatar — see the canonical map.)_
- **Buffed** — cancelled/erased (MTA "buffed" graffiti off trains).
- **The Yard / The Spot** — the court / location; the player pool.
- **A Burner** — adopted as **Special** games (`event_type = 'special'`); tournaments map here.
- **Going All City** — a multi-crew / inter-crew event.
- **The Bench** — the waitlist (149th St Grand Concourse bench). **Adopted.**
- **My Blackbook** — a user's own profile/memberships.
- **Flaking / Ghosting** — no-shows.
- **Word** — affirmative confirm ("OK"/"Confirm") on modals.

## When you add copy

1. Check the **canonical term map** first and reuse the existing term.
2. If it's a new concept, pick from the **vocabulary bank** and add a row to the map.
3. Keep destructive/irreversible actions unmistakably clear.
4. Currency is always **€**. Refer to people by their `display_name`.
