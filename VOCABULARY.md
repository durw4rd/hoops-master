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
| Create recurring series (button) | **Lock the Season** | |
| Waitlist | **The Bench** | "GET ON THE BENCH" / "OFF THE BENCH" / "#N on the bench". |
| Join waitlist | **Get on the Bench** | |
| Leave waitlist | **Off the Bench** | |
| Round-robin rotation tab | **Rotation** | |
| Round-robin lineup ordering | **Lineup Order** | |
| Generate rotation series | **Run the Series** / **Drop the Series** | |
| Player management dashboard | **The Black Book** | App-admin invites + role mgmt (a writer's blackbook). |
| Invite a player (button) | **Put On** | "put someone on" = bring into the scene. |
| Add player to crew (button) | **Put 'Em On** | Modal title; subtext mentions "the yard". |
| Pool of all known players | **The Yard** | Search placeholder: "Search the yard…". |
| Credits / balances tab | **Balances** | |
| Record a payment (toggle) | **Square Up** | Collapsible form. |
| Member/game counts (crew card) | **HEADS** / **GAMES** | Graffiti tag-style badges. |
| Empty crew list | **No Crews Yet!** | |
| Empty games list | **No Games Yet!** | |
| Danger zone (delete crew) | **Burn It Down** | "buffed" = erased; deletion is permanent. |

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
- **The Piece** — a fully-rostered, locked game (an outline becomes a piece).
- **Buffed** — cancelled/erased (MTA "buffed" graffiti off trains).
- **The Yard / The Spot** — the court / location; the player pool.
- **A Burner** — a standout special event or tournament.
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
