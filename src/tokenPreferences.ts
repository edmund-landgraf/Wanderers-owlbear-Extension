import { normalizeCombatantName } from "./tokenMatch";

const STORAGE_KEY = "wanderers-owlbear.manual-token-colors.v1";

export const TOKEN_COLOR_PALETTE = [
  "#6d28d9",
  "#2fb8d0",
  "#63df43",
  "#f5ba27",
  "#c95dde",
  "#ef3340",
  "#e66b3f",
  "#8fd340",
  "#64748b",
  "#e5e7eb"
] as const;

type ColorMap = Record<string, string>;

function readAll(): ColorMap {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed as ColorMap : {};
  } catch {
    return {};
  }
}

function preferenceKey(campaignScope: string, combatantName: string): string {
  return `${campaignScope}::${normalizeCombatantName(combatantName)}`;
}

export function getManualTokenColor(campaignScope: string, combatantName: string): string | null {
  const value = readAll()[preferenceKey(campaignScope, combatantName)];
  return typeof value === "string" ? value : null;
}

export function saveManualTokenColor(
  campaignScope: string,
  combatantName: string,
  color: string
): void {
  const all = readAll();
  all[preferenceKey(campaignScope, combatantName)] = color;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(all));
}

export function clearManualTokenColor(campaignScope: string, combatantName: string): void {
  const all = readAll();
  delete all[preferenceKey(campaignScope, combatantName)];
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(all));
}
