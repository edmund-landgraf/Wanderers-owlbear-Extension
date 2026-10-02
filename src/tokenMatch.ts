import type { CombatantView } from "./types";

export type OwlbearTokenVisual = {
  id: string;
  name: string;
  backgroundColor?: string | null;
};

export type TokenColorMatch = {
  tokenId: string;
  tokenName: string;
  combatantId: string;
  combatantName: string;
  backgroundColor: string | null;
};

export function normalizeCombatantName(value: string): string {
  return value
    .normalize("NFKC")
    .trim()
    .replace(/\s+/g, " ")
    .toLocaleLowerCase();
}

export function buildTokenColorMatches(
  combatants: CombatantView[],
  tokens: OwlbearTokenVisual[]
): TokenColorMatch[] {
  const combatantsByName = new Map<string, CombatantView[]>();
  const tokenCountsByName = new Map<string, number>();

  for (const combatant of combatants) {
    const key = normalizeCombatantName(combatant.name);
    const list = combatantsByName.get(key) ?? [];
    list.push(combatant);
    combatantsByName.set(key, list);
  }

  for (const token of tokens) {
    const key = normalizeCombatantName(token.name);
    tokenCountsByName.set(key, (tokenCountsByName.get(key) ?? 0) + 1);
  }

  const matches: TokenColorMatch[] = [];

  // Owlbear's item.name is the Accessibility -> Name value. Scan every
  // CHARACTER token first, then publish one array only after the scan finishes.
  for (const token of tokens) {
    const key = normalizeCombatantName(token.name);
    const candidates = combatantsByName.get(key) ?? [];

    // A name-only match is safe only when both the encounter and the map have
    // exactly one item with that normalized name.
    if (candidates.length !== 1 || tokenCountsByName.get(key) !== 1) continue;

    const combatant = candidates[0];
    matches.push({
      tokenId: token.id,
      tokenName: token.name,
      combatantId: combatant.id,
      combatantName: combatant.name,
      backgroundColor: token.backgroundColor ?? null
    });
  }

  return matches;
}

export function matchCombatantsToTokens(
  combatants: CombatantView[],
  tokens: OwlbearTokenVisual[]
): Map<string, OwlbearTokenVisual> {
  const matches = new Map<string, OwlbearTokenVisual>();

  for (const match of buildTokenColorMatches(combatants, tokens)) {
    matches.set(match.combatantId, {
      id: match.tokenId,
      name: match.tokenName,
      backgroundColor: match.backgroundColor
    });
  }

  return matches;
}
