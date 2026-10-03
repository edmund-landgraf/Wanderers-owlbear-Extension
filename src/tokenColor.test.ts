import { describe, expect, it } from "vitest";
import { dominantColorFromPixels, extractSvgBackgroundColor } from "./tokenColor";

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

function fill(width: number, height: number, paint: (x: number, y: number) => [number, number, number, number]) {
  const pixels = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const [red, green, blue, alpha] = paint(x, y);
      const offset = (y * width + x) * 4;
      pixels[offset] = red;
      pixels[offset + 1] = green;
      pixels[offset + 2] = blue;
      pixels[offset + 3] = alpha;
    }
  }
  return pixels;
}

describe("raster token color sampling", () => {
  it("uses the colored disc behind a white letter", () => {
    const pixels = new Uint8ClampedArray([
      109, 40, 217, 255,
      255, 255, 255, 255,
      110, 41, 218, 255,
      0, 0, 0, 0
    ]);

    expect(dominantColorFromPixels(pixels)).toBe("#6d28d9");
  });

  it("uses the colored ring around a brown portrait", () => {
    const pixels = fill(20, 20, (x, y) => {
      const distance = Math.hypot(x - 9.5, y - 9.5);
      if (distance > 9.5) return [0, 0, 0, 0];
      if (distance > 7) return [196, 48, 40, 255];
      return [120, 78, 42, 255];
    });

    expect(dominantColorFromPixels(pixels, 20)).toBe("#c43028");
  });

  it("keeps a thin ring even when the rest of the edge is portrait brown", () => {
    const pixels = fill(40, 40, (x, y) => {
      const distance = Math.hypot(x - 19.5, y - 19.5);
      if (distance > 19) return [0, 0, 0, 0];
      if (distance > 17.5) return [40, 180, 70, 255];
      return [140, 90, 50, 255];
    });

    expect(dominantColorFromPixels(pixels, 40)).toBe("#28b446");
  });

  it("uses the colored disc inside a dark brown bezel", () => {
    const pixels = fill(40, 40, (x, y) => {
      const distance = Math.hypot(x - 19.5, y - 19.5);
      if (distance > 19) return [0, 0, 0, 0];
      if (distance > 16) return [72, 46, 28, 255];
      if (distance > 14.5) return [210, 210, 210, 255];
      return [124, 58, 237, 255];
    });

    expect(dominantColorFromPixels(pixels, 40)).toBe("#7c3aed");
  });
});
