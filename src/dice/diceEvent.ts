export const DICE_CHANNEL = "unwhelm.wanderers-guide/dice-roll";
export const DICE_MODAL_ID = "unwhelm.wanderers-guide/dice-animation";
export const DICE_EVENT_STORAGE = "wanderers-owlbear.dice-event";
export const DICE_MAX_AGE_MS = 10_000;

export type WgDiceThrow = {
  name: string;
  die: number;
  sides?: number;
  ally?: boolean;
  color?: string;
};

const DICE_PALETTE = [
  { diceColor: 0x2e6b8a, textColor: "#ffffff", backgroundColor: "#164e63" },
  { diceColor: 0x6b3d8a, textColor: "#ffffff", backgroundColor: "#581c87" },
  { diceColor: 0x8a5a2e, textColor: "#fff8e7", backgroundColor: "#7c3f12" },
  { diceColor: 0x2e8a5a, textColor: "#ffffff", backgroundColor: "#14532d" },
  { diceColor: 0x8a2e3d, textColor: "#ffffff", backgroundColor: "#7f1d1d" },
  { diceColor: 0x2e4a8a, textColor: "#e8f0ff", backgroundColor: "#1e3a8a" },
  { diceColor: 0x8a7a2e, textColor: "#1a1508", backgroundColor: "#854d0e" },
  { diceColor: 0x5a8a2e, textColor: "#f7fee7", backgroundColor: "#3f6212" },
  { diceColor: 0x8a2e7a, textColor: "#ffffff", backgroundColor: "#9d174d" },
  { diceColor: 0x2e8a8a, textColor: "#ffffff", backgroundColor: "#115e59" }
];

const TRAILING_INSTANCE = /^(.*?)(?:\s+\((\d+)\)|\s+(\d+))$/;

/** Same enemy label WGUI shows to players: initials, keeping a trailing copy number. */
export function playerEnemyLabel(name: string) {
  const trimmed = name.trim();
  if (!trimmed) return "";
  const match = trimmed.match(TRAILING_INSTANCE);
  const base = (match?.[1] ?? trimmed).trim();
  const paren = match?.[2];
  const spaced = match?.[3];
  const initials = base
    .split(/[\s-]+/)
    .filter(Boolean)
    .map((piece) => piece[0]!.toUpperCase())
    .join("");
  if (paren) return `${initials} (${paren})`;
  if (spaced) return `${initials}${spaced}`;
  return initials;
}

export function diceLabel(item: WgDiceThrow, role: "GM" | "PLAYER") {
  if (role === "GM" || item.ally !== false) return item.name;
  return playerEnemyLabel(item.name);
}

export type WgDiceAnimationEvent = {
  version: 1;
  eventId: string;
  kind: "initiative" | "check";
  title?: string;
  throws: WgDiceThrow[];
  audience: "public" | "gm";
  createdAt: number;
};

type LogEntry = {
  name?: unknown;
  ally?: unknown;
  calculation?: unknown;
  combatant_id?: unknown;
};

type CheckLog = {
  id?: unknown;
  title?: unknown;
  dc?: unknown;
  defaultStat?: unknown;
  audience?: unknown;
  entries?: unknown;
};

type InitiativeRound = {
  id?: unknown;
  round?: unknown;
  entries?: unknown;
};

export function clampDie(value: number, sides = 20) {
  if (!Number.isFinite(value)) return 1;
  return Math.min(sides, Math.max(1, Math.round(value)));
}

export function parseInitiativeDie(calculation: string | undefined) {
  if (!calculation) return null;
  const match = calculation.match(/d20\s*\((\d+)\)/i);
  if (!match) return null;
  const value = Number(match[1]);
  if (!Number.isFinite(value)) return null;
  return clampDie(value);
}

export function initiativeRoundDiceKey(round: { id?: string; round?: number; entries: LogEntry[] }) {
  if (round.id) return round.id;
  return `${round.round ?? ""}:${round.entries.map((entry) => `${entry.combatant_id ?? ""}:${entry.calculation ?? ""}`).join("|")}`;
}

export function diceRollLogKey(log: { id?: string; dc?: number; defaultStat?: string; entries: LogEntry[] }) {
  if (log.id) return log.id;
  return `${log.dc ?? ""}:${log.defaultStat ?? ""}:${log.entries.map((entry) => `${entry.combatant_id ?? ""}:${entry.calculation ?? ""}`).join("|")}`;
}

