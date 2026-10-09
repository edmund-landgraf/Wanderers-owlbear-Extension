import type { CombatantView } from "./types";
import { tokenLabelFromName } from "./tokenLabel";

export const SVG_TOKEN_CHANNEL = "com.edmundlandgraf.svgtoken.owlbear/create";

export const SVG_TOKEN_COLORS = [
  "#7c3aed",
  "#2563eb",
  "#0891b2",
  "#059669",
  "#65a30d",
  "#ca8a04",
  "#ea580c",
  "#dc2626",
  "#db2777",
  "#9333ea",
  "#475569",
  "#111827",
  "#f59e0b",
  "#22c55e",
  "#06b6d4",
  "#ef4444"
] as const;

const TRAILING_INSTANCE = /^(.*?)(?:\s+\((\d+)\)|\s+(\d+))$/;

export type MakeTokenRequest = {
  letters: string;
  color: string;
  name: string;
  copyNumber?: number;
  numberPlacement: "subscript";
};

export type CombatantTokenColor = {
  matched?: string | null;
  manual?: string | null;
  shared?: string | null;
};

export function creatureBaseName(name: string): string {
  const trimmed = name.trim();
  const match = trimmed.match(TRAILING_INSTANCE);
  return (match?.[1] ?? trimmed).trim().toLocaleLowerCase();
}

function lettersOf(name: string, singleLetter: boolean): string {
  const label = tokenLabelFromName(name, { singleLetter });
  return label.match(/^([A-Z?]{1,3})/)?.[1] ?? "?";
}

function copyFromName(name: string): number | null {
  const match = name.trim().match(TRAILING_INSTANCE);
  const raw = match?.[2] ?? match?.[3];
  const value = raw ? Number(raw) : NaN;
  return Number.isInteger(value) && value > 0 ? value : null;
}

function existingColor(colors: CombatantTokenColor | undefined): string | null {
  return colors?.matched || colors?.manual || colors?.shared || null;
}

export function planMakeTokens(
  combatants: CombatantView[],
  colors: Record<string, CombatantTokenColor>
): { tokens: MakeTokenRequest[]; colorByName: Record<string, string> } {
  const included = combatants.filter((combatant) => combatant.out !== "bench");
  const counts = new Map<string, number>();
  for (const combatant of included) {
    const base = creatureBaseName(combatant.name);
    counts.set(base, (counts.get(base) ?? 0) + 1);
  }

  const colorByBase = new Map<string, string>();
  const used = new Set<string>();
  for (const combatant of included) {
    const base = creatureBaseName(combatant.name);
    const color = existingColor(colors[combatant.id]);
    if (!color || colorByBase.has(base)) continue;
    colorByBase.set(base, color);
    used.add(color.toLowerCase());
  }

  let paletteIndex = 0;
  const nextColor = () => {
    const unused = SVG_TOKEN_COLORS.find((color) => !used.has(color.toLowerCase()));
    const color = unused ?? SVG_TOKEN_COLORS[paletteIndex % SVG_TOKEN_COLORS.length];
    paletteIndex += 1;
    used.add(color.toLowerCase());
    return color;
  };

  const assignedInGroup = new Map<string, number>();
  const colorByName: Record<string, string> = {};
  const tokens = included.map((combatant) => {
    const base = creatureBaseName(combatant.name);
    const color = colorByBase.get(base) ?? nextColor();
    colorByBase.set(base, color);
    colorByName[combatant.name] = color;

    const multiple = (counts.get(base) ?? 0) > 1;
    let copyNumber: number | undefined;
    if (multiple) {
      const fromName = copyFromName(combatant.name);
      const fallback = (assignedInGroup.get(base) ?? 0) + 1;
      assignedInGroup.set(base, fallback);
      copyNumber = fromName ?? fallback;
    }

    const request: MakeTokenRequest = {
      letters: lettersOf(combatant.name, combatant.side !== "enemy"),
      color,
      name: combatant.name,
      numberPlacement: "subscript"
    };
    if (copyNumber) request.copyNumber = copyNumber;
    return request;
  });

  return { tokens, colorByName };
}

