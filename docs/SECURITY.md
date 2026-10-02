# Security Notes

## Viewer role vs. backend authorization

Owlbear Rodeo exposes the current user's role through `OBR.player.getRole()`.

The extension uses that value to choose the GM or Player presentation. This is the correct source of truth for the **Owlbear UI role**, but it must not be treated as cryptographic authorization by the Wanderer's Guide backend.

A request body such as:

```json
{
  "viewer_role": "GM"
}
```

is supplied by browser code and can be reproduced or modified by a user.

Therefore:

- `viewer_role` may be used as a presentation hint.
- The backend must independently authorize access before returning GM-only encounter data.
- Player responses should never contain hidden GM values that are merely concealed with CSS or React conditionals.
- If GM authorization cannot be established, the backend should return the Player projection.
- The Owlbear extension itself should fail closed to Player when embedded role detection fails.

## Browser secrets

Do not put credentials, service-role keys, API secrets, or privileged bearer tokens in variables prefixed with `VITE_`.

Vite exposes those values to browser JavaScript at build time.

The extension currently contains no browser bearer-token configuration.

## Current data direction

V1 is read-only:

```text
WGUI / WG -> Owlbear
```

The extension does not write HP, conditions, initiative, encounter state, or character state back to WGUI.

## Token metadata

When V2 token matching is introduced, Owlbear token metadata should contain durable identity only, such as a combatant or character ID.

Do not duplicate authoritative combat state such as HP, AC, initiative, or conditions into token metadata.
