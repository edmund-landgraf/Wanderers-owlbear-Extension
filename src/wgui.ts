import { getSampleEncounter } from "./sampleEncounter";
import type {
  CampaignOption,
  EncounterOption,
  EncounterSelection,
  EncounterSnapshot,
  EncounterSourceState,
  ViewerRole
} from "./types";

const encounterUrl = import.meta.env.VITE_WGUI_ENCOUNTER_URL?.trim();
const campaignsUrl = import.meta.env.VITE_WGUI_CAMPAIGNS_URL?.trim();
const encountersUrl = import.meta.env.VITE_WGUI_ENCOUNTERS_URL?.trim();

export function unwrapResponse(value: unknown): unknown {
  if (value && typeof value === "object" && "data" in value) {
    return (value as { data: unknown }).data;
  }
  return value;
}

function asStringId(value: unknown): string | null {
  if (typeof value === "string" && value.trim()) return value;
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return null;
}

function isCombatant(value: unknown): boolean {
  if (!value || typeof value !== "object") return false;
  const combatant = value as Record<string, unknown>;
  return (
    typeof combatant.id === "string" &&
    typeof combatant.name === "string" &&
    (combatant.side === "ally" || combatant.side === "enemy" || combatant.side === "neutral")
  );
}

export function isSnapshot(value: unknown): value is EncounterSnapshot {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<EncounterSnapshot>;
  return Boolean(
    candidate.encounter &&
    typeof candidate.encounter.id === "string" &&
    typeof candidate.encounter.name === "string" &&
    Array.isArray(candidate.combatants) &&
    candidate.combatants.every(isCombatant)
  );
}

function parseCampaigns(value: unknown, role: ViewerRole): CampaignOption[] {
  const payload = unwrapResponse(value);
  const rows = Array.isArray(payload)
    ? payload
    : payload && typeof payload === "object" && Array.isArray((payload as { campaigns?: unknown[] }).campaigns)
      ? (payload as { campaigns: unknown[] }).campaigns
      : [];

  return rows.flatMap((row) => {
    if (!row || typeof row !== "object") return [];
    const record = row as Record<string, unknown>;
    const id = asStringId(record.id ?? record.campaign_id);
    const name =
      typeof record.name === "string"
        ? record.name
        : typeof record.title === "string"
          ? record.title
          : null;
    if (!id || !name) return [];

    const relation =
      record.relation === "owner" || record.relation === "player"
        ? record.relation
        : role === "GM"
          ? "owner"
          : "player";

    return [{ id, name, relation } satisfies CampaignOption];
  });
}

function parseEncounters(value: unknown): EncounterOption[] {
  const payload = unwrapResponse(value);
  const rows = Array.isArray(payload)
    ? payload
    : payload && typeof payload === "object" && Array.isArray((payload as { encounters?: unknown[] }).encounters)
      ? (payload as { encounters: unknown[] }).encounters
      : [];

  return rows.flatMap((row) => {
    if (!row || typeof row !== "object") return [];
    const record = row as Record<string, unknown>;
    const id = asStringId(record.id ?? record.encounter_id ?? record.fight_id);
    const name =
      typeof record.name === "string"
        ? record.name
        : typeof record.title === "string"
          ? record.title
          : null;
    if (!id || !name) return [];

    const count =
      typeof record.combatantCount === "number"
        ? record.combatantCount
        : typeof record.combatant_count === "number"
          ? record.combatant_count
          : null;

    return [{ id, name, combatantCount: count } satisfies EncounterOption];
  });
}

async function postJson(url: string, body: unknown, signal?: AbortSignal): Promise<unknown> {
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    signal,
    body: JSON.stringify(body)
  });

  if (!response.ok) {
    throw new Error(`WGUI request failed: ${response.status}`);
  }

  return response.json();
}

export async function loadCampaignOptions(
  role: ViewerRole,
  signal?: AbortSignal
): Promise<CampaignOption[]> {
  if (!campaignsUrl) {
    return [{
      id: "23",
      name: "The Price of Prophecy (Production)",
      relation: role === "GM" ? "owner" : "player"
    }];
  }

  const campaigns = parseCampaigns(
    await postJson(campaignsUrl, { viewer_role: role }, signal),
    role
  );

  if (!campaigns.length) {
    throw new Error("No WGUI campaigns were returned for this user.");
  }

  return campaigns;
}

export async function loadEncounterOptions(
  campaignId: string,
  role: ViewerRole,
  signal?: AbortSignal
): Promise<EncounterOption[]> {
  if (!encountersUrl) {
    return [{
      id: "40",
      name: "wg combat test",
      combatantCount: 8
    }];
  }

  const url = encountersUrl.includes("{campaignId}")
    ? encountersUrl.replace("{campaignId}", encodeURIComponent(campaignId))
    : encountersUrl;

  const encounters = parseEncounters(
    await postJson(url, { campaign_id: campaignId, viewer_role: role }, signal)
  );

  if (!encounters.length) {
    throw new Error("No WGUI encounters were returned for this campaign.");
  }

  return encounters;
}

export function createEncounterRequestBody(
  role: ViewerRole,
  selection?: EncounterSelection
) {
  return {
    campaign_id: selection?.campaignId,
    fight_id: selection?.fightId,
    viewer_role: role
  };
}

export function parseEncounterResponse(value: unknown): EncounterSnapshot {
  const payload = unwrapResponse(value);
  if (!isSnapshot(payload)) {
    throw new Error("WGUI encounter endpoint returned an unexpected shape.");
  }
  return payload;
}

async function fetchLive(
  role: ViewerRole,
  selection: EncounterSelection,
  signal?: AbortSignal
): Promise<EncounterSnapshot> {
  if (!encounterUrl) throw new Error("No live encounter endpoint configured.");

  const response = await fetch(encounterUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    signal,
    body: JSON.stringify(createEncounterRequestBody(role, selection))
  });

  if (!response.ok) {
    throw new Error(`WGUI encounter request failed: ${response.status}`);
  }

  return parseEncounterResponse(await response.json());
}

export async function loadEncounter(
  role: ViewerRole,
  signal?: AbortSignal,
  selection: EncounterSelection = { campaignId: "23", fightId: "40" }
): Promise<EncounterSourceState> {
  if (!encounterUrl) {
    return {
      snapshot: getSampleEncounter(role),
      source: "sample",
      lastUpdated: new Date()
    };
  }

  const snapshot = await fetchLive(role, selection, signal);
  return {
    snapshot,
    source: "live",
    lastUpdated: new Date()
  };
}

export function getPollInterval(): number {
  const configured = Number(import.meta.env.VITE_WGUI_POLL_MS);
  return Number.isFinite(configured) && configured >= 1000 ? configured : 5000;
}
