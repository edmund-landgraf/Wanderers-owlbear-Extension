import { useEffect, useMemo, useRef, useState } from "react";
import type {
  CampaignOption,
  CombatantView,
  EncounterOption,
  EncounterSourceState,
  ViewerRole
} from "./types";
import {
  getSceneTokenVisuals,
  getViewerRole,
  isOwlbearAvailable,
  publishManualTokenColorBook,
  publishSharedTokenColors,
  sharedTokenColorKey,
  subscribeToManualTokenColorBook,
  subscribeToSharedTokenColors,
  subscribeToViewerRole,
  type SharedTokenColorMap
} from "./owbear";
import {
  buildTokenColorMatches,
  type OwlbearTokenVisual,
  type TokenColorMatch
} from "./tokenMatch";
import {
  getManualTokenColor,
  readManualTokenColors,
  saveManualTokenColor,
  TOKEN_COLOR_PALETTE,
  writeManualTokenColors
} from "./tokenPreferences";
import {
  getPollInterval,
  loadCampaignOptions,
  loadEncounter,
  loadEncounterOptions
} from "./wgui";
import {
  acceptWguiAuthMessage,
  getWguiSession,
  isWguiBackendConfigured,
  signOutOfWgui,
  startWguiAuth,
  subscribeToWguiSession,
  type WguiSession
} from "./wguiAuth";

const SELECTION_KEY = "wanderers-owlbear-selection-local";

function readSelection(): { campaignId: string; encounterId: string } {
  try {
    const raw = localStorage.getItem(SELECTION_KEY);
    if (!raw) return { campaignId: "", encounterId: "" };
    const parsed = JSON.parse(raw) as { campaignId?: unknown; encounterId?: unknown };
    return {
      campaignId: typeof parsed.campaignId === "string" ? parsed.campaignId : "",
      encounterId: typeof parsed.encounterId === "string" ? parsed.encounterId : ""
    };
  } catch {
    return { campaignId: "", encounterId: "" };
  }
}

function writeSelection(campaignId: string, encounterId: string) {
  try {
    localStorage.setItem(SELECTION_KEY, JSON.stringify({ campaignId, encounterId }));
  } catch {
    // Private mode keeps the choice for this page load only.
  }
}

function campaignAccessDenied(message: string) {
  return /do not have access to this campaign/i.test(message);
}

function signed(value?: number | null) {
  if (value === null || value === undefined) return "—";
  return value >= 0 ? `+${value}` : String(value);
}

function hpLabel(combatant: CombatantView) {
  const hp = combatant.hp;
  if (!hp) return "—";
  if (hp.current !== undefined && hp.current !== null && hp.max !== undefined && hp.max !== null) {
    const temp = hp.temp ? ` +${hp.temp}` : "";
    return `${hp.current} / ${hp.max}${temp}`;
  }
  return hp.state ?? "—";
}

function playerEnemy(role: ViewerRole, combatant: CombatantView) {
  return role === "PLAYER" && combatant.side === "enemy";
}

/** WGUI player view shows hidden creatures as initials (Unspooled Vestige → UV). */
function playerEnemyName(name: string) {
  const initials = name
    .split(/\s+/)
    .map((word) => word.match(/[A-Za-z0-9]/)?.[0] ?? "")
    .join("")
    .toUpperCase();
  return initials || "?";
}

function TokenAvatar({
  combatant,
  tokenVisual,
  manualColor
}: {
  combatant: CombatantView;
  tokenVisual?: OwlbearTokenVisual;
  manualColor: string | null;
}) {
  const initial = (combatant.initial || combatant.name.slice(0, 1) || "?").toUpperCase();
  const automaticColor = tokenVisual?.backgroundColor ?? null;
  const background = automaticColor ?? manualColor ?? "#334155";
  const mode = automaticColor ? "Matched token color" : manualColor ? "Manual token color" : "No token color";

  return (
    <div
      className={`initial-token ${automaticColor ? "matched-token-color" : manualColor ? "manual-token-color" : "unmatched-token"}`}
      style={{ background }}
      title={tokenVisual ? `${mode}: ${tokenVisual.name}` : mode}
      aria-hidden="true"
    >
      {initial}
    </div>
  );
}

