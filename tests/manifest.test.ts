import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const manifest = JSON.parse(readFileSync("public/manifest.json", "utf8"));

describe("Owlbear manifest", () => {
  it("uses manifest version 1 and exposes an action popover", () => {
    expect(manifest.manifest_version).toBe(1);
    expect(manifest.action).toMatchObject({
      title: "Wanderer's Guide",
      popover: "/",
      height: 760,
      width: 560
    });
  });

  it("references assets that exist in public", () => {
    expect(() => readFileSync(`public${manifest.icon}`)).not.toThrow();
    expect(() => readFileSync(`public${manifest.action.icon}`)).not.toThrow();
  });
});
