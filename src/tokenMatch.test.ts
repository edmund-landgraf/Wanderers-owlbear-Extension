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

  it("drops a leading accessibility code and still matches the creature name", () => {
    const combatants = [{ id: "gwc", name: "Goblin War Chanter", side: "enemy" as const }];
    const tokens = [{ id: "t1", name: "GWC Goblin War Chanter", backgroundColor: "#c4473a" }];

    expect(matchCombatantsToTokens(combatants, tokens).get("gwc")).toMatchObject({
      id: "t1",
      backgroundColor: "#c4473a"
    });
  });

  it("matches when a code stays attached and the creature name is a suffix", () => {
    const combatants = [
      { id: "gwc", name: "Goblin War Chanter", side: "enemy" as const },
      { id: "gw", name: "Goblin Warrior (2)", side: "enemy" as const }
    ];
    const tokens = [
      { id: "t1", name: "gwc-goblin war chanter", backgroundColor: "#c4473a" },
      { id: "t2", name: "GW2 Goblin Warrior", backgroundColor: "#3355aa" }
    ];

    const matches = matchCombatantsToTokens(combatants, tokens);
    expect(matches.get("gwc")?.id).toBe("t1");
    expect(matches.get("gw")?.id).toBe("t2");
  });

  it("matches the Accessibility name after a short prefix", () => {
    const combatants = [
      { id: "s1", name: "Skeletal Soldier (1)", side: "enemy" as const },
      { id: "s2", name: "Skeletal Soldier (2)", side: "enemy" as const }
    ];
    const tokens = [
      { id: "t1", name: "SS: Skeletal Soldier", backgroundColor: "#c4473a" },
      { id: "t2", name: "SS: Skeletal Soldier", backgroundColor: "#c4473a" }
    ];

    const matches = matchCombatantsToTokens(combatants, tokens);
    expect(matches.get("s1")?.backgroundColor).toBe("#c4473a");
    expect(matches.get("s2")?.backgroundColor).toBe("#c4473a");
  });

  it("pairs subscript accessibility badges with numbered combatant copies", () => {
    const combatants = [
      { id: "s1", name: "Skeletal Soldier (1)", side: "enemy" as const },
      { id: "s2", name: "Skeletal Soldier (2)", side: "enemy" as const },
      { id: "jorak", name: "Jorak", side: "ally" as const }
    ];
    const tokens = [
      { id: "ss2", name: "SS₂ Skeletal Soldier", backgroundColor: "#aa3311" },
      { id: "ss1", name: "SS₁ Skeletal Soldier", backgroundColor: "#11aa33" },
      { id: "bro", name: "BRO Blue-Ringed Octopus", backgroundColor: "#2255aa" },
      { id: "uly", name: "Ulysses", backgroundColor: "#6d28d9" }
    ];

    const matches = matchCombatantsToTokens(combatants, tokens);
    expect(matches.get("s1")).toMatchObject({ id: "ss1", backgroundColor: "#11aa33" });
    expect(matches.get("s2")).toMatchObject({ id: "ss2", backgroundColor: "#aa3311" });
    expect(matches.has("jorak")).toBe(false);
  });

  it("gives every copy of a creature the shared map color", () => {
    const combatants = [
      { id: "octo", name: "Blue Ringed Octopus", side: "enemy" as const },
      { id: "g1", name: "Grindylow (1)", side: "enemy" as const },
      { id: "g2", name: "Grindylow (2)", side: "enemy" as const },
      { id: "reef", name: "Reefclaw (2)", side: "enemy" as const }
    ];
    const tokens = [
      { id: "b", name: "Blue-ringed octopus", backgroundColor: "#3caa55" },
      { id: "g-a", name: "Grindylow", backgroundColor: "#c4473a" },
      { id: "g-b", name: "Grindylow", backgroundColor: "#c4473a" },
      { id: "r-a", name: "Reefclaw", backgroundColor: "#c4473a" },
      { id: "r-b", name: "Reefclaw", backgroundColor: "#c4473a" }
    ];

    const matches = matchCombatantsToTokens(combatants, tokens);
    expect(matches.get("octo")?.backgroundColor).toBe("#3caa55");
    expect(matches.get("g1")?.backgroundColor).toBe("#c4473a");
    expect(matches.get("g2")?.backgroundColor).toBe("#c4473a");
    expect(matches.get("reef")?.backgroundColor).toBe("#c4473a");
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
