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

const SUBSCRIPT_DIGITS = "₀₁₂₃₄₅₆₇₈₉";

/** Name used to pair a combatant with a map token. Drops copy numbers, hyphens, and leading Accessibility codes such as "GWC", "SS:", or "SS₁". */
export function tokenMatchKey(value: string): string {
  const withoutBadge = value
    .trim()
    .replace(/^(?:[A-Z]{1,8}[\u2080-\u2089\d]{0,2}(?:\s*:\s*|\s+))+/u, "");

  return normalizeCombatantName(withoutBadge)
    .replace(/^(?:[a-z0-9]{1,8}\s*:\s*)+/, "")
    .replace(/[-–—_/]+/g, " ")
    .replace(/\(\s*\d+\s*\)/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** True when the token name is the combatant name, or the combatant name with a short leading code. */
export function tokenNamesAlign(tokenName: string, combatantName: string): boolean {
  const tokenKey = tokenMatchKey(tokenName);
  const combatantKey = tokenMatchKey(combatantName);
  if (!tokenKey || !combatantKey) return false;
  if (tokenKey === combatantKey) return true;

  const [longer, shorter] =
    tokenKey.length >= combatantKey.length ? [tokenKey, combatantKey] : [combatantKey, tokenKey];
  return shorter.includes(" ") && longer.endsWith(` ${shorter}`);
}

/** Copy number from "SS₁ Name", "SS2 Name", or "Name (2)". */
export function tokenCopyIndex(value: string): number | null {
  const badge = value.trim().match(/^[A-Z]{1,4}([\u2080-\u2089]|\d)?(?:\s*:\s*|\s+)/);
  const badgeDigit = badge?.[1];
  if (badgeDigit) {
    const subscript = SUBSCRIPT_DIGITS.indexOf(badgeDigit);
    if (subscript > 0) return subscript;
    const digit = Number(badgeDigit);
    if (digit > 0) return digit;
  }

  const paren = value.match(/\(\s*(\d+)\s*\)/);
  if (paren) {
    const index = Number(paren[1]);
    if (index > 0) return index;
  }

  return null;
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

  const claimedTokenIds = new Set<string>();

  const matches: TokenColorMatch[] = [];
  const tokensForKey = new Map<string, OwlbearTokenVisual[]>();

  // Longer combatant names claim a token first, so "Goblin War Chanter" wins
  // over a shorter name that is only a suffix of the same token.
  const combatantKeys = [...combatantsByName.keys()].sort((a, b) => b.length - a.length);

  for (const key of combatantKeys) {
    const exactTokens = (tokensByName.get(key) ?? []).filter((token) => !claimedTokenIds.has(token.id));
    const looseTokens =
      exactTokens.length > 0
        ? []
        : tokens.filter(
            (token) =>
              !claimedTokenIds.has(token.id) &&
              tokenNamesAlign(token.name, key) &&
              tokenMatchKey(token.name) !== key
          );
    const groupTokens = exactTokens.length > 0 ? exactTokens : looseTokens;
    if (groupTokens.length === 0) continue;
    for (const token of groupTokens) claimedTokenIds.add(token.id);
    tokensForKey.set(key, groupTokens);
  }

  // Owlbear's item.name is the Accessibility -> Name value. Several copies of
  // one creature (Grindylow (1), Grindylow (2)) share a color when every map
  // token of that name sampled the same fill. Numbered badges (SS₁, SS₂) pair
  // with the same copy number even when the fills differ.
  for (const [key, candidates] of combatantsByName) {
    const groupTokens = tokensForKey.get(key) ?? [];
    if (groupTokens.length === 0) continue;

    const usedTokenIds = new Set<string>();
    const usedCombatantIds = new Set<string>();

    for (const combatant of candidates) {
      const index = tokenCopyIndex(combatant.name);
      if (index === null) continue;
      const indexed = groupTokens.filter(
        (token) => !usedTokenIds.has(token.id) && tokenCopyIndex(token.name) === index
      );
      if (indexed.length !== 1) continue;
      const token = indexed[0];
      usedTokenIds.add(token.id);
      usedCombatantIds.add(combatant.id);
      matches.push({
        tokenId: token.id,
        tokenName: token.name,
        combatantId: combatant.id,
        combatantName: combatant.name,
        backgroundColor: token.backgroundColor ?? null
      });
    }

    const remainingCombatants = candidates.filter((combatant) => !usedCombatantIds.has(combatant.id));
    const remainingTokens = groupTokens.filter((token) => !usedTokenIds.has(token.id));
    if (remainingCombatants.length === 0 || remainingTokens.length === 0) continue;

    const colors = [
      ...new Set(
        remainingTokens
          .map((token) => token.backgroundColor)
          .filter((color): color is string => Boolean(color))
      )
    ];

    if (colors.length > 1) continue;
    if (colors.length === 0 && (remainingCombatants.length !== 1 || remainingTokens.length !== 1)) continue;

    const token = remainingTokens[0];
    const backgroundColor = colors[0] ?? token.backgroundColor ?? null;

    for (const combatant of remainingCombatants) {
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