function TokenColorEditor({
  displayName,
  tokenVisual,
  manualColor,
  onColorChange
}: {
  displayName: string;
  tokenVisual?: OwlbearTokenVisual;
  manualColor: string | null;
  onColorChange: (color: string) => void;
}) {
  if (tokenVisual?.backgroundColor) return null;

  const explanation = tokenVisual
    ? `Matched ${displayName}, but its SVG background color could not be read. Pick the visible map color.`
    : `No exact Owlbear token match for ${displayName}. Pick the visible map color.`;

  return (
    <div className="token-color-editor">
      <div className="token-color-copy">
        <span className="detail-label">Token color</span>
        <span className="muted">{explanation}</span>
      </div>

      <div className="token-color-palette" role="group" aria-label={`Token color for ${displayName}`}>
        {TOKEN_COLOR_PALETTE.map((color) => (
          <button
            key={color}
            type="button"
            className={`token-color-choice ${manualColor === color ? "selected" : ""}`}
            style={{ background: color }}
            aria-label={`Set ${displayName} token color to ${color}`}
            aria-pressed={manualColor === color}
            onClick={() => onColorChange(color)}
          />
        ))}
      </div>
    </div>
  );
}

function DetailPanel({
  combatant,
  role,
  tokenVisual,
  manualColor,
  onColorChange
}: {
  combatant: CombatantView;
  role: ViewerRole;
  tokenVisual?: OwlbearTokenVisual;
  manualColor: string | null;
  onColorChange: (color: string) => void;
}) {
  const saves = combatant.saves;
  const enemyFiltered = playerEnemy(role, combatant);
  const shownName = enemyFiltered ? playerEnemyName(combatant.name) : combatant.name;

  return (
    <div className="combatant-detail">
      <div className="detail-grid">
        <div>
          <span>HP</span>
          <strong>{enemyFiltered ? "—" : hpLabel(combatant)}</strong>
        </div>
        <div>
          <span>AC</span>
          <strong>{enemyFiltered ? "—" : combatant.ac ?? "—"}</strong>
        </div>
        <div>
          <span>Perception</span>
          <strong>{enemyFiltered ? "—" : signed(combatant.perception)}</strong>
        </div>
      </div>

      {!enemyFiltered && saves && (
        <div className="save-strip">
          <span>FORT <strong>{signed(saves.fortitude)}</strong></span>
          <span>REF <strong>{signed(saves.reflex)}</strong></span>
          <span>WILL <strong>{signed(saves.will)}</strong></span>
        </div>
      )}

      <div className="detail-conditions">
        <span className="detail-label">Conditions</span>
        {combatant.conditions?.length ? (
          <div className="condition-list">
            {combatant.conditions.map((condition, index) => (
              <span className="condition-chip" key={`${condition}-${index}`}>{condition}</span>
            ))}
          </div>
        ) : (
          <span className="muted">None</span>
        )}
      </div>

      {role === "GM" && (
        <TokenColorEditor
          displayName={shownName}
          tokenVisual={tokenVisual}
          manualColor={manualColor}
          onColorChange={onColorChange}
        />
      )}
    </div>
  );
}

