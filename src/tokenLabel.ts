const SKIP_WORDS = new Set(["the", "of", "a", "an", "elite", "weak"]);
const TRAILING_INSTANCE = /^(.*?)(?:\s+\((\d+)\)|\s+(\d+))$/;

/** Monster tokens use up to three initials plus a number. PCs stay a single letter. */
export function tokenLabelFromName(name: string, options?: { singleLetter?: boolean }): string {
  const trimmed = name.trim();
  if (!trimmed) return "?";

  const match = trimmed.match(TRAILING_INSTANCE);
  const base = (match?.[1] ?? trimmed).trim();
  const number = options?.singleLetter ? "" : (match?.[2] ?? match?.[3] ?? "");
  if (options?.singleLetter) {
    return (base.match(/[A-Za-z]/)?.[0] ?? "?").toUpperCase();
  }
  const short = base.match(/^[A-Za-z]{1,3}$/);
  const letters = short
    ? short[0].toUpperCase()
    : base
        .replace(/[^a-z0-9 -]+/gi, " ")
        .split(/[\s-]+/)
        .filter(Boolean)
        .filter((word) => !SKIP_WORDS.has(word.toLowerCase()))
        .map((word) => word[0]!.toUpperCase())
        .join("")
        .slice(0, 3);

  return `${letters || "?"}${number}`;
}

/** Glyphs laid out like the SVG token: at most three letters and one number glyph. */
export function tokenGlyphs(label: string): string[] {
  const compact = label.trim().toUpperCase();
  const match = compact.match(/^([A-Z?]{1,3})(\d*)$/);
  const letters = match ? [...match[1]] : [...(compact.match(/[A-Z?]/g) ?? ["?"])].slice(0, 3);
  const number = (match ? match[2] : compact.match(/(\d+)$/)?.[1]) ?? "";
  const glyphs = number ? [...letters, number[0]!] : letters;
  return glyphs.length ? glyphs.slice(0, 4) : ["?"];
}