export function diceCheckOverlayTitle(dc: number, statLabel: string) {
  return `DC ${dc} vs ${statLabel}`;
}

function asEntries(value: unknown): LogEntry[] {
  if (!Array.isArray(value)) return [];
  return value.filter((entry): entry is LogEntry => Boolean(entry) && typeof entry === "object");
}

function throwsFromEntries(entries: LogEntry[]): WgDiceThrow[] {
  return entries.flatMap((entry) => {
    const calculation = typeof entry.calculation === "string" ? entry.calculation : undefined;
    const die = parseInitiativeDie(calculation);
    const name = typeof entry.name === "string" ? entry.name : "";
    if (die == null || !name) return [];
    const ally = typeof entry.ally === "boolean" ? entry.ally : undefined;
    return [{ name, die, sides: 20, ...(ally === undefined ? {} : { ally }) }];
  });
}

function audienceOf(value: unknown): "public" | "gm" {
  return value === "private" || value === "gm" ? "gm" : "public";
}

export function diceEventsFromEncounterMeta(meta: unknown, now: number): WgDiceAnimationEvent[] {
  if (!meta || typeof meta !== "object") return [];
  const record = meta as { initiative_log?: unknown; dice_roll_log?: unknown };
  const events: WgDiceAnimationEvent[] = [];

  if (Array.isArray(record.initiative_log)) {
    for (const item of record.initiative_log) {
      if (!item || typeof item !== "object") continue;
      const round = item as InitiativeRound;
      const entries = asEntries(round.entries);
      const throws = throwsFromEntries(entries);
      if (!throws.length) continue;
      const id = typeof round.id === "string" ? round.id : undefined;
      const roundNumber = typeof round.round === "number" ? round.round : undefined;
      events.push({
        version: 1,
        eventId: initiativeRoundDiceKey({ id, round: roundNumber, entries }),
        kind: "initiative",
        title: roundNumber != null ? `Round ${roundNumber} initiative` : "Initiative",
        throws,
        audience: "public",
        createdAt: now
      });
    }
  }

  if (Array.isArray(record.dice_roll_log)) {
    for (const item of record.dice_roll_log) {
      if (!item || typeof item !== "object") continue;
      const log = item as CheckLog;
      const entries = asEntries(log.entries);
      const throws = throwsFromEntries(entries);
      if (!throws.length) continue;
      const id = typeof log.id === "string" ? log.id : undefined;
      const dc = typeof log.dc === "number" ? log.dc : undefined;
      const stat = typeof log.defaultStat === "string" ? log.defaultStat : "";
      const title = typeof log.title === "string" && log.title
        ? log.title
        : dc != null
          ? diceCheckOverlayTitle(dc, stat || "check")
          : undefined;
      events.push({
        version: 1,
        eventId: diceRollLogKey({ id, dc, defaultStat: stat, entries }),
        kind: "check",
        title,
        throws,
        audience: audienceOf(log.audience),
        createdAt: now
      });
    }
  }

  return events;
}

export function isDiceAnimationEvent(value: unknown): value is WgDiceAnimationEvent {
  if (!value || typeof value !== "object") return false;
  const event = value as Partial<WgDiceAnimationEvent>;
  return event.version === 1
    && typeof event.eventId === "string"
    && event.eventId.length > 0
    && (event.kind === "initiative" || event.kind === "check")
    && (event.audience === "public" || event.audience === "gm")
    && typeof event.createdAt === "number"
    && Array.isArray(event.throws)
    && event.throws.length > 0
    && event.throws.every((item) =>
      item
      && typeof item.name === "string"
      && typeof item.die === "number"
      && Number.isFinite(item.die)
    );
}

export function shouldPresentDiceEvent(
  event: WgDiceAnimationEvent,
  role: "GM" | "PLAYER",
  now: number,
  seen: ReadonlySet<string>
) {
  if (seen.has(event.eventId)) return false;
  if (now - event.createdAt > DICE_MAX_AGE_MS) return false;
  if (event.audience === "gm" && role !== "GM") return false;
  return true;
}

export function diceRollConfig(throws: WgDiceThrow[]) {
  return throws.map((item, index) => ({
    dice: `d${item.sides ?? 20}` as const,
    rolled: clampDie(item.die, item.sides ?? 20),
    ...DICE_PALETTE[index % DICE_PALETTE.length]
  }));
}