function CombatantRow({
  combatant,
  role,
  open,
  onToggle,
  tokenVisual,
  manualColor,
  onColorChange
}: {
  combatant: CombatantView;
  role: ViewerRole;
  open: boolean;
  onToggle: () => void;
  tokenVisual?: OwlbearTokenVisual;
  manualColor: string | null;
  onColorChange: (color: string) => void;
}) {
  const hiddenEnemy = playerEnemy(role, combatant);
  const shownName = hiddenEnemy ? playerEnemyName(combatant.name) : combatant.name;
  const conditions = combatant.conditions ?? [];
  const automaticColor = tokenVisual?.backgroundColor ?? null;

  return (
    <article
      className={`combatant-row ${combatant.active ? "is-active" : ""}`}
      data-token-match={automaticColor ? "matched" : manualColor ? "manual" : tokenVisual ? "matched-no-color" : "unmatched"}
    >
      <button className="combatant-main" type="button" onClick={onToggle} aria-expanded={open}>
        <div className="initiative">{combatant.initiative ?? "—"}</div>

        <TokenAvatar combatant={{ ...combatant, initial: shownName.slice(0, 1), name: shownName }} tokenVisual={tokenVisual} manualColor={manualColor} />

        <div className="identity">
          <strong>{shownName}</strong>
          <span>
            {hiddenEnemy
              ? "Enemy"
              : [combatant.level != null ? `Level ${combatant.level}` : null, combatant.side].filter(Boolean).join(" · ")}
          </span>
        </div>

        <div className="conditions-cell">
          {conditions.slice(0, 2).map((condition, index) => (
            <span className="condition-chip compact" key={`${condition}-${index}`}>{condition}</span>
          ))}
          {conditions.length > 2 && <span className="more-chip">+{conditions.length - 2}</span>}
        </div>

        <div className="metric">
          <span>AC</span>
          <strong>{hiddenEnemy ? "—" : combatant.ac ?? "—"}</strong>
        </div>

        <div className="metric hp">
          <span>HP</span>
          <strong>{hiddenEnemy ? "—" : hpLabel(combatant)}</strong>
        </div>

        <div className="chevron" aria-hidden="true">{open ? "⌃" : "⌄"}</div>
      </button>

      {open && (
        <DetailPanel
          combatant={combatant}
          role={role}
          tokenVisual={tokenVisual}
          manualColor={manualColor}
          onColorChange={onColorChange}
        />
      )}
    </article>
  );
}

function WguiSignIn({
  busy,
  error,
  onConnect
}: {
  busy: boolean;
  error: string | null;
  onConnect: () => void;
}) {
  return (
    <section className="encounter-picker auth-picker">
      <div className="picker-heading">
        <span className="eyebrow">WGUI CONNECTION</span>
        <strong>Sign in to Wanderer's Guide</strong>
        <span className="muted">
          Not authenticated. Click Connect Wanderer's Guide. It only checks the local session on port 5194. Log in on that site in your own tab, then click Connect again.
        </span>
      </div>

      {error && <div className="picker-error">{error}</div>}

      <button className="auth-submit" type="button" disabled={busy} onClick={onConnect}>
        {busy ? "Opening connection window…" : "Connect Wanderer's Guide"}
      </button>
    </section>
  );
}

function EncounterPicker({
  campaigns,
  encounters,
  selectedCampaignId,
  selectedEncounterId,
  loading,
  error,
  onCampaignChange,
  onEncounterChange,
  onClose
}: {
  campaigns: CampaignOption[];
  encounters: EncounterOption[];
  selectedCampaignId: string;
  selectedEncounterId: string;
  loading: boolean;
  error: string | null;
  onCampaignChange: (id: string) => void;
  onEncounterChange: (id: string) => void;
  onClose: (() => void) | null;
}) {
  return (
    <section className="encounter-picker">
      <div className="picker-heading">
        <span className="eyebrow">WGUI CONNECTION</span>
        <strong>Select what this Owlbear room should display</strong>
      </div>

      <label className="picker-field">
        <span>Campaign</span>
        <select
          aria-label="Campaign"
          value={selectedCampaignId}
          disabled={loading && campaigns.length === 0}
          onChange={(event) => onCampaignChange(event.target.value)}
        >
          <option value="">Select campaign…</option>
          {campaigns.map((campaign) => (
            <option key={campaign.id} value={campaign.id}>
              {campaign.name}{campaign.relation ? ` — ${campaign.relation === "owner" ? "Owned" : "Playing"}` : ""}
            </option>
          ))}
        </select>
      </label>

      {selectedCampaignId && (
        <label className="picker-field">
          <span>Encounter</span>
          <select
            aria-label="Encounter"
            value={selectedEncounterId}
            disabled={loading && encounters.length === 0}
            onChange={(event) => onEncounterChange(event.target.value)}
          >
            <option value="">Select encounter…</option>
            {encounters.map((encounter) => (
              <option key={encounter.id} value={encounter.id}>
                {encounter.name}{encounter.combatantCount != null ? ` — ${encounter.combatantCount} combatants` : ""}
              </option>
            ))}
          </select>
        </label>
      )}

      {loading && <div className="picker-status">Loading WGUI…</div>}
      {error && <div className="picker-error">{error}</div>}

      {onClose && (
        <button className="picker-close" type="button" onClick={onClose}>
          Close
        </button>
      )}
    </section>
  );
}

