import type { CombatantView } from "./types";

export type OwlbearTokenVisual = {
  id: string;
  name: string;
  backgroundColor?: string | null;
};

export function normalizeCombatantName(value: string): string {
  return value
    .normalize("NFKC")
    .trim()
    .replace(/\s+/g, " ")
    .toLocaleLowerCase();
}

export function matchCombatantsToTokens(
  combatants: CombatantView[],
  tokens: OwlbearTokenVisual[]
): Map<string, OwlbearTokenVisual> {
  const byName = new Map<string, OwlbearTokenVisual[]>();

  for (const token of tokens) {
    const key = normalizeCombatantName(token.name);
    const list = byName.get(key) ?? [];
    list.push(token);
    byName.set(key, list);
  }

  const matches = new Map<string, OwlbearTokenVisual>();
  for (const combatant of combatants) {
    const candidates = byName.get(normalizeCombatantName(combatant.name)) ?? [];
    if (candidates.length === 1) {
      matches.set(combatant.id, candidates[0]);
    }
  }

  return matches;
}
