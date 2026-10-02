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

type RawEntity = {
  id?: number | string;
  name?: string;
  level?: number | null;
  hp_current?: number | null;
  hp_temp?: number | null;
  details?: {
    conditions?: Array<{ name?: string; value?: string | number | null }>;
  } | null;
  meta_data?: {
    calculated_stats?: {
      hp_max?: number | null;
      ac?: number | null;
      profs?: Record<string, { total?: number | null }>;
    } | null;
  } | null;
};

type RawCharacter = RawEntity & {
  campaign_id?: number | string | null;
};

type RawCombatant = {
  _id?: string;
  id?: string | number;
  type?: "CREATURE" | "CHARACTER" | "HAZARD";
  ally?: boolean;
  initiative?: number | null;
  character?: number | string | null;
  creature?: RawEntity | null;
  data?: RawEntity | null;
  active?: boolean;
  out?: "dead" | "incapacitated" | null;
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
    list?: RawCombatant[];
  };
  meta_data?: {
    description?: string | null;
    round?: number | null;
    round_number?: number | null;
  } | null;
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

function conditionLabels(entity: RawEntity | null | undefined): string[] {
  return (entity?.details?.conditions ?? [])
    .flatMap((condition) => {
      const name = typeof condition?.name === "string" ? condition.name.trim() : "";
      if (!name) return [];
      const value = condition.value;
      return [value === undefined || value === null || value === "" ? name : `${name} ${value}`];
    });
}

function numericStat(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function entityToCombatantView(
  combatant: RawCombatant,
  entity: RawEntity | null | undefined
): import("./types").CombatantView | null {
  const name = typeof entity?.name === "string" && entity.name.trim()
    ? entity.name.trim()
    : null;
  if (!name) return null;

  const stats = entity?.meta_data?.calculated_stats;
  const profs = stats?.profs;
  const hpCurrent = numericStat(entity?.hp_current);
  const hpMax = numericStat(stats?.hp_max) ?? hpCurrent;
  const hpTemp = numericStat(entity?.hp_temp);

  return {
    id: combatant._id || String(combatant.id ?? `${combatant.type ?? "combatant"}-${name}`),
    characterId: combatant.type === "CHARACTER" && combatant.character != null
      ? String(combatant.character)
      : null,
    name,
    initial: name.slice(0, 1).toUpperCase(),
    side: combatant.ally ? "ally" : combatant.type === "CHARACTER" ? "neutral" : "enemy",
    level: numericStat(entity?.level),
    initiative: numericStat(combatant.initiative),
    hp: hpCurrent !== null || hpMax !== null
      ? { current: hpCurrent, max: hpMax, temp: hpTemp }
      : null,
    ac: numericStat(stats?.ac),
    perception: numericStat(profs?.PERCEPTION?.total),
    saves: {
      fortitude: numericStat(profs?.SAVE_FORT?.total),
      reflex: numericStat(profs?.SAVE_REFLEX?.total),
      will: numericStat(profs?.SAVE_WILL?.total)
    },
    conditions: conditionLabels(entity),
    active: combatant.active === true,
    out: combatant.out === "dead" || combatant.out === "incapacitated" ? combatant.out : null
  };
}

export function normalizeWguiEncounter(
  encounter: RawEncounter,
  roster: RawCharacter[],
  campaignName?: string | null
): EncounterSnapshot {
  const rosterById = new Map(
    roster.flatMap((character) => {
      const id = asStringId(character.id);
      return id ? [[id, character] as const] : [];
    })
  );

  const combatants = (encounter.combatants?.list ?? []).flatMap((combatant) => {
    const characterId = asStringId(combatant.character);
    const entity = combatant.type === "CHARACTER"
      ? (characterId ? rosterById.get(characterId) : undefined) ?? combatant.data
      : combatant.creature ?? combatant.data;

    const normalized = entityToCombatantView(combatant, entity);
    return normalized ? [normalized] : [];
  });

  return {
    encounter: {
      id: asStringId(encounter.id ?? encounter.encounter_id ?? encounter.fight_id) ?? "unknown",
      name: encounter.name ?? encounter.title ?? "Encounter",
      campaignName: campaignName ?? null,
      location: encounter.meta_data?.description ?? null,
      round: numericStat(encounter.meta_data?.round ?? encounter.meta_data?.round_number),
      updatedAt: null
    },
    combatants
  };
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
    throw new Error("Wanderer's Guide is not configured.");
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
    throw new Error("Wanderer's Guide is not configured.");
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

function projectEncounterForRole(
  role: ViewerRole,
  snapshot: EncounterSnapshot
): EncounterSnapshot {
  if (role === "GM") return snapshot;

  return {
    ...snapshot,
    combatants: snapshot.combatants.map((combatant) => {
      if (combatant.side !== "enemy") return combatant;
      const current = combatant.hp?.current ?? null;
      const max = combatant.hp?.max ?? null;
      const ratio = current !== null && max ? current / max : null;
      const state = ratio === null
        ? null
        : ratio <= 0
          ? "Down"
          : ratio < 0.25
            ? "Badly injured"
            : ratio < 0.75
              ? "Injured"
              : "Healthy";

      return {
        id: combatant.id,
        name: combatant.name,
        initial: combatant.initial,
        side: combatant.side,
        initiative: combatant.initiative,
        hp: { state },
        conditions: combatant.conditions,
        active: combatant.active
      };
    })
  };
}

export async function loadEncounter(
  role: ViewerRole,
  signal: AbortSignal | undefined,
  selection: EncounterSelection,
  session?: WguiSession | null,
  campaignName?: string | null
): Promise<EncounterSourceState> {
  if (isWguiBackendConfigured()) {
    if (!session) throw new Error("Sign in to Wanderer's Guide to load the encounter.");

    const campaignId = Number(selection.campaignId);
    const encounterId = Number(selection.fightId);
    if (!Number.isFinite(campaignId) || !Number.isFinite(encounterId)) {
      throw new Error("WGUI campaign or encounter id is invalid.");
    }

    const [encounterRows, rosterRows] = await Promise.all([
      invokeWguiFunction<RawEncounter | RawEncounter[]>(
        "wgui-ext-find-encounter",
        { campaign_id: campaignId, id: encounterId },
        session.accessToken
      ),
      invokeWguiFunction<RawCharacter | RawCharacter[]>(
        "wgui-ext-find-campaign-characters",
        { campaign_id: campaignId },
        session.accessToken
      )
    ]);

    const encounter = asList(encounterRows).find(
      (row) => asStringId(row.id ?? row.encounter_id ?? row.fight_id) === selection.fightId
    );

    if (!encounter) {
      throw new Error("The selected WGUI encounter is not visible to this account.");
    }

    return {
      snapshot: normalizeWguiEncounter(encounter, asList(rosterRows), campaignName),
      source: "live",
      lastUpdated: new Date()
    };
  }

  if (!encounterUrl) {
    throw new Error("Wanderer's Guide is not configured.");
  }

  const snapshot = await fetchLive(role, selection, signal);
  return {
    snapshot: projectEncounterForRole(role, snapshot),
    source: "live",
    lastUpdated: new Date()
  };
}

export function getPollInterval(): number {
  const configured = Number(import.meta.env.VITE_WGUI_POLL_MS);
  return Number.isFinite(configured) && configured >= 1000 ? configured : 5000;
}