export default function App() {
  const [role, setRole] = useState<ViewerRole | null>(null);
  const [state, setState] = useState<EncounterSourceState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [tokenColorMatches, setTokenColorMatches] = useState<TokenColorMatch[]>([]);
  const [matchingTokenColors, setMatchingTokenColors] = useState(false);
  const [tokenMatchMessage, setTokenMatchMessage] = useState<string | null>(null);
  const [tokenMatchLogOpen, setTokenMatchLogOpen] = useState(false);
  const [tokenMatchLog, setTokenMatchLog] = useState<string | null>(null);
  const [tokenMatchFailed, setTokenMatchFailed] = useState(false);
  const [manualColorVersion, setManualColorVersion] = useState(0);
  const [manualColorsHydrated, setManualColorsHydrated] = useState(false);
  const [sharedColorsHydrated, setSharedColorsHydrated] = useState(false);
  const [sharedColors, setSharedColors] = useState<SharedTokenColorMap>({});
  const savedColorsRef = useRef<SharedTokenColorMap>({});

  const [campaigns, setCampaigns] = useState<CampaignOption[]>([]);
  const [encounters, setEncounters] = useState<EncounterOption[]>([]);
  const [selectedCampaignId, setSelectedCampaignId] = useState(() => readSelection().campaignId);
  const [selectedEncounterId, setSelectedEncounterId] = useState(() => readSelection().encounterId);
  const [pickerOpen, setPickerOpen] = useState(() => {
    const saved = readSelection();
    return !saved.campaignId || !saved.encounterId;
  });
  const [catalogLoading, setCatalogLoading] = useState(false);
  const [catalogError, setCatalogError] = useState<string | null>(null);
  const [wguiSession, setWguiSession] = useState<WguiSession | null>(null);
  const wguiSessionRef = useRef(wguiSession);
  wguiSessionRef.current = wguiSession;
  const previousRoleRef = useRef<ViewerRole | null>(null);
  const previousUserIdRef = useRef<string | null | undefined>(undefined);
  const authWaitRef = useRef<number | null>(null);
  const sessionUserId = wguiSession?.userId ?? null;
  const [authChecked, setAuthChecked] = useState(false);
  const [authBusy, setAuthBusy] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  const obrAvailable = isOwlbearAvailable();
  const liveCatalogConfigured = isWguiBackendConfigured();
  const selectedCampaign = campaigns.find((campaign) => campaign.id === selectedCampaignId);
  const selectedEncounter = encounters.find((option) => option.id === selectedEncounterId);

  useEffect(() => {
    let cancelled = false;
    getViewerRole().then((value) => {
      if (!cancelled) setRole(value);
    });

    const unsubscribe = subscribeToViewerRole((value) => {
      if (!cancelled) setRole(value);
    });

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, []);

  useEffect(() => {
    let active = true;

    if (!liveCatalogConfigured) {
      setAuthChecked(true);
      return;
    }

    getWguiSession()
      .then((session) => {
        if (active) setWguiSession(session);
      })
      .finally(() => {
        if (active) setAuthChecked(true);
      });

    const unsubscribe = subscribeToWguiSession((session, event) => {
      if (!active) return;
      setAuthChecked(true);
      if (event === "SIGNED_OUT") {
        setWguiSession(null);
        return;
      }
      // Focus recovery re-emits SIGNED_IN for the session already on screen.
      // A null event that is not a sign-out must not drop that login.
      if (!session) return;
      setWguiSession((current) =>
        current?.userId === session.userId && current.accessToken === session.accessToken
          ? current
          : session
      );
      setAuthError(null);
    });

    return () => {
      active = false;
      unsubscribe();
    };
  }, [liveCatalogConfigured]);

  useEffect(() => {
    if (!liveCatalogConfigured) return;

    const onMessage = (event: MessageEvent) => {
      if (event.data?.type !== "wgui-owlbear-auth") return;
      if (authWaitRef.current !== null) {
        window.clearTimeout(authWaitRef.current);
        authWaitRef.current = null;
      }
      void acceptWguiAuthMessage(event)
        .then((session) => {
          if (!session) return;
          setWguiSession(session);
          setAuthError(null);
          setAuthBusy(false);
        })
        .catch((cause) => {
          setAuthError(cause instanceof Error ? cause.message : "Unable to connect Wanderer's Guide.");
          setAuthBusy(false);
        });
    };

    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [liveCatalogConfigured]);

  useEffect(() => {
    if (!role) return;
    if (liveCatalogConfigured && !wguiSession) return;

    const roleChanged = previousRoleRef.current !== null && previousRoleRef.current !== role;
    const userChanged = previousUserIdRef.current != null && previousUserIdRef.current !== sessionUserId;
    previousRoleRef.current = role;
    previousUserIdRef.current = sessionUserId;
    if (roleChanged || userChanged) {
      setSelectedCampaignId("");
      setSelectedEncounterId("");
      setPickerOpen(true);
    }

    const controller = new AbortController();
    let active = true;

    setCampaigns([]);
    setEncounters([]);
    setState(null);
    setCatalogError(null);
    setCatalogLoading(true);

    loadCampaignOptions(role, controller.signal, wguiSessionRef.current)
      .then((options) => {
        if (!active) return;
        setCampaigns(options);
        setSelectedCampaignId((current) => {
          if (!current || options.some((campaign) => campaign.id === current)) return current;
          setSelectedEncounterId("");
          setPickerOpen(true);
          return "";
        });
      })
      .catch((cause) => {
        if (active && !controller.signal.aborted) {
          setCatalogError(cause instanceof Error ? cause.message : "Unable to load WGUI campaigns.");
        }
      })
      .finally(() => {
        if (active) setCatalogLoading(false);
      });

    return () => {
      active = false;
      controller.abort();
    };
  }, [role, liveCatalogConfigured, sessionUserId]);

  useEffect(() => {
    if (!role || !selectedCampaign) {
      setEncounters([]);
      return;
    }

    const controller = new AbortController();
    let active = true;

    setEncounters([]);
    setState(null);
    setCatalogError(null);
    setCatalogLoading(true);

    loadEncounterOptions(selectedCampaignId, role, controller.signal, wguiSessionRef.current)
      .then((options) => {
        if (!active) return;
        setEncounters(options);
        setSelectedEncounterId((current) => {
          if (!current || options.some((encounter) => encounter.id === current)) return current;
          setPickerOpen(true);
          return "";
        });
      })
      .catch((cause) => {
        if (!active || controller.signal.aborted) return;
        const message = cause instanceof Error ? cause.message : "Unable to load WGUI encounters.";
        if (campaignAccessDenied(message)) {
          setSelectedCampaignId("");
          setSelectedEncounterId("");
          setPickerOpen(true);
        }
        setCatalogError(message);
      })
      .finally(() => {
        if (active) setCatalogLoading(false);
      });

    return () => {
      active = false;
      controller.abort();
    };
  }, [role, selectedCampaign, sessionUserId]);

  useEffect(() => {
    if (!role || !selectedCampaign || !selectedEncounterId) {
      setState(null);
      setLoading(false);
      return;
    }
    // A restored selection is ready before getWguiSession resolves. Loading
    // then throws the sign-in error and leaves the feed unavailable.
    if (liveCatalogConfigured && !wguiSession) {
      setState(null);
      setError(null);
      setLoading(false);
      return;
    }

    const controller = new AbortController();
    let mounted = true;
    let timer: number | undefined;
    const pollInterval = getPollInterval();

    const refresh = async () => {
      try {
        const next = await loadEncounter(
          role,
          controller.signal,
          { campaignId: selectedCampaignId, fightId: selectedEncounterId },
          wguiSessionRef.current,
          selectedCampaign?.name ?? null
        );
        if (!mounted) return;
        setState(next);
        setError(null);
        timer = window.setTimeout(refresh, pollInterval);
      } catch (cause) {
        if (!mounted || controller.signal.aborted) return;
        const message = cause instanceof Error ? cause.message : "Unable to load the encounter.";
        setError(message);
        if (campaignAccessDenied(message)) {
          setSelectedCampaignId("");
          setSelectedEncounterId("");
          setPickerOpen(true);
          setLoading(false);
          return;
        }
        timer = window.setTimeout(refresh, pollInterval);
      } finally {
        if (mounted) setLoading(false);
      }
    };

    setState(null);
    setError(null);
    setOpenId(null);
    setLoading(true);
    refresh();

    return () => {
      mounted = false;
      controller.abort();
      if (timer !== undefined) window.clearTimeout(timer);
    };
  }, [role, selectedCampaignId, selectedEncounterId, sessionUserId, selectedCampaign?.name]);

  useEffect(() => {
    writeSelection(selectedCampaignId, selectedEncounterId);
  }, [selectedCampaignId, selectedEncounterId]);

  const combatants = useMemo(
    () => [...(state?.snapshot.combatants ?? [])].sort((a, b) => (b.initiative ?? -999) - (a.initiative ?? -999)),
    [state]
  );

  const activeCombatants = combatants.filter((combatant) => combatant.out !== "dead" && combatant.out !== "incapacitated");
  const outCombatants = combatants.filter((combatant) => combatant.out === "dead" || combatant.out === "incapacitated");

  const tokenMatches = useMemo(() => {
    const byCombatant = new Map<string, OwlbearTokenVisual>();
    for (const match of tokenColorMatches) {
      byCombatant.set(match.combatantId, {
        id: match.tokenId,
        name: match.tokenName,
        backgroundColor: match.backgroundColor
      });
    }
    return byCombatant;
  }, [tokenColorMatches]);

  const encounter = state?.snapshot.encounter;
  const campaignScope = selectedCampaignId || encounter?.campaignName || "default-campaign";
  const ready = Boolean(selectedCampaignId && selectedEncounterId);

  useEffect(() => {
    setTokenColorMatches([]);
    setTokenMatchMessage(null);
    setTokenMatchLog(null);
    setTokenMatchLogOpen(false);
    setTokenMatchFailed(false);
  }, [role, selectedCampaignId, selectedEncounterId]);

  const manualColorFor = (combatant: CombatantView) => {
    void manualColorVersion;
    return getManualTokenColor(campaignScope, combatant.name);
  };

  useEffect(() => {
    setSharedColorsHydrated(false);
    if (!role || !campaignScope) return;
    return subscribeToSharedTokenColors(campaignScope, (colors) => {
      savedColorsRef.current = colors;
      setSharedColors(colors);
      setSharedColorsHydrated(true);
    });
  }, [role, campaignScope]);

  useEffect(() => {
    return subscribeToManualTokenColorBook((remote) => {
      const local = readManualTokenColors();
      const merged = { ...remote, ...local };
      if (JSON.stringify(merged) !== JSON.stringify(local)) {
        writeManualTokenColors(merged);
        setManualColorVersion((value) => value + 1);
      }
      setManualColorsHydrated(true);
    });
  }, []);

  useEffect(() => {
    if (!manualColorsHydrated || !sharedColorsHydrated || role !== "GM" || !ready || !state) return;
    const colors: SharedTokenColorMap = { ...savedColorsRef.current };
    for (const combatant of combatants) {
      const automatic = tokenMatches.get(combatant.id)?.backgroundColor;
      const manual = getManualTokenColor(campaignScope, combatant.name);
      const color = automatic ?? manual ?? colors[sharedTokenColorKey(combatant.name)];
      if (color) colors[sharedTokenColorKey(combatant.name)] = color;
    }
    savedColorsRef.current = colors;
    void publishSharedTokenColors(campaignScope, colors);
  }, [manualColorsHydrated, sharedColorsHydrated, role, ready, state, combatants, tokenMatches, manualColorVersion, campaignScope]);

  const saveColor = (combatant: CombatantView, color: string) => {
    saveManualTokenColor(campaignScope, combatant.name, color);
    setManualColorVersion((value) => value + 1);
    void publishManualTokenColorBook(readManualTokenColors());
  };

  const matchTokenColors = async () => {
    if (role !== "GM") return;

    setMatchingTokenColors(true);
    setTokenMatchMessage(null);
    setTokenMatchLog(null);
    setTokenMatchLogOpen(false);
    setTokenMatchFailed(false);

    try {
      // getSceneTokenVisuals reads CHARACTER item.name (Owlbear Accessibility
      // -> Name) and reads each token color before returning.
      const tokens = await getSceneTokenVisuals(role);
      const matches = buildTokenColorMatches(combatants, tokens);
      const coloredMatches = matches.filter((match) => Boolean(match.backgroundColor));
      const coloredNames = coloredMatches.map((match) => match.combatantName).join(", ");

      setTokenColorMatches(matches);
      setTokenMatchFailed(false);
      setTokenMatchLog(
        [
          `Owlbear tokens (${tokens.length}):`,
          ...tokens.map((token) => `  ${token.name || "(blank)"}  ${token.backgroundColor ?? "(no color)"}`),
          `Combatants (${combatants.length}):`,
          ...combatants.map((combatant) => `  ${combatant.name || "(blank)"}`)
        ].join("\n")
      );
      setTokenMatchMessage(
        coloredNames
          ? `Matched ${coloredMatches.length} of ${combatants.length}: ${coloredNames}`
          : matches.length
            ? `Matched ${matches.length} of ${combatants.length} by name, but none had a readable token color.`
            : `Matched 0 of ${combatants.length} combatants from ${tokens.length} Owlbear tokens. Token names did not line up.`
      );
    } catch (cause) {
      setTokenColorMatches([]);
      setTokenMatchFailed(true);
      setTokenMatchLog(cause instanceof Error ? cause.stack ?? cause.message : "Unable to match Owlbear token colors.");
      setTokenMatchMessage(
        cause instanceof Error ? cause.message : "Unable to match Owlbear token colors."
      );
    } finally {
      setMatchingTokenColors(false);
    }
  };

  if (!role) {
    return (
      <main className="app-shell role-loading" aria-live="polite">
        <div className="empty-state">Connecting to Owlbear…</div>
      </main>
    );
  }

  return (
    <main className="app-shell">
      <header className="app-header">
        <div>
          <div className="eyebrow">WANDERER'S GUIDE</div>
          <h1>{encounter?.name ?? selectedEncounter?.name ?? "Select encounter"}</h1>
          <p>
            {encounter?.campaignName ?? selectedCampaign?.name ?? "Choose a WGUI campaign"}
            {encounter?.location ? <><span className="dot">•</span>{encounter.location}</> : null}
          </p>
        </div>

        <div className="header-side">
          {liveCatalogConfigured && wguiSession && (
            <button
              className="change-selection"
              type="button"
              title={wguiSession.email ?? "WGUI account"}
              onClick={() => {
                void signOutOfWgui();
              }}
            >
              Sign out
            </button>
          )}
          {ready && !pickerOpen && (
            <button className="change-selection" type="button" onClick={() => setPickerOpen(true)}>
              Change
            </button>
          )}
          {ready && role === "GM" && (
            <button
              className="change-selection"
              type="button"
              onClick={() => void matchTokenColors()}
              disabled={matchingTokenColors}
            >
              {matchingTokenColors ? "Matching…" : "Match token colors"}
            </button>
          )}
          <span className={`role-badge ${role === "GM" ? "gm" : "player"}`}>
            {role === "GM" ? "GM VIEW" : "PLAYER VIEW"}
          </span>
          {ready && (
            <div className="round">
              <span>ROUND</span>
              <strong>{encounter?.round ?? "—"}</strong>
            </div>
          )}
        </div>
      </header>

      {!obrAvailable && (
        <div className="dev-bar">
          <span>Browser preview</span>
          <button className={role === "GM" ? "selected" : ""} onClick={() => setRole("GM")}>GM</button>
          <button className={role === "PLAYER" ? "selected" : ""} onClick={() => setRole("PLAYER")}>Player</button>
        </div>
      )}

      {liveCatalogConfigured && authChecked && !wguiSession && (
        <WguiSignIn
          busy={authBusy}
          error={authError}
          onConnect={() => {
            setAuthBusy(true);
            setAuthError(null);
            if (authWaitRef.current !== null) window.clearTimeout(authWaitRef.current);
            authWaitRef.current = window.setTimeout(() => {
              authWaitRef.current = null;
              setAuthBusy(false);
              setAuthError("No local session yet. Log in on localhost:5194 in your own tab, then click Connect again.");
            }, 8000);
            startWguiAuth();
          }}
        />
      )}

      {pickerOpen && (!liveCatalogConfigured || wguiSession) && (
        <EncounterPicker
          campaigns={campaigns}
          encounters={encounters}
          selectedCampaignId={selectedCampaignId}
          selectedEncounterId={selectedEncounterId}
          loading={catalogLoading}
          error={catalogError}
          onCampaignChange={(id) => {
            setSelectedCampaignId(id);
            setSelectedEncounterId("");
            setPickerOpen(true);
          }}
          onEncounterChange={(id) => {
            setSelectedEncounterId(id);
            if (id) setPickerOpen(false);
          }}
          onClose={selectedEncounterId ? () => setPickerOpen(false) : null}
        />
      )}

      {ready && (
        <>
          <nav className="tabs" aria-label="Encounter sections">
            <button className="tab active">COMBAT</button>
          </nav>

          {role === "GM" && tokenMatchMessage && (
            <div
              className={`token-match-banner ${tokenMatchFailed ? "error" : ""}`}
              role="status"
              aria-live="polite"
            >
              <span>{tokenMatchMessage}</span>
              {tokenMatchLog && (
                <button
                  className="token-match-toggle"
                  type="button"
                  aria-expanded={tokenMatchLogOpen}
                  onClick={() => setTokenMatchLogOpen((open) => !open)}
                >
                  {tokenMatchLogOpen ? "Hide details" : "Show details"}
                </button>
              )}
            </div>
          )}

          {role === "GM" && tokenMatchLog && tokenMatchLogOpen && (
            <pre className="token-match-log">{tokenMatchLog}</pre>
          )}

          <section className="table-head" aria-hidden="true">
            <span>INIT</span>
            <span></span>
            <span>COMBATANT</span>
            <span>CONDITIONS</span>
            <span>AC</span>
            <span>HP</span>
            <span></span>
          </section>

          <section className="combat-list" aria-live="polite">
            {loading && !state && <div className="empty-state">Loading encounter…</div>}

            {!loading && activeCombatants.length === 0 && !error && (
              <div className="empty-state">No combatants in this encounter.</div>
            )}

            {activeCombatants.map((combatant) => {
              const freshMatch = role === "GM" ? tokenMatches.get(combatant.id) : undefined;
              const savedColor = sharedColors[sharedTokenColorKey(combatant.name)] ?? null;
              const tokenVisual = freshMatch?.backgroundColor
                ? freshMatch
                : savedColor
                  ? { id: `saved:${combatant.id}`, name: combatant.name, backgroundColor: savedColor }
                  : freshMatch;
              const manualColor = tokenVisual?.backgroundColor ? null : manualColorFor(combatant);

              return (
                <CombatantRow
                  key={combatant.id}
                  combatant={combatant}
                  role={role}
                  open={openId === combatant.id}
                  onToggle={() => setOpenId((current) => current === combatant.id ? null : combatant.id)}
                  tokenVisual={tokenVisual}
                  manualColor={manualColor}
                  onColorChange={(color) => saveColor(combatant, color)}
                />
              );
            })}
          </section>

          {state && (
            <section className="out-bucket" aria-label="Dead or incapacitated">
              <div className="out-bucket-label">
                <span>Dead / Incapacitated</span>
                <span>{outCombatants.length}</span>
              </div>
              {outCombatants.length === 0 ? (
                <p className="out-empty">No combatants out of the fight.</p>
              ) : (
                <ul>
                  {outCombatants.map((combatant) => (
                    <li key={combatant.id}>
                      <span className="out-name">{playerEnemy(role, combatant) ? playerEnemyName(combatant.name) : combatant.name}</span>
                      <span className="out-tag">{combatant.out === "dead" ? "Dead" : "Incap."}</span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          )}

          <footer className="status-bar">
            <div>
              <span className={`status-dot ${error ? "error" : ""}`} />
              {error ? "Feed unavailable" : "WGUI live"}
            </div>
            <span>{state ? `Updated ${state.lastUpdated.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}` : ""}</span>
          </footer>
        </>
      )}

      {error && (
        <div className="error-banner">
          <strong>WGUI feed error</strong>
          <span>{error}</span>
        </div>
      )}
    </main>
  );
}
