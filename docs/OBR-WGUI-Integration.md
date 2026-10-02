# Owlbear Rodeo ↔ Wanderer's Guide Integration

## Overview

This project adds a lightweight Wanderer's Guide combat experience inside Owlbear Rodeo.

The goal is **not** to build another full combat tracker or another PF2e rules engine.

Instead:

- **Wanderer's Guide / WGUI remains the source of truth for encounter state**
- **Owlbear Rodeo remains the source of truth for room role and scene presentation**
- The Owlbear extension displays a **read-only combat panel that is functionally equivalent to the WGUI combat view**
- The GM and player views use the same UI, with player-visible enemy data filtered before rendering
- Owlbear tokens remain visually simple and are initially matched to WGUI rows by the user visually
- A later V2 can automatically associate tokens with combatants and begin adding hover information and visual overlays

The result should feel like:

> **WGUI Combat, inside Owlbear.**

---

# Existing WGUI / Supabase Extensions

The current WGUI instance already has an extended Supabase integration surface.

Existing functionality includes:

- `ensure-user`
- `backfill-profile`
- `join`
- `attach-by-key`
- `encounter`
- `campaign-fights`
- `roster`
- `campaign-pcs`
- `dice`
- `shared-rolls`
- `export`
- `character-file`

Where possible, the Owlbear extension should consume these existing generic WGUI functions rather than create a parallel `obr-*` API.

OBR-specific Edge Functions should only be introduced when Owlbear requires an operation that does not make sense as a generic WGUI function.

---

# Core Architecture

```text
                         WG / Supabase
                              │
                    WGUI application state
                              │
            ┌─────────────────┴─────────────────┐
            │                                   │
          WGUI                           Owlbear Extension
            │                                   │
     full campaign UI                    read-only combat UI
            │                                   │
            └────────── same encounter state ───┘
```

## Responsibilities

### Wanderer's Guide / WGUI owns

- Campaigns
- Encounters / fights
- Combatants
- Initiative
- Round
- HP
- AC
- Conditions
- Character data
- Creature data
- Static character sheets
- Encounter composition
- Player-visible vs GM-visible encounter data
- All authoritative combat state

### Owlbear Rodeo owns

- Current room
- Current scene
- Current user's Owlbear role
- GM vs Player identity
- Scene tokens
- Token visibility
- Token position
- Token presentation

Owlbear should **not** become an authoritative combat-state store.

---

# Role Handling

Owlbear already distinguishes between GM and Player.

That should be the source of truth for which WGUI projection is requested.

```text
OBR role
   │
   ├── GM
   │    └── full encounter projection
   │
   └── PLAYER
        └── filtered player projection
```

There is no need to duplicate GM role management inside WGUI for the Owlbear panel.

The Owlbear extension determines:

```ts
GM | PLAYER
```

and requests the appropriate encounter view.

---

# Player Filtering

The GM and player views should use the **same UI components and layout**.

The difference is the data projection.

A player should never receive hidden GM-only values and then merely hide them with CSS.

Example:

## GM projection

```json
{
  "name": "Hadrosaurid",
  "side": "enemy",
  "level": 4,
  "initiative": 16,
  "hp": {
    "current": 40,
    "max": 59
  },
  "ac": 18,
  "conditions": [
    "frightened 1"
  ]
}
```

## Player projection

```json
{
  "name": "Hadrosaurid",
  "side": "enemy",
  "hpState": "injured",
  "conditions": [
    "frightened 1"
  ]
}
```

The layout should remain stable even when values are omitted.

---

# Encounter Source

The WGUI encounter is canonical.

The Owlbear extension does **not** build an encounter from scene tokens.

AMBA already exports the encounter composition to both systems, so the number and names of combatants should naturally correspond.

Example:

```text
WGUI encounter

Ulysses
Malkus
Doku
Kota
Skye Flamebelch
Hadrosaurid
...
```

Owlbear scene:

```text
[U] Ulysses
[M] Malkus
[D] Doku
[K] Kota
[S] Skye Flamebelch
[H] Hadrosaurid
```

For V1, this is sufficient.

---

# Initial-Letter Tokens

The existing AMBA-generated initial-letter SVG token style should remain.

Examples:

```text
[U] Ulysses
[M] Malkus
[D] Doku
[K] Kota
[S] Skye Flamebelch
```

These are intentionally simple.

The integration should not require portraits.

The same initial-letter visual language should be used in the Owlbear combat panel where practical.

---

# V1 — Read-Only WGUI Combat Panel

## Goal

Create an Owlbear extension panel that looks and behaves like the WGUI Combat view while remaining read-only.

The Owlbear extension subscribes to WGUI encounter state and re-renders whenever WGUI changes.

No Owlbear action modifies WGUI combat state in V1.

---

## V1 Data Flow

```text
GM edits WGUI
    │
    ▼
WG / Supabase
    │
    ▼
encounter state update
    │
    ▼
Owlbear extension receives refresh/update
    │
    ▼
panel re-renders
```

