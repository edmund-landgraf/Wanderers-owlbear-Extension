import { getSampleEncounter } from "./sampleEncounter";
import {
  invokeWguiFunction,
  isWguiBackendConfigured,
  type WguiSession
} from "./wguiAuth";
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

type RawCampaign = {
  id?: number | string;
  campaign_id?: number | string;
  user_id?: string | null;
  name?: string;
  title?: string;
};

type RawCharacter = {
  id?: number | string;
  campaign_id?: number | string | null;
};

type RawEncounter = {
  id?: number | string;
  encounter_id?: number | string;
  fight_id?: number | string;
  campaign_id?: number | string | null;
  name?: string;
  title?: string;
  combatantCount?: number;
  combatant_count?: number;
  combatants?: {
    list?: unknown[];
  };
};

export function unwrapResponse(value: unknown): unknown {
  if (value && typeof value === "object" && "data" in value) {
    return (value as { data: unknown }).data;
  }
  return value;
}

function asList<T>(value: T | T[] | null | undefined): T[] {
  if (value == null) return [];
  return Array.isArray(value) ? value : [value];
}

function asStringId(value: unknown): string | null {
  if (typeof value === "string" && value.trim()) return value;
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return null;
}

function sameUserId(a: string | null | undefined, b: string | null | undefined): boolean {
  if (!a || !b) return false;
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

function campaignOption(
  campaign: RawCampaign,
  relation: "owner" | "player"
): CampaignOption | null {
  const id = asStringId(campaign.id ?? campaign.campaign_id);
  const name =
    typeof campaign.name === "string"
      ? campaign.name
      : typeof campaign.title === "string"
        ? campaign.title
        : null;

  if (!id || !name) return null;
  return { id, name, relation };
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

export function parseEncounters(value: unknown): EncounterOption[] {
  const payload = unwrapResponse(value);
  const rows = Array.isArray(payload)
    ? payload
    : payload && typeof payload === "object" && Array.isArray((payload as { encounters?: unknown[] }).encounters)
      ? (payload as { encounters: unknown[] }).encounters
      : [];

  return rows.flatMap((row) => {
    if (!row || typeof row !== "object") return [];
    const record = row as RawEncounter;
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
          : Array.isArray(record.combatants?.list)
            ? record.combatants!.list!.length
            : null;

    return [{ id, name, combatantCount: count } satisfies EncounterOption];
  });
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

async function loadSupabaseCampaignOptions(
  role: ViewerRole,
  session: WguiSession
): Promise<CampaignOption[]> {
  const ownedRows = asList(
    await invokeWguiFunction<RawCampaign | RawCampaign[]>(
      "find-campaign",
      { user_id: session.userId },
      session.accessToken
    )
  );

  const characters = asList(
    await invokeWguiFunction<RawCharacter | RawCharacter[]>(
      "find-character",
      { user_id: session.userId },
      session.accessToken
    )
  );

  const joinedIds = [...new Set(
    characters
      .map((character) => asStringId(character.campaign_id))
      .filter((id): id is string => id !== null)
  )];

  const joinedRows = (
    await Promise.all(
      joinedIds.map(async (id) => {
        try {
          return asList(
            await invokeWguiFunction<RawCampaign | RawCampaign[]>(
              "find-campaign",
              { id: Number(id) },
              session.accessToken
            )
          );
        } catch {
          return [];
        }
      })
    )
  ).flat();

  const options = new Map<string, CampaignOption>();

  for (const row of joinedRows) {
    const relation = sameUserId(row.user_id, session.userId) ? "owner" : "player";
    const option = campaignOption(row, relation);
    if (option) options.set(option.id, option);
  }

  for (const row of ownedRows) {
    const option = campaignOption(row, "owner");
    if (option) options.set(option.id, option);
  }

  const all = [...options.values()].sort((a, b) => a.name.localeCompare(b.name));

  return role === "GM"
    ? all.filter((campaign) => campaign.relation === "owner")
    : all.filter((campaign) => campaign.relation === "player");
}

export async function loadCampaignOptions(
  role: ViewerRole,
  signal?: AbortSignal,
  session?: WguiSession | null
): Promise<CampaignOption[]> {
  if (isWguiBackendConfigured()) {
    if (!session) throw new Error("Sign in to Wanderer's Guide to load campaigns.");
    const campaigns = await loadSupabaseCampaignOptions(role, session);
    if (!campaigns.length) {
      throw new Error(
        role === "GM"
          ? "No owned WGUI campaigns were found for this account."
          : "No joined WGUI campaigns were found for this account."
      );
    }
    return campaigns;
  }

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
  signal?: AbortSignal,
  session?: WguiSession | null
): Promise<EncounterOption[]> {
  if (isWguiBackendConfigured()) {
    if (!session) throw new Error("Sign in to Wanderer's Guide to load encounters.");

    const campaignNumber = Number(campaignId);
    if (!Number.isFinite(campaignNumber)) {
      throw new Error("WGUI campaign id is invalid.");
    }

    const rows = await invokeWguiFunction<RawEncounter | RawEncounter[]>(
      "wgui-ext-find-encounter",
      { campaign_id: campaignNumber },
      session.accessToken
    );

    const encounters = parseEncounters(asList(rows));
    if (!encounters.length) {
      throw new Error("No visible encounters were returned for this campaign.");
    }
    return encounters;
  }

  if (!encountersUrl) {
    return [
      { id: "40", name: "wg combat test", combatantCount: 8 },
      { id: "sample-getting-darkwood", name: "Getting the Darkwood", combatantCount: 13 },
      { id: "sample-test-2", name: "test 2", combatantCount: 7 }
    ];
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
      snapshot: getSampleEncounter(role, selection.fightId),
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
