import { getSampleEncounter } from "./sampleEncounter";
import type { EncounterSnapshot, EncounterSourceState, ViewerRole } from "./types";

const encounterUrl = import.meta.env.VITE_WGUI_ENCOUNTER_URL?.trim();
const campaignId = import.meta.env.VITE_WGUI_CAMPAIGN_ID?.trim();
const fightId = import.meta.env.VITE_WGUI_FIGHT_ID?.trim();
const bearer = import.meta.env.VITE_WGUI_BEARER_TOKEN?.trim();

export function unwrapResponse(value: unknown): unknown {
  if (value && typeof value === "object" && "data" in value) {
    return (value as { data: unknown }).data;
  }
  return value;
}

export function isSnapshot(value: unknown): value is EncounterSnapshot {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<EncounterSnapshot>;
  return Boolean(
    candidate.encounter &&
    typeof candidate.encounter.id === "string" &&
    typeof candidate.encounter.name === "string" &&
    Array.isArray(candidate.combatants)
  );
}

export function createEncounterRequestBody(role: ViewerRole) {
  return {
    campaign_id: campaignId || undefined,
    fight_id: fightId || undefined,
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

async function fetchLive(role: ViewerRole, signal?: AbortSignal): Promise<EncounterSnapshot> {
  if (!encounterUrl) throw new Error("No live encounter endpoint configured.");

  const headers: Record<string, string> = {
    "Content-Type": "application/json"
  };
  if (bearer) headers.Authorization = `Bearer ${bearer}`;

  const response = await fetch(encounterUrl, {
    method: "POST",
    headers,
    signal,
    body: JSON.stringify(createEncounterRequestBody(role))
  });

  if (!response.ok) {
    throw new Error(`WGUI encounter request failed: ${response.status}`);
  }

  return parseEncounterResponse(await response.json());
}

export async function loadEncounter(role: ViewerRole, signal?: AbortSignal): Promise<EncounterSourceState> {
  if (!encounterUrl) {
    return {
      snapshot: getSampleEncounter(role),
      source: "sample",
      lastUpdated: new Date()
    };
  }

  const snapshot = await fetchLive(role, signal);
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
