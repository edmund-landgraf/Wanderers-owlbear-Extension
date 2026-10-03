export type ViewerRole = "GM" | "PLAYER";

export type CampaignOption = {
  id: string;
  name: string;
  relation?: "owner" | "player" | null;
};

export type EncounterOption = {
  id: string;
  name: string;
  combatantCount?: number | null;
};

export type EncounterSelection = {
  campaignId: string;
  fightId: string;
};

export type HpView = {
  current?: number | null;
  max?: number | null;
  temp?: number | null;
  state?: string | null;
};

export type CombatantView = {
  id: string;
  characterId?: string | null;
  name: string;
  initial?: string | null;
  side: "ally" | "enemy" | "neutral";
  level?: number | null;
  initiative?: number | null;
  hp?: HpView | null;
  ac?: number | null;
  perception?: number | null;
  saves?: {
    fortitude?: number | null;
    reflex?: number | null;
    will?: number | null;
  } | null;
  conditions?: string[];
  active?: boolean;
  out?: "dead" | "incapacitated" | "bench" | null;
};

export type EncounterSnapshot = {
  encounter: {
    id: string;
    name: string;
    campaignName?: string | null;
    location?: string | null;
    round?: number | null;
    updatedAt?: string | null;
  };
  combatants: CombatantView[];
};

export type EncounterSourceState = {
  snapshot: EncounterSnapshot;
  source: "live";
  lastUpdated: Date;
};
