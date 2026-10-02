import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.resetModules();
});

async function importLiveModule() {
  vi.stubEnv("VITE_SUPABASE_URL", "");
  vi.stubEnv("VITE_SUPABASE_KEY", "");
  vi.stubEnv("VITE_WGUI_ENCOUNTER_URL", "https://example.test/encounter");
  vi.stubEnv("VITE_WGUI_CAMPAIGNS_URL", "https://example.test/campaigns");
  vi.stubEnv("VITE_WGUI_ENCOUNTERS_URL", "https://example.test/encounters");
  vi.stubEnv("VITE_WGUI_POLL_MS", "2500");
  vi.resetModules();
  return import("./wgui");
}

describe("live WGUI feed", () => {
  it("loads owned/playing campaigns and campaign encounters", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({
        campaigns: [{ id: 23, name: "The Price of Prophecy (Production)" }]
      }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        encounters: [{ id: 40, name: "wg combat test", combatant_count: 8 }]
      }), { status: 200 }));

    vi.stubGlobal("fetch", fetchMock);

    const { loadCampaignOptions, loadEncounterOptions } = await importLiveModule();

    await expect(loadCampaignOptions("GM")).resolves.toEqual([
      { id: "23", name: "The Price of Prophecy (Production)", relation: "owner" }
    ]);

    await expect(loadEncounterOptions("23", "GM")).resolves.toEqual([
      { id: "40", name: "wg combat test", combatantCount: 8 }
    ]);

    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ viewer_role: "GM" });
    expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toEqual({
      campaign_id: "23",
      viewer_role: "GM"
    });
  });

  it("sends selected campaign and encounter identifiers to the encounter projection", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      encounter: { id: "40", name: "Live Test" },
      combatants: []
    }), {
      status: 200,
      headers: { "Content-Type": "application/json" }
    }));
    vi.stubGlobal("fetch", fetchMock);

    const { loadEncounter, getPollInterval } = await importLiveModule();
    const result = await loadEncounter(
      "PLAYER",
      undefined,
      { campaignId: "23", fightId: "40" }
    );

    expect(result.source).toBe("live");
    expect(getPollInterval()).toBe(2500);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://example.test/encounter");
    expect(init.method).toBe("POST");
    expect(init.headers).toEqual({ "Content-Type": "application/json" });
    expect(JSON.parse(init.body)).toEqual({
      campaign_id: "23",
      fight_id: "40",
      viewer_role: "PLAYER"
    });
    expect(init.headers).not.toHaveProperty("Authorization");
  });

  it("fails closed on an HTTP server error", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("nope", { status: 503 })));
    const { loadEncounter } = await importLiveModule();

    await expect(loadEncounter(
      "GM",
      undefined,
      { campaignId: "23", fightId: "40" }
    )).rejects.toThrow("WGUI encounter request failed: 503");
  });

  it("fails closed on malformed successful JSON", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({
      status: "success",
      secretEnemyData: { hp: 999 }
    }), { status: 200 })));
    const { loadEncounter } = await importLiveModule();

    await expect(loadEncounter(
      "PLAYER",
      undefined,
      { campaignId: "23", fightId: "40" }
    )).rejects.toThrow(
      "WGUI encounter endpoint returned an unexpected shape."
    );
  });

  it("refuses to invent campaigns or encounters when Wanderer's Guide is not configured", async () => {
    vi.stubEnv("VITE_SUPABASE_URL", "");
    vi.stubEnv("VITE_SUPABASE_KEY", "");
    vi.stubEnv("VITE_WGUI_ENCOUNTER_URL", "");
    vi.stubEnv("VITE_WGUI_CAMPAIGNS_URL", "");
    vi.stubEnv("VITE_WGUI_ENCOUNTERS_URL", "");
    vi.resetModules();

    const {
      loadCampaignOptions,
      loadEncounterOptions,
      loadEncounter
    } = await import("./wgui");

    await expect(loadCampaignOptions("PLAYER")).rejects.toThrow(
      "Wanderer's Guide is not configured."
    );
    await expect(loadEncounterOptions("23", "PLAYER")).rejects.toThrow(
      "Wanderer's Guide is not configured."
    );
    await expect(loadEncounter(
      "PLAYER",
      undefined,
      { campaignId: "23", fightId: "40" }
    )).rejects.toThrow("Wanderer's Guide is not configured.");
  });
});
