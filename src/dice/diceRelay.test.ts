import { describe, expect, it } from "vitest";
import { createDiceRelay } from "./diceRelay";

const meta = {
  dice_roll_log: [{
    id: "check-1",
    title: "Perception",
    dc: 15,
    defaultStat: "perception",
    audience: "public",
    entries: [{ name: "Ulysses", calculation: "d20 (12) + 5" }]
  }]
};

describe("createDiceRelay", () => {
  it("does not announce rolls that were already on the encounter", () => {
    const relay = createDiceRelay(() => 1_000);
    expect(relay.takeNew(meta)).toEqual([]);
    expect(relay.takeNew(meta)).toEqual([]);
  });

  it("waits to seed until an encounter payload arrives", () => {
    const relay = createDiceRelay(() => 1_000);
    expect(relay.takeNew(null)).toEqual([]);
    const next = relay.takeNew(meta);
    expect(next).toEqual([]);
    expect(relay.takeNew(meta)).toEqual([]);
  });

  it("announces a log that appears after the first read", () => {
    const relay = createDiceRelay(() => 1_000);
    relay.seed({ dice_roll_log: [] });
    const next = relay.takeNew(meta);
    expect(next).toHaveLength(1);
    expect(next[0].throws).toEqual([{ name: "Ulysses", die: 12, sides: 20 }]);
    expect(relay.takeNew(meta)).toEqual([]);
  });
});
