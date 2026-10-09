import { describe, expect, it } from "vitest";
import { planMakeTokens } from "./makeTokens";
import type { CombatantView } from "./types";

function combatant(name: string, side: CombatantView["side"] = "enemy", out: CombatantView["out"] = null): CombatantView {
  return { id: name, name, side, out };
}

describe("planMakeTokens", () => {
  it("numbers copies of one creature and keeps their color", () => {
    const { tokens } = planMakeTokens(
      [combatant("Zombie (1)"), combatant("Zombie (2)"), combatant("Zombie (3)")],
      {}
    );

    expect(tokens.map((token) => `${token.letters}${token.copyNumber ?? ""}`)).toEqual(["Z1", "Z2", "Z3"]);
    expect(new Set(tokens.map((token) => token.color)).size).toBe(1);
    expect(tokens.every((token) => token.numberPlacement === "subscript")).toBe(true);
  });

  it("omits the subscript when a creature appears once", () => {
    const { tokens } = planMakeTokens(
      [
        combatant("Kobold (1)"),
        combatant("Undead Soldier (1)"),
        combatant("Big Bad Guy (1)")
      ],
      {}
    );

    expect(tokens.map((token) => token.letters)).toEqual(["K", "US", "BBG"]);
    expect(tokens.map((token) => token.copyNumber)).toEqual([undefined, undefined, undefined]);
    expect(new Set(tokens.map((token) => token.color)).size).toBe(3);
  });

  it("keeps an existing color and skips benched combatants", () => {
    const { tokens, colorByName } = planMakeTokens(
      [
        combatant("Zombie (1)"),
        combatant("Zombie (2)"),
        combatant("Bench Guy", "enemy", "bench")
      ],
      { "Zombie (2)": { manual: "#112233" } }
    );

    expect(tokens).toHaveLength(2);
    expect(tokens.every((token) => token.color === "#112233")).toBe(true);
    expect(colorByName).toEqual({ "Zombie (1)": "#112233", "Zombie (2)": "#112233" });
  });

  it("uses one letter for a player character", () => {
    const { tokens } = planMakeTokens([combatant("Sister Mirela Voss", "ally")], {});
    expect(tokens[0]?.letters).toBe("S");
    expect(tokens[0]?.copyNumber).toBeUndefined();
  });
});
