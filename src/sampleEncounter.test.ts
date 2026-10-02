import { describe, expect, it } from "vitest";
import { getSampleEncounter } from "./sampleEncounter";

describe("sample encounter projections", () => {
  it("keeps the same combatant roster for GM and player", () => {
    const gm = getSampleEncounter("GM");
    const player = getSampleEncounter("PLAYER");

    expect(player.combatants.map((c) => c.id)).toEqual(gm.combatants.map((c) => c.id));
  });

  it("exposes full enemy data to the GM", () => {
    const hadrosaurid = getSampleEncounter("GM").combatants.find((c) => c.id === "hadrosaurid");

    expect(hadrosaurid).toMatchObject({
      name: "Hadrosaurid",
      level: 4,
      ac: 18,
      hp: { current: 40, max: 59 },
      perception: 8,
      saves: { fortitude: 11, reflex: 8, will: 7 }
    });
  });

  it("removes exact enemy statistics from the player projection", () => {
    const hadrosaurid = getSampleEncounter("PLAYER").combatants.find((c) => c.id === "hadrosaurid");

    expect(hadrosaurid).toBeDefined();
    expect(hadrosaurid?.level).toBeUndefined();
    expect(hadrosaurid?.ac).toBeUndefined();
    expect(hadrosaurid?.perception).toBeUndefined();
    expect(hadrosaurid?.saves).toBeUndefined();
    expect(hadrosaurid?.hp).toEqual({ state: "Injured" });
    expect(hadrosaurid?.conditions).toEqual(["Frightened 1"]);
  });

  it("does not redact allied player-character data", () => {
    const ulysses = getSampleEncounter("PLAYER").combatants.find((c) => c.id === "ulysses");

    expect(ulysses).toMatchObject({
      level: 1,
      ac: 18,
      hp: { current: 23, max: 23 },
      perception: 6
    });
  });
});
