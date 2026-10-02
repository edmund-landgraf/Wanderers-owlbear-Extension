import type { EncounterSnapshot, ViewerRole } from "./types";

const full: EncounterSnapshot = {
  encounter: {
    id: "sample-wg-combat-test",
    name: "wg combat test",
    campaignName: "The Price of Prophecy (Production)",
    location: "Reiver's Right",
    round: 3,
  },
  combatants: [
    { id: "palace-guard", name: "Palace Guard", initial: "P", side: "enemy", level: 4, initiative: 25, ac: 21, hp: { current: 58, max: 72 }, perception: 15, saves: { fortitude: 12, reflex: 9, will: 10 }, conditions: [] },
    { id: "doku", characterId: "doku", name: "Doku", initial: "D", side: "ally", level: 2, initiative: 20, ac: 18, hp: { current: 27, max: 27 }, perception: 4, saves: { fortitude: 7, reflex: 6, will: 5 }, conditions: [] },
    { id: "skye", characterId: "skye", name: "Skye Flamebelch", initial: "S", side: "ally", level: 1, initiative: 18, ac: 18, hp: { current: 23, max: 23 }, perception: 2, saves: { fortitude: 5, reflex: 7, will: 4 }, conditions: [] },
    { id: "quinn", characterId: "quinn", name: "Quinn", initial: "Q", side: "ally", level: 1, initiative: 17, ac: 17, hp: { current: 19, max: 19 }, perception: 5, saves: { fortitude: 5, reflex: 7, will: 6 }, conditions: [] },
    { id: "hadrosaurid", name: "Hadrosaurid", initial: "H", side: "enemy", level: 4, initiative: 16, ac: 18, hp: { current: 40, max: 59 }, perception: 8, saves: { fortitude: 11, reflex: 8, will: 7 }, conditions: ["Frightened 1"] },
    { id: "ulysses", characterId: "ulysses", name: "Ulysses", initial: "U", side: "ally", level: 1, initiative: 14, ac: 18, hp: { current: 23, max: 23 }, perception: 6, saves: { fortitude: 7, reflex: 5, will: 4 }, conditions: [] },
    { id: "malkus", characterId: "malkus", name: "Malkus", initial: "M", side: "ally", level: 1, initiative: 10, ac: 17, hp: { current: 20, max: 20 }, perception: 5, saves: { fortitude: 6, reflex: 5, will: 6 }, conditions: [] },
    { id: "kota", characterId: "kota", name: "Kota", initial: "K", side: "ally", level: 2, initiative: 5, ac: 19, hp: { current: 24, max: 24 }, perception: 5, saves: { fortitude: 8, reflex: 6, will: 5 }, conditions: [] }
  ]
};

export function getSampleEncounter(role: ViewerRole): EncounterSnapshot {
  if (role === "GM") return full;

  return {
    ...full,
    combatants: full.combatants.map((combatant) => {
      if (combatant.side !== "enemy") return combatant;
      const current = combatant.hp?.current ?? null;
      const max = combatant.hp?.max ?? null;
      const ratio = current !== null && max ? current / max : null;
      const state = ratio === null
        ? null
        : ratio <= 0
          ? "Down"
          : ratio < 0.25
            ? "Badly injured"
            : ratio < 0.75
              ? "Injured"
              : "Healthy";

      return {
        id: combatant.id,
        name: combatant.name,
        initial: combatant.initial,
        side: combatant.side,
        initiative: combatant.initiative,
        hp: { state },
        conditions: combatant.conditions,
        active: combatant.active
      };
    })
  };
}
