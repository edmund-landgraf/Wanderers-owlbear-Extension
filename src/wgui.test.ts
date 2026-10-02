import { describe, expect, it } from "vitest";
import { isSnapshot, parseEncounterResponse, unwrapResponse } from "./wgui";

const snapshot = {
  encounter: {
    id: "40",
    name: "Reiver's Right",
    round: 3
  },
  combatants: [
    {
      id: "u",
      name: "Ulysses",
      side: "ally",
      initiative: 14
    }
  ]
};

describe("WGUI feed parsing", () => {
  it("accepts a direct encounter snapshot", () => {
    expect(isSnapshot(snapshot)).toBe(true);
    expect(parseEncounterResponse(snapshot)).toEqual(snapshot);
  });

  it("accepts a JSend-style data wrapper", () => {
    expect(unwrapResponse({ data: snapshot })).toEqual(snapshot);
    expect(parseEncounterResponse({ data: snapshot })).toEqual(snapshot);
  });

  it.each([
    null,
    {},
    { encounter: null, combatants: [] },
    { encounter: { id: 40, name: "wrong id type" }, combatants: [] },
    { encounter: { id: "40", name: "missing combatants" } },
    { data: { status: "success" } }
  ])("rejects malformed payload %#", (payload) => {
    expect(() => parseEncounterResponse(payload)).toThrow(
      "WGUI encounter endpoint returned an unexpected shape."
    );
  });
});
