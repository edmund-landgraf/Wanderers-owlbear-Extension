import { describe, expect, it } from "vitest";
import { matchCombatantsToTokens, normalizeCombatantName } from "./tokenMatch";

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
      { id: "t1", name: " ulysses ", imageUrl: "ulysses.svg" },
      { id: "t2", name: "HADROSAURID", imageUrl: "hadrosaurid.svg" }
    ];

    const matches = matchCombatantsToTokens(combatants, tokens);
    expect(matches.get("u")?.id).toBe("t1");
    expect(matches.get("h")?.id).toBe("t2");
  });

  it("refuses ambiguous duplicate-name matches", () => {
    const combatants = [{ id: "g", name: "Guard", side: "enemy" as const }];
    const tokens = [
      { id: "t1", name: "Guard", imageUrl: "one.svg" },
      { id: "t2", name: "Guard", imageUrl: "two.svg" }
    ];

    expect(matchCombatantsToTokens(combatants, tokens).has("g")).toBe(false);
  });
});
