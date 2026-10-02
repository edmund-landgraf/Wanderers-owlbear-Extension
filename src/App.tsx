import { useEffect, useMemo, useState } from "react";
import type { CombatantView, EncounterSourceState, ViewerRole } from "./types";
import {
  getSceneTokenVisuals,
  getViewerRole,
  isOwlbearAvailable,
  subscribeToSceneTokenVisuals,
  subscribeToViewerRole
} from "./owbear";
import {
  matchCombatantsToTokens,
  type OwlbearTokenVisual
} from "./tokenMatch";
import {
  getManualTokenColor,
  saveManualTokenColor,
  TOKEN_COLOR_PALETTE
} from "./tokenPreferences";
import { getPollInterval, loadEncounter } from "./wgui";

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

  if (tokenVisual) {
    return (
      <div className="initial-token token-image-wrap" title={`Matched Owlbear token: ${tokenVisual.name}`}>
        <img className="token-image" src={tokenVisual.imageUrl} alt="" />
      </div>
    );
  }

  return (
    <div
      className={`initial-token ${manualColor ? "manual-token-color" : "unmatched-token"}`}
      style={{ background: manualColor ?? "#334155" }}
      title={manualColor ? "Manual token color" : "No Owlbear token match"}
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
  if (tokenVisual) {
    return (
      <div className="token-match-status matched">
        <span className="match-dot" />
        Matched Owlbear token by name
      </div>
    );
  }

  return (
    <div className="token-color-editor">
      <div className="token-color-copy">
        <span className="detail-label">Token color</span>
        <span className="muted">
          No exact Owlbear token match for {combatant.name}. Pick the matching map color.
        </span>
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

  return (
    <article
      className={`combatant-row ${combatant.active ? "is-active" : ""}`}
      data-token-match={tokenVisual ? "matched" : manualColor ? "manual" : "unmatched"}
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

export default function App() {
  const [role, setRole] = useState<ViewerRole | null>(null);
  const [state, setState] = useState<EncounterSourceState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [sceneTokens, setSceneTokens] = useState<OwlbearTokenVisual[]>([]);
  const [manualColorVersion, setManualColorVersion] = useState(0);
  const obrAvailable = isOwlbearAvailable();

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
    if (!role) return;

    const controller = new AbortController();
    let mounted = true;
    let timer: number | undefined;
    const pollInterval = getPollInterval();

    const refresh = async () => {
      try {
        const next = await loadEncounter(role, controller.signal);
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

    // A role change must never leave the previous role's projection on screen.
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
  }, [role]);

  useEffect(() => {
    if (!role || role !== "GM") {
      setSceneTokens([]);
      return;
    }

    let active = true;
    getSceneTokenVisuals(role)
      .then((tokens) => {
        if (active) setSceneTokens(tokens);
      })
      .catch(() => {
        if (active) setSceneTokens([]);
      });

    const unsubscribe = subscribeToSceneTokenVisuals(role, (tokens) => {
      if (active) setSceneTokens(tokens);
    });

    return () => {
      active = false;
      unsubscribe();
    };
  }, [role]);

  const combatants = useMemo(
    () => [...(state?.snapshot.combatants ?? [])].sort((a, b) => (b.initiative ?? -999) - (a.initiative ?? -999)),
    [state]
  );

  const tokenMatches = useMemo(
    () => matchCombatantsToTokens(combatants, sceneTokens),
    [combatants, sceneTokens]
  );

  const encounter = state?.snapshot.encounter;
  const campaignScope = encounter?.campaignName || "default-campaign";

  const manualColorFor = (combatant: CombatantView) => {
    // manualColorVersion intentionally participates so a saved choice re-renders immediately.
    void manualColorVersion;
    return getManualTokenColor(campaignScope, combatant.name);
  };

  const saveColor = (combatant: CombatantView, color: string) => {
    saveManualTokenColor(campaignScope, combatant.name, color);
    setManualColorVersion((value) => value + 1);
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
          <h1>{encounter?.name ?? "Combat"}</h1>
          <p>
            {encounter?.campaignName ?? "Encounter"}
            {encounter?.location ? <><span className="dot">•</span>{encounter.location}</> : null}
          </p>
        </div>

        <div className="header-side">
          <span className={`role-badge ${role === "GM" ? "gm" : "player"}`}>{role === "GM" ? "GM VIEW" : "PLAYER VIEW"}</span>
          <div className="round">
            <span>ROUND</span>
            <strong>{encounter?.round ?? "—"}</strong>
          </div>
        </div>
      </header>

      {!obrAvailable && (
        <div className="dev-bar">
          <span>Browser preview</span>
          <button className={role === "GM" ? "selected" : ""} onClick={() => setRole("GM")}>GM</button>
          <button className={role === "PLAYER" ? "selected" : ""} onClick={() => setRole("PLAYER")}>Player</button>
        </div>
      )}

      <nav className="tabs" aria-label="Encounter sections">
        <button className="tab active">COMBAT</button>
      </nav>

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

        {!loading && combatants.length === 0 && !error && (
          <div className="empty-state">No combatants in this encounter.</div>
        )}

        {combatants.map((combatant) => {
          const tokenVisual = tokenMatches.get(combatant.id);
          const manualColor = tokenVisual ? null : manualColorFor(combatant);

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

      <footer className="status-bar">
        <div>
          <span className={`status-dot ${error ? "error" : ""}`} />
          {error ? "Feed unavailable" : state?.source === "live" ? "WGUI live" : "Sample encounter"}
        </div>
        <span>{state ? `Updated ${state.lastUpdated.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}` : ""}</span>
      </footer>

      {error && (
        <div className="error-banner">
          <strong>WGUI feed error</strong>
          <span>{error}</span>
        </div>
      )}
    </main>
  );
}
