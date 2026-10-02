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
- Sample encounter fallback
- Configurable live encounter endpoint with polling

No dice, combat editing, HP writes, conditions writes, or token matching are included in V1.

## Development

```bash
npm install
npm run dev
```

The extension dev server runs at:

```text
http://localhost:5195
```

Use these URLs outside Owlbear to preview both projections:

```text
http://localhost:5195/?role=GM
http://localhost:5195/?role=PLAYER
```

To install the local extension in Owlbear, point Owlbear at:

```text
http://localhost:5195/manifest.json
```

## WGUI feed

Copy `.env.example` to `.env.local` and set `VITE_WGUI_ENCOUNTER_URL` when a viewer-filtered encounter projection endpoint is ready.

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

When no endpoint is configured, sample encounter data is used for UI development.

## Production build

```bash
npm run build
```
