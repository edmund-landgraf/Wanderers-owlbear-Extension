import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

function productionSourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) return productionSourceFiles(path);
    if (!/\.(?:ts|tsx)$/.test(path) || /\.test\.(?:ts|tsx)$/.test(path) || path.endsWith("vite-env.d.ts")) return [];
    return [path];
  });
}

describe("V1 read-only contract", () => {
  it("does not call Owlbear mutation APIs", () => {
    const source = productionSourceFiles("src")
      .map((path) => readFileSync(path, "utf8"))
      .join("\n")
      .replaceAll("OBR.room.setMetadata(", "");

    const forbidden = [
      ".updateItems(",
      ".addItems(",
      ".deleteItems(",
      ".setMetadata(",
      ".setName(",
      ".setColor(",
      ".setSelection(",
      ".setPermissions("
    ];

    for (const marker of forbidden) {
      expect(source, `production source must not contain Owlbear mutation call ${marker}`).not.toContain(marker);
    }
  });
});
