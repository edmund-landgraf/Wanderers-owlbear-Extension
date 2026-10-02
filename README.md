# Wanderer's Guide Combat for Owlbear Rodeo

A lightweight, read-only Wanderer's Guide combat panel for Owlbear Rodeo.

The design goal is deliberately narrow:

> **WGUI owns combat state. Owlbear visualizes it.**

See [docs/OBR-WGUI-Integration.md](docs/OBR-WGUI-Integration.md) for the architecture and roadmap.

## First-pass features

- Owlbear GM/Player role detection
- Same combat UI for both roles
- Player enemy information filtering
- WGUI-style read-only encounter list
- Initiative, initial token, name, side/level, AC, HP, and conditions
- Expandable read-only combatant details
- Browser development mode with GM/Player toggle
- Campaign → encounter selection flow that collapses after selection
- GM-only Owlbear token-name matching with React circle color extraction
- Manual token-color palette fallback when no usable match/color is available
- Live WGUI catalog and encounter polling

No dice, combat editing, HP writes, conditions writes, or Owlbear scene mutation are included in V1. Token matching is read-only.

## Development

```bash
npm install
npm run dev
```

The extension dev server runs at:

```text
http://localhost:5201
```

Use these URLs outside Owlbear to preview both projections:

```text
http://localhost:5201/?role=GM
http://localhost:5201/?role=PLAYER
```

To install the local extension in Owlbear, point Owlbear at:

```text
http://localhost:5201/manifest.json
```

## WGUI connection

The extension calls the six WGUI functions on the same stack as [wgui.wandersguide.site](https://wgui.wandersguide.site): `wgui-ext-ensure-public-user`, `wgui-ext-join-campaign`, `wgui-ext-find-encounter`, `wgui-ext-find-campaign-characters`, `wgui-ext-patch-encounter-dice`, and `wgui-export-character`. Combat reads encounters and the campaign roster from the first two `find` functions. Sign-in uses that stack's Supabase auth.

With those values configured, campaign discovery uses the real WGUI/WG functions and the encounter dropdown calls `wgui-ext-find-encounter` for the selected campaign. GM view receives the campaigns owned by that WGUI account; Player view receives campaigns that account has joined through one of its characters.

The extension posts:

```json
{
  "campaign_id": "...",
  "fight_id": "...",
  "viewer_role": "GM"
}
```

or:

```json
{
  "campaign_id": "...",
  "fight_id": "...",
  "viewer_role": "PLAYER"
}
```

The expected response is either the encounter snapshot directly or a JSend-style `{ "data": ... }` wrapper.

## Production build

```bash
npm run build
```
