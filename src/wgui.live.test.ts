import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.resetModules();
});

async function importLiveModule() {
  vi.stubEnv("VITE_WGUI_ENCOUNTER_URL", "https://example.test/encounter");
  vi.stubEnv("VITE_WGUI_CAMPAIGN_ID", "23");
  vi.stubEnv("VITE_WGUI_FIGHT_ID", "40");
  vi.stubEnv("VITE_WGUI_POLL_MS", "2500");
  vi.resetModules();
  return import("./wgui");
}

describe("live WGUI feed", () => {
  it("sends the resolved viewer role and configured encounter identifiers", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      encounter: { id: "40", name: "Live Test" },
      combatants: []
    }), {
      status: 200,
      headers: { "Content-Type": "application/json" }
    }));
    vi.stubGlobal("fetch", fetchMock);

    const { loadEncounter, getPollInterval } = await importLiveModule();
    const result = await loadEncounter("PLAYER");

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

    await expect(loadEncounter("GM")).rejects.toThrow("WGUI encounter request failed: 503");
  });

  it("fails closed on malformed successful JSON", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({
      status: "success",
      secretEnemyData: { hp: 999 }
    }), { status: 200 })));
    const { loadEncounter } = await importLiveModule();

    await expect(loadEncounter("PLAYER")).rejects.toThrow(
      "WGUI encounter endpoint returned an unexpected shape."
    );
  });

  it("uses sample data only when no live endpoint is configured", async () => {
    vi.stubEnv("VITE_WGUI_ENCOUNTER_URL", "");
    vi.resetModules();
    const { loadEncounter } = await import("./wgui");
    const result = await loadEncounter("PLAYER");

    expect(result.source).toBe("sample");
    expect(result.snapshot.combatants.length).toBeGreaterThan(0);
  });
});
