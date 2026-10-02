// @vitest-environment jsdom

import { beforeEach, describe, expect, it } from "vitest";
import {
  clearManualTokenColor,
  getManualTokenColor,
  saveManualTokenColor
} from "./tokenPreferences";

describe("manual token colors", () => {
  beforeEach(() => window.localStorage.clear());

  it("persists a manual color by campaign and normalized combatant name", () => {
    saveManualTokenColor("campaign-23", " Ulysses ", "#6d28d9");
    expect(getManualTokenColor("campaign-23", "ulysses")).toBe("#6d28d9");
  });

  it("keeps campaigns independent", () => {
    saveManualTokenColor("campaign-23", "Guard", "#ef3340");
    expect(getManualTokenColor("campaign-99", "Guard")).toBeNull();
  });

  it("can clear a saved fallback", () => {
    saveManualTokenColor("campaign-23", "Kota", "#2fb8d0");
    clearManualTokenColor("campaign-23", "Kota");
    expect(getManualTokenColor("campaign-23", "Kota")).toBeNull();
  });
});
