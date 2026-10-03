import { describe, expect, it } from "vitest";
import { tokenGlyphs, tokenLabelFromName } from "./tokenLabel";

describe("tokenLabelFromName", () => {
  it("keeps a short letter name and initials longer names up to three letters", () => {
    expect(tokenLabelFromName("UV")).toBe("UV");
    expect(tokenLabelFromName("Jacko")).toBe("J");
    expect(tokenLabelFromName("New Guy")).toBe("NG");
    expect(tokenLabelFromName("Blue-Ringed Octopus")).toBe("BRO");
    expect(tokenLabelFromName("Sister Mirela Voss Extra")).toBe("SMV");
  });

  it("uses one letter for PCs", () => {
    expect(tokenLabelFromName("Sister Mirela Voss", { singleLetter: true })).toBe("S");
    expect(tokenLabelFromName("New Guy", { singleLetter: true })).toBe("N");
    expect(tokenLabelFromName("Seraphina MANUAL", { singleLetter: true })).toBe("S");
  });

  it("appends a trailing instance number", () => {
    expect(tokenLabelFromName("Reefclaw 1")).toBe("R1");
    expect(tokenLabelFromName("Mudjaw Lurkbloom (2)")).toBe("ML2");
  });
});

describe("tokenGlyphs", () => {
  it("returns one glyph, a row of up to three, or three letters plus a number", () => {
    expect(tokenGlyphs("J")).toEqual(["J"]);
    expect(tokenGlyphs("UV")).toEqual(["U", "V"]);
    expect(tokenGlyphs("BRO")).toEqual(["B", "R", "O"]);
    expect(tokenGlyphs("BRO2")).toEqual(["B", "R", "O", "2"]);
  });
});