Examples of updates:

- HP changes
- Initiative changes
- Round changes
- Combatant added
- Combatant removed
- Condition added
- Condition removed
- Encounter reset
- Current turn changes

---

# V1 Combat Panel

The Owlbear panel should visually resemble the WGUI Combat screen.

The UI should prioritize readability over density.

Primary row information:

- Initiative
- Initial-letter token
- Name
- Level
- Side
- AC
- HP
- Conditions
- Current turn

Example:

```text
┌──────────────────────────────────────────────┐
│ PRICE OF PROPHECY                 ROUND 3    │
│ Reiver's Right · Current Encounter           │
├──────────────────────────────────────────────┤
│ 20   [D]  Doku                               │
│           Level 2 · Ally                     │
│           AC 18     HP 27 / 27               │
├──────────────────────────────────────────────┤
│ 18   [S]  Skye Flamebelch                    │
│           Level 1 · Ally                     │
│           AC 18     HP 23 / 23               │
├──────────────────────────────────────────────┤
│ 16   [H]  Hadrosaurid                        │
│           Level 4 · Enemy                    │
│           AC 18     HP 40 / 59               │
└──────────────────────────────────────────────┘
```

The panel should not become an icon grid.

---

# Progressive Disclosure

The UI should remain compact.

Secondary details should appear through:

- hover
- small popovers
- expandable rows
- read-only detail panels

Avoid permanently displaying every possible PF2 statistic.

Use labels with icons rather than unexplained icons.

Good:

```text
♥ HP 23 / 23
🛡 AC 18
👁 Perception +6
```

Avoid:

```text
♥ 🛡 👁 ⚔ 🏃 🎒 🔥 ...
```

without labels.

---

# Static Character Sheet

AMBA already exports a static character sheet.

The Owlbear extension should eventually allow a PC row to open that same read-only character sheet.

Example:

```text
Combat row
   │
   └── click
        │
        └── Static Character Sheet
```

This remains read-only.

No character editing is required in Owlbear.

---

# V1 Token Matching

There is **no token linking UI in V1**.

The user visually associates:

```text
[U] Ulysses
```

with:

```text
Ulysses
```

in the WGUI panel.

No metadata is required.

No scene token mutation is required.

No manual "link token" workflow is required.

This keeps V1 extremely simple.

---

# V2 — Automatic Token Matching

V2 can begin matching WGUI combatants to Owlbear scene tokens automatically.

The purpose of V2 is not to create another combat-state store.

The purpose is to establish identity:

```text
OBR token ID
      ↕
WGUI combatant ID
```

---

# V2 Matching Strategy

Start with exact normalized full-name matching.

Example:

```text
WGUI:  "Skye Flamebelch"
OBR:   "Skye Flamebelch"
```

Normalization can include:

- lowercase
- trim leading/trailing whitespace
- collapse repeated spaces
- normalize harmless punctuation

Do not use fuzzy matching initially.

Do not match based only on initials.

Initials are not unique enough.

Example:

```text
M
```

could represent multiple combatants.

---

# V2 Match Rules

If exactly one WGUI combatant matches exactly one Owlbear Character token:

```text
match accepted
```

If zero match:

```text
leave unlinked
```

If multiple match:

```text
leave ambiguous / unlinked
```

No automatic guess should be made in an ambiguous case.

---

# V2 Token Metadata

Once matched, store only durable identity information in Owlbear metadata.

Example:

```json
{
  "site.wanderersguide/combatant": {
    "combatantId": "abc123",
    "characterId": "xyz789"
  }
}
```

The token should **not** store a duplicate copy of:

- HP
- AC
- Initiative
- Conditions
- Saves
- Other WGUI state

Those values remain authoritative in WGUI.

---

# V2 Token Hover Card

The first token-aware feature should be informational.

Once a token is matched, hovering over it can display a compact read-only combat card.

This should borrow the useful concept from Game Master's Grimoire without copying its density.

## GM Hover Example

```text
ULYSSES
Level 1 · Ally

♥ HP          23 / 23
🛡 AC          18
👁 Perception  +6

FORT +7
REF  +5
WILL +4

Conditions
None
```

Enemy:

```text
HADROSAURID
Creature 4 · Enemy

♥ HP          40 / 59
🛡 AC          18

FORT +11
REF   +8
WILL  +7

Conditions
Frightened 1
```

---

# Player Hover Example

The hover card must use the same filtered player projection as the combat panel.

Example:

```text
HADROSAURID
Enemy

♥ Injured

Conditions
Frightened 1
```

No hidden values should be exposed merely because the player hovered a token.

---

# Shared Data Path

The panel and hover card should use the same encounter data.

```text
WGUI encounter feed
        │
        ├── Combat Panel
        │
        └── Matched Token Hover
```

Do not create a separate character-fetch system just for token hover.

---

# V2 Validation Benefit

The hover card also acts as a visual validation of automatic matching.

