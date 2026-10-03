import type { CombatantView } from "./types";

/** PF2e: higher initiative first; on a tie, player characters (allies) act before other combatants. */
export function compareCombatants(a: CombatantView, b: CombatantView): number {
  const byInitiative = (b.initiative ?? -999) - (a.initiative ?? -999);
  if (byInitiative !== 0) return byInitiative;
  return sideRank(a.side) - sideRank(b.side);
}

function sideRank(side: CombatantView["side"]): number {
  if (side === "ally") return 0;
  if (side === "neutral") return 1;
  return 2;
}
