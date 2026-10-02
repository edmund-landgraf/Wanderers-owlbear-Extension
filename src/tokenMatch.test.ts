import { describe, expect, it } from "vitest";
import { buildTokenColorMatches, matchCombatantsToTokens, normalizeCombatantName } from "./tokenMatch";

describe("token matching", () => {
  it("normalizes case and whitespace", () => {
    expect(normalizeCombatantName("  Skye   Flamebelch ")).toBe("skye flamebelch");
  });

  it("matches PCs and creatures by exact normalized Owlbear item name", () => {
    const combatants = [
      { id: "u", name: "Ulysses", side: "ally" as const },
      { id: "h", name: "Hadrosaurid", side: "enemy" as const }
    ];
    const tokens = [
      { id: "t1", name: " ulysses ", backgroundColor: "#6d28d9" },
      { id: "t2", name: "HADROSAURID", backgroundColor: "#e8a832" }
    ];

    const matches = matchCombatantsToTokens(combatants, tokens);
    expect(matches.get("u")).toMatchObject({ id: "t1", backgroundColor: "#6d28d9" });
    expect(matches.get("h")).toMatchObject({ id: "t2", backgroundColor: "#e8a832" });
  });

  it("stores accessibility-name matches and sampled SVG colors in an array", () => {
    const combatants = [
      { id: "k", name: "Kota", side: "ally" as const },
      { id: "h", name: "Hadrosaurid", side: "enemy" as const }
    ];
    const tokens = [
      { id: "t1", name: " Kota ", backgroundColor: "#2fb8d0" },
      { id: "t2", name: "HADROSAURID", backgroundColor: "#e8a832" }
    ];

    expect(buildTokenColorMatches(combatants, tokens)).toEqual([
      {
        tokenId: "t1",
        tokenName: " Kota ",
        combatantId: "k",
        combatantName: "Kota",
        backgroundColor: "#2fb8d0"
      },
      {
        tokenId: "t2",
        tokenName: "HADROSAURID",
        combatantId: "h",
        combatantName: "Hadrosaurid",
        backgroundColor: "#e8a832"
      }
    ]);
  });

  it("refuses ambiguous duplicate-name matches", () => {
    const combatants = [{ id: "g", name: "Guard", side: "enemy" as const }];
    const tokens = [
      { id: "t1", name: "Guard", backgroundColor: "#ef3340" },
      { id: "t2", name: "Guard", backgroundColor: "#f5ba27" }
    ];

    expect(matchCombatantsToTokens(combatants, tokens).has("g")).toBe(false);
  });
});
