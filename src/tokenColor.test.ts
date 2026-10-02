import { describe, expect, it } from "vitest";
import { extractSvgBackgroundColor } from "./tokenColor";

describe("SVG token color extraction", () => {
  it("uses the first non-white SVG fill as the React circle background", () => {
    expect(extractSvgBackgroundColor(
      '<svg><circle fill="#6d28d9"/><text fill="#ffffff">U</text></svg>'
    )).toBe("#6d28d9");
  });

  it("ignores white and none fills", () => {
    expect(extractSvgBackgroundColor(
      '<svg><path fill="none"/><circle fill="#fff"/><circle fill="#2fb8d0"/></svg>'
    )).toBe("#2fb8d0");
  });

  it("supports fill declarations in style attributes", () => {
    expect(extractSvgBackgroundColor(
      '<svg><circle style="stroke:#fff; fill: #63df43;"/></svg>'
    )).toBe("#63df43");
  });

  it("returns null when there is no usable background fill", () => {
    expect(extractSvgBackgroundColor(
      '<svg><circle fill="#ffffff"/></svg>'
    )).toBeNull();
  });
});
