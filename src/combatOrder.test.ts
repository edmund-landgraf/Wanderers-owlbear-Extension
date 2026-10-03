import { describe, expect, it } from "vitest";
import { compareCombatants } from "./combatOrder";
import type { CombatantView } from "./types";

function combatant(id: string, initiative: number | null, side: CombatantView["side"]): CombatantView {
  return { id, name: id, side, initiative };
}

describe("compareCombatants", () => {
  it("orders higher initiative first", () => {
    const ordered = [combatant("low", 10, "ally"), combatant("high", 20, "enemy")].sort(compareCombatants);
    expect(ordered.map((entry) => entry.id)).toEqual(["high", "low"]);
  });

  it("lets allies win ties against enemies and neutrals", () => {
    const ordered = [
      combatant("uv", 20, "enemy"),
      combatant("jacko", 20, "ally"),
      combatant("bystander", 20, "neutral")
    ].sort(compareCombatants);
    expect(ordered.map((entry) => entry.id)).toEqual(["jacko", "bystander", "uv"]);
  });

  it("keeps source order when two allies tie", () => {
    const ordered = [combatant("first", 12, "ally"), combatant("second", 12, "ally")].sort(compareCombatants);
    expect(ordered.map((entry) => entry.id)).toEqual(["first", "second"]);
  });
});
