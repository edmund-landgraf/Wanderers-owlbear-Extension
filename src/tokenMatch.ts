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

/** Name used to pair a combatant with a map token. Drops copy numbers, hyphens, and a short Accessibility prefix such as "SS:". */
export function tokenMatchKey(value: string): string {
  return normalizeCombatantName(value)
    .replace(/^[a-z0-9]{1,8}\s*:\s*/, "")
    .replace(/[-–—]/g, " ")
    .replace(/\(\s*\d+\s*\)/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function buildTokenColorMatches(
  combatants: CombatantView[],
  tokens: OwlbearTokenVisual[]
): TokenColorMatch[] {
  const combatantsByName = new Map<string, CombatantView[]>();
  const tokensByName = new Map<string, OwlbearTokenVisual[]>();

  for (const combatant of combatants) {
    const key = tokenMatchKey(combatant.name);
    const list = combatantsByName.get(key) ?? [];
    list.push(combatant);
    combatantsByName.set(key, list);
  }

  for (const token of tokens) {
    const key = tokenMatchKey(token.name);
    const list = tokensByName.get(key) ?? [];
    list.push(token);
    tokensByName.set(key, list);
  }

  const matches: TokenColorMatch[] = [];

  // Owlbear's item.name is the Accessibility -> Name value. Several copies of
  // one creature (Grindylow (1), Grindylow (2)) share a color when every map
  // token of that name sampled the same fill. Differing fills stay unmatched.
  for (const [key, candidates] of combatantsByName) {
    const groupTokens = tokensByName.get(key) ?? [];
    if (groupTokens.length === 0) continue;

    const colors = [
      ...new Set(
        groupTokens
          .map((token) => token.backgroundColor)
          .filter((color): color is string => Boolean(color))
      )
    ];

    if (colors.length > 1) continue;
    if (colors.length === 0 && (candidates.length !== 1 || groupTokens.length !== 1)) continue;

    const token = groupTokens[0];
    const backgroundColor = colors[0] ?? token.backgroundColor ?? null;

    for (const combatant of candidates) {
      matches.push({
        tokenId: token.id,
        tokenName: token.name,
        combatantId: combatant.id,
        combatantName: combatant.name,
        backgroundColor
      });
    }
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
