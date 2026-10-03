import { describe, expect, it } from "vitest";
import {
  diceEventsFromEncounterMeta,
  diceLabel,
  diceRollConfig,
  shouldPresentDiceEvent
} from "./diceEvent";

const now = 1_700_000_000_000;

const initiative = {
  id: "init-1",
  round: 1,
  entries: [
    { name: "Ulysses", ally: true, calculation: "d20 (17) + 3", combatant_id: "u" },
    { name: "Kotsa", ally: true, calculation: "d20 (8) + 2", combatant_id: "k" }
  ]
};

const check = {
  id: "check-1",
  title: "DC 18 vs Reflex",
  dc: 18,
  defaultStat: "reflex",
  audience: "private",
  entries: [
    { name: "Enemy 2", ally: false, calculation: "d20 (14) + 6", combatant_id: "e" }
  ]
};

describe("diceEventsFromEncounterMeta", () => {
  it("maps initiative and check logs onto specified faces", () => {
    const events = diceEventsFromEncounterMeta({
      initiative_log: [initiative],
      dice_roll_log: [check]
    }, now);

    expect(events).toEqual([
      {
        version: 1,
        eventId: "init-1",
        kind: "initiative",
        title: "Round 1 initiative",
        throws: [
          { name: "Ulysses", die: 17, sides: 20, ally: true },
          { name: "Kotsa", die: 8, sides: 20, ally: true }
        ],
        audience: "public",
        createdAt: now
      },
      {
        version: 1,
        eventId: "check-1",
        kind: "check",
        title: "DC 18 vs Reflex",
        throws: [{ name: "Enemy 2", die: 14, sides: 20, ally: false }],
        audience: "gm",
        createdAt: now
      }
    ]);
  });

  it("ignores encounter meta that has no dice logs", () => {
    expect(diceEventsFromEncounterMeta({ description: "notes" }, now)).toEqual([]);
    expect(diceEventsFromEncounterMeta(null, now)).toEqual([]);
  });
});

describe("diceRollConfig", () => {
  it("pins each die to the WGUI face", () => {
    expect(diceRollConfig([
      { name: "Ulysses", die: 17 },
      { name: "Kotsa", die: 8, sides: 20 }
    ])).toEqual([
      { dice: "d20", rolled: 17, diceColor: 0x2e6b8a, textColor: "#ffffff", backgroundColor: "#164e63" },
      { dice: "d20", rolled: 8, diceColor: 0x6b3d8a, textColor: "#ffffff", backgroundColor: "#581c87" }
    ]);
  });
});

describe("diceLabel", () => {
  it("uses the full name for allies and initials for an enemy on the player view", () => {
    expect(diceLabel({ name: "Sister Mirela Voss", die: 18, ally: true }, "PLAYER")).toBe("Sister Mirela Voss");
    expect(diceLabel({ name: "Mudjaw Lurkbloom (2)", die: 7, ally: false }, "PLAYER")).toBe("ML (2)");
    expect(diceLabel({ name: "Mudjaw Lurkbloom (2)", die: 7, ally: false }, "GM")).toBe("Mudjaw Lurkbloom (2)");
  });
});

describe("shouldPresentDiceEvent", () => {
  const event = diceEventsFromEncounterMeta({ dice_roll_log: [check] }, now)[0];

  it("hides a gm roll from players and drops stale or repeated events", () => {
    expect(shouldPresentDiceEvent(event, "PLAYER", now, new Set())).toBe(false);
    expect(shouldPresentDiceEvent(event, "GM", now, new Set())).toBe(true);
    expect(shouldPresentDiceEvent(event, "GM", now + 11_000, new Set())).toBe(false);
    expect(shouldPresentDiceEvent(event, "GM", now, new Set([event.eventId]))).toBe(false);
  });
});