Example:

```text
User hovers [U]
     │
     ▼
ULYSSES
HP 23 / 23
```

This immediately confirms that the token-to-combatant association is correct.

---

# Future Visual Overlays

Once a token has a durable combatant ID, WGUI state can influence token presentation.

This remains derived presentation only.

Example:

```text
WGUI condition
      │
      ▼
OBR visual decoration
```

Possible future overlays:

- HP ring
- Active-turn outline
- Dead marker
- Dying marker
- Unconscious marker
- Condition pips
- Persistent damage indicator
- Major-state tint/desaturation

---

# Overlay Design Principles

Avoid visual clutter.

Suggested hierarchy:

```text
Outer ring       = HP / life state
Outline / glow   = active turn
Small pips       = conditions
Hover            = exact details
```

Major conditions may override normal presentation:

- Dead
- Dying
- Unconscious

Minor conditions should remain subtle.

Do not turn tokens into dense icon clusters.

---

# HP Ring

The first actual map overlay should probably be a thin HP ring.

Example:

```text
Full HP:
██████████

Half HP:
█████░░░░░
```

The token itself remains clean.

Exact HP values remain in the panel or hover card.

---

# Read-Only Principle

For the foreseeable initial implementation:

```text
WGUI → Owlbear
```

not:

```text
Owlbear → WGUI
```

Owlbear displays combat state.

It does not:

- change HP
- add/remove conditions
- change initiative
- advance rounds
- edit characters
- edit encounters

All of those actions continue to happen in WGUI.

This keeps synchronization simple and avoids competing sources of truth.

---

# Event / Update Model

The Owlbear extension should subscribe to WGUI/Supabase updates where practical.

Conceptually:

```text
WGUI edit
    │
    ▼
Supabase state
    │
    ▼
subscription / update signal
    │
    ▼
OBR extension refreshes encounter projection
```

If live subscriptions prove awkward, a lightweight refresh strategy can be used initially.

The important rule is:

> Owlbear never calculates encounter state independently.

---

# Generic API Preference

The Owlbear extension should preferably call the existing generic WGUI/Supabase functions.

Likely candidates include:

- `encounter`
- `campaign-fights`
- `roster`
- `campaign-pcs`
- `character-file`

Potentially later:

- `dice`
- `shared-rolls`

However, dice are explicitly out of scope for the initial Owlbear implementation.

If existing endpoints do not expose a clean viewer-filtered encounter projection, add or extend a generic WGUI endpoint rather than immediately create an OBR-only duplicate.

---

# Out of Scope for V1

The following are intentionally excluded:

- Dice
- 3D dice
- Attack rolling
- Damage rolling
- Editable HP
- Editable conditions
- Editable initiative
- Inventory
- Loot
- Shops
- Character builder
- Encounter creation
- Encounter editing
- Full PF2 rules engine
- Portrait management
- Token-to-row linking UI
- Persistent token overlays

---

# V1 Acceptance Criteria

V1 is successful when:

1. Owlbear extension loads inside an OBR room.
2. It detects whether the current Owlbear user is GM or Player.
3. It requests the correct encounter projection.
4. It displays a WGUI-style combat panel.
5. GM sees the full allowed encounter data.
6. Player sees the filtered player encounter data.
7. Initiative order matches WGUI.
8. Combatant names match WGUI.
9. HP/AC/conditions match WGUI according to visibility rules.
10. Round/current-turn state matches WGUI.
11. Changes made in WGUI eventually appear in Owlbear.
12. No Owlbear action changes WGUI state.
13. No token linking workflow is required.
14. Initial-letter SVG token style remains unchanged.

---

# V2 Acceptance Criteria

V2 begins when:

1. Owlbear CHARACTER tokens can be enumerated.
2. Exact normalized name matching identifies combatants.
3. Successful matches are stored in token metadata.
4. Ambiguous matches are left untouched.
5. Matched tokens can display a compact hover card.
6. Hover data comes from the same WGUI encounter projection as the main panel.
7. Player hover cards obey the same visibility filtering as the player combat panel.
8. No duplicated authoritative combat state is stored in token metadata.

---

# Suggested V2 Progression

```text
V2.1
Exact-name auto matching
→ store combatant ID metadata

V2.2
Matched-token hover card

V2.3
Active-turn highlight

V2.4
HP ring

V2.5
Major-state overlays
→ dead
→ dying
→ unconscious

V2.6
Condition indicators
```

---

# Long-Term Principle

The integration should remain deliberately asymmetric:

```text
WGUI owns state.
Owlbear visualizes state.
```

The Owlbear extension should stay small, readable, and focused on encounter play.

It should not grow into another Game Master's Grimoire.

The inspiration from Grimoire is:

- token-aware presentation
- compact combat information
- useful GM/player differences
- map-adjacent encounter context

The implementation goal is simpler:

> **A clean WGUI combat view inside Owlbear, with increasingly intelligent token presentation over time.**
