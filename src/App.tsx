import { useEffect, useMemo, useState } from "react";
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
  subscribeToViewerRole
} from "./owbear";
import {
  buildTokenColorMatches,
  type OwlbearTokenVisual,
  type TokenColorMatch
} from "./tokenMatch";
import {
  getManualTokenColor,
  saveManualTokenColor,
  TOKEN_COLOR_PALETTE
} from "./tokenPreferences";
import {
  getPollInterval,
  loadCampaignOptions,
  loadEncounter,
  loadEncounterOptions
} from "./wgui";
import {
  getWguiSession,
  isWguiBackendConfigured,
  signInToWgui,
  signOutOfWgui,
  subscribeToWguiSession,
  type WguiSession
} from "./wguiAuth";

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
  combatant,
  tokenVisual,
  manualColor,
  onColorChange
}: {
  combatant: CombatantView;
  tokenVisual?: OwlbearTokenVisual;
  manualColor: string | null;
  onColorChange: (color: string) => void;
}) {
  if (tokenVisual?.backgroundColor) {
    return (
      <div className="token-match-status matched">
        <span className="match-dot" />
        Owlbear name matched · React circle color read from token SVG
      </div>
    );
  }

  const explanation = tokenVisual
    ? `Matched ${combatant.name}, but its SVG background color could not be read. Pick the visible map color.`
    : `No exact Owlbear token match for ${combatant.name}. Pick the visible map color.`;

  return (
    <div className="token-color-editor">
      <div className="token-color-copy">
        <span className="detail-label">Token color</span>
        <span className="muted">{explanation}</span>
      </div>

      <div className="token-color-palette" role="group" aria-label={`Token color for ${combatant.name}`}>
        {TOKEN_COLOR_PALETTE.map((color) => (
          <button
            key={color}
            type="button"
            className={`token-color-choice ${manualColor === color ? "selected" : ""}`}
            style={{ background: color }}
            aria-label={`Set ${combatant.name} token color to ${color}`}
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
  const enemyFiltered = role === "PLAYER" && combatant.side === "enemy";

  return (
    <div className="combatant-detail">
      <div className="detail-grid">
        <div>
          <span>HP</span>
          <strong>{hpLabel(combatant)}</strong>
        </div>
        <div>
          <span>AC</span>
          <strong>{combatant.ac ?? "—"}</strong>
        </div>
        <div>
          <span>Perception</span>
          <strong>{signed(combatant.perception)}</strong>
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

      <TokenColorEditor
        combatant={combatant}
        tokenVisual={tokenVisual}
        manualColor={manualColor}
        onColorChange={onColorChange}
      />
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
  const playerEnemy = role === "PLAYER" && combatant.side === "enemy";
  const conditions = combatant.conditions ?? [];
  const automaticColor = tokenVisual?.backgroundColor ?? null;

  return (
    <article
      className={`combatant-row ${combatant.active ? "is-active" : ""}`}
      data-token-match={automaticColor ? "matched" : manualColor ? "manual" : tokenVisual ? "matched-no-color" : "unmatched"}
    >
      <button className="combatant-main" type="button" onClick={onToggle} aria-expanded={open}>
        <div className="initiative">{combatant.initiative ?? "—"}</div>

        <TokenAvatar combatant={combatant} tokenVisual={tokenVisual} manualColor={manualColor} />

        <div className="identity">
          <strong>{combatant.name}</strong>
          <span>
            {playerEnemy
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
          <strong>{combatant.ac ?? "—"}</strong>
        </div>

        <div className="metric hp">
          <span>HP</span>
          <strong>{hpLabel(combatant)}</strong>
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
  onSubmit
}: {
  busy: boolean;
  error: string | null;
  onSubmit: (email: string, password: string) => void;
}) {
  return (
    <section className="encounter-picker auth-picker">
      <div className="picker-heading">
        <span className="eyebrow">WGUI CONNECTION</span>
        <strong>Sign in to Wanderer's Guide</strong>
        <span className="muted">Use the same account as WGUI. This session is stored only in this extension origin.</span>
      </div>

      <form
        className="auth-form"
        onSubmit={(event) => {
          event.preventDefault();
          const data = new FormData(event.currentTarget);
          onSubmit(
            String(data.get("email") ?? "").trim(),
            String(data.get("password") ?? "")
          );
        }}
      >
        <label className="picker-field">
          <span>Email</span>
          <input name="email" type="email" autoComplete="username" required />
        </label>

        <label className="picker-field">
          <span>Password</span>
          <input name="password" type="password" autoComplete="current-password" required />
        </label>

        {error && <div className="picker-error">{error}</div>}

        <button className="auth-submit" type="submit" disabled={busy}>
          {busy ? "Signing in…" : "Sign in"}
        </button>
      </form>
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
  onEncounterChange
}: {
  campaigns: CampaignOption[];
  encounters: EncounterOption[];
  selectedCampaignId: string;
  selectedEncounterId: string;
  loading: boolean;
  error: string | null;
  onCampaignChange: (id: string) => void;
  onEncounterChange: (id: string) => void;
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
  const [manualColorVersion, setManualColorVersion] = useState(0);

  const [campaigns, setCampaigns] = useState<CampaignOption[]>([]);
  const [encounters, setEncounters] = useState<EncounterOption[]>([]);
  const [selectedCampaignId, setSelectedCampaignId] = useState("");
  const [selectedEncounterId, setSelectedEncounterId] = useState("");
  const [pickerOpen, setPickerOpen] = useState(true);
  const [catalogLoading, setCatalogLoading] = useState(false);
  const [catalogError, setCatalogError] = useState<string | null>(null);
  const [wguiSession, setWguiSession] = useState<WguiSession | null>(null);
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

    const unsubscribe = subscribeToWguiSession((session) => {
      if (active) {
        setWguiSession(session);
        setAuthChecked(true);
        setAuthError(null);
      }
    });

    return () => {
      active = false;
      unsubscribe();
    };
  }, [liveCatalogConfigured]);

  useEffect(() => {
    if (!role) return;
    if (liveCatalogConfigured && !wguiSession) return;

    const controller = new AbortController();
    let active = true;

    setCampaigns([]);
    setEncounters([]);
    setSelectedCampaignId("");
    setSelectedEncounterId("");
    setPickerOpen(true);
    setState(null);
    setCatalogError(null);
    setCatalogLoading(true);

    loadCampaignOptions(role, controller.signal, wguiSession)
      .then((options) => {
        if (active) setCampaigns(options);
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
  }, [role, liveCatalogConfigured, wguiSession]);

  useEffect(() => {
    if (!role || !selectedCampaignId) {
      setEncounters([]);
      return;
    }

    const controller = new AbortController();
    let active = true;

    setEncounters([]);
    setSelectedEncounterId("");
    setState(null);
    setCatalogError(null);
    setCatalogLoading(true);

    loadEncounterOptions(selectedCampaignId, role, controller.signal, wguiSession)
      .then((options) => {
        if (active) setEncounters(options);
      })
      .catch((cause) => {
        if (active && !controller.signal.aborted) {
          setCatalogError(cause instanceof Error ? cause.message : "Unable to load WGUI encounters.");
        }
      })
      .finally(() => {
        if (active) setCatalogLoading(false);
      });

    return () => {
      active = false;
      controller.abort();
    };
  }, [role, selectedCampaignId, wguiSession]);

  useEffect(() => {
    if (!role || !selectedCampaignId || !selectedEncounterId) {
      setState(null);
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
          wguiSession,
          selectedCampaign?.name ?? null
        );
        if (!mounted) return;
        setState(next);
        setError(null);
      } catch (cause) {
        if (!mounted || controller.signal.aborted) return;
        setError(cause instanceof Error ? cause.message : "Unable to load the encounter.");
      } finally {
        if (mounted) {
          setLoading(false);
          timer = window.setTimeout(refresh, pollInterval);
        }
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
  }, [role, selectedCampaignId, selectedEncounterId, wguiSession, selectedCampaign?.name]);

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
  }, [role, selectedCampaignId, selectedEncounterId]);

  const manualColorFor = (combatant: CombatantView) => {
    void manualColorVersion;
    return getManualTokenColor(campaignScope, combatant.name);
  };

  const saveColor = (combatant: CombatantView, color: string) => {
    saveManualTokenColor(campaignScope, combatant.name, color);
    setManualColorVersion((value) => value + 1);
  };

  const matchTokenColors = async () => {
    if (role !== "GM") return;

    setMatchingTokenColors(true);
    setTokenMatchMessage(null);

    try {
      // getSceneTokenVisuals reads CHARACTER item.name (Owlbear Accessibility
      // -> Name) and samples each SVG before returning, so colors are applied
      // only after the full token scan has completed.
      const tokens = await getSceneTokenVisuals(role);
      const matches = buildTokenColorMatches(combatants, tokens);
      const coloredMatches = matches.filter((match) => Boolean(match.backgroundColor));

      setTokenColorMatches(matches);
      setTokenMatchMessage(
        `Matched ${matches.length} of ${combatants.length} combatants from ${tokens.length} Owlbear tokens · ${coloredMatches.length} SVG colors read`
      );
    } catch (cause) {
      setTokenColorMatches([]);
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
          onSubmit={(email, password) => {
            setAuthBusy(true);
            setAuthError(null);
            void signInToWgui(email, password)
              .then((result) => {
                if (result.error) {
                  setAuthError(result.error);
                } else {
                  setWguiSession(result.session);
                }
              })
              .finally(() => setAuthBusy(false));
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
        />
      )}

      {ready && (
        <>
          <nav className="tabs" aria-label="Encounter sections">
            <button className="tab active">COMBAT</button>
          </nav>

          {role === "GM" && tokenMatchMessage && (
            <div className="picker-status" aria-live="polite">{tokenMatchMessage}</div>
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
              const tokenVisual = tokenMatches.get(combatant.id);
              const automaticColor = tokenVisual?.backgroundColor ?? null;
              const manualColor = automaticColor ? null : manualColorFor(combatant);

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
                      <span className="out-name">{combatant.name}</span>
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
