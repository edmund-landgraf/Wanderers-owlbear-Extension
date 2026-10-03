// @vitest-environment jsdom

import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  roleResolver: null as null | ((role: "GM" | "PLAYER") => void),
  roleChange: null as null | ((role: "GM" | "PLAYER") => void),
  loadCampaignOptions: vi.fn(),
  loadEncounterOptions: vi.fn(),
  loadEncounter: vi.fn(),
  getSceneTokenVisuals: vi.fn(),
  publishSharedTokenColors: vi.fn(),
  publishManualTokenColorBook: vi.fn(),
  manualColorBook: {} as Record<string, string>,
  sharedColors: {} as Record<string, string>,
  sharedListener: null as null | ((colors: Record<string, string>) => void)
}));

vi.mock("./owbear", () => ({
  isOwlbearAvailable: () => true,
  getViewerRole: () => new Promise<"GM" | "PLAYER">((resolve) => {
    mocks.roleResolver = resolve;
  }),
  subscribeToViewerRole: (callback: (role: "GM" | "PLAYER") => void) => {
    mocks.roleChange = callback;
    return () => {
      mocks.roleChange = null;
    };
  },
  getSceneTokenVisuals: mocks.getSceneTokenVisuals,
  publishSharedTokenColors: mocks.publishSharedTokenColors,
  publishManualTokenColorBook: mocks.publishManualTokenColorBook,
  subscribeToManualTokenColorBook: (onColors: (colors: Record<string, string>) => void) => {
    onColors(mocks.manualColorBook);
    return () => {};
  },
  sharedTokenColorKey: (name: string) => name.trim().toLocaleLowerCase(),
  subscribeToSharedTokenColors: (_scope: string, onColors: (colors: Record<string, string>) => void) => {
    mocks.sharedListener = onColors;
    onColors(mocks.sharedColors);
    return () => {
      mocks.sharedListener = null;
    };
  }
}));

vi.mock("./wgui", () => ({
  getPollInterval: () => 60_000,
  loadCampaignOptions: mocks.loadCampaignOptions,
  loadEncounterOptions: mocks.loadEncounterOptions,
  loadEncounter: mocks.loadEncounter
}));

import App from "./App";

const emptyResponse = {
  source: "live",
  lastUpdated: new Date("2026-10-02T18:00:00Z"),
  snapshot: {
    encounter: {
      id: "40",
      name: "wg combat test",
      campaignName: "The Price of Prophecy (Production)",
      round: 1
    },
    combatants: []
  }
};

async function resolveRole(role: "GM" | "PLAYER") {
  await act(async () => {
    mocks.roleResolver?.(role);
  });
  await waitFor(() => expect(screen.getByLabelText("Campaign")).toBeTruthy());
}

async function selectCampaignAndEncounter() {
  fireEvent.change(screen.getByLabelText("Campaign"), { target: { value: "23" } });
  await waitFor(() => expect(screen.getByLabelText("Encounter")).toBeTruthy());
  fireEvent.change(screen.getByLabelText("Encounter"), { target: { value: "40" } });
}

describe("role-gated encounter loading and selection", () => {
  beforeEach(() => {
    localStorage.clear();
    mocks.roleResolver = null;
    mocks.roleChange = null;

    mocks.loadCampaignOptions.mockReset();
    mocks.loadEncounterOptions.mockReset();
    mocks.loadEncounter.mockReset();
    mocks.getSceneTokenVisuals.mockReset();
    mocks.publishSharedTokenColors.mockReset();
    mocks.publishManualTokenColorBook.mockReset();
    mocks.manualColorBook = {};
    mocks.sharedColors = {};
    mocks.sharedListener = null;

    mocks.loadCampaignOptions.mockResolvedValue([
      { id: "23", name: "The Price of Prophecy (Production)", relation: "owner" }
    ]);
    mocks.loadEncounterOptions.mockResolvedValue([
      { id: "40", name: "wg combat test", combatantCount: 8 }
    ]);
    mocks.loadEncounter.mockResolvedValue(emptyResponse);
    mocks.getSceneTokenVisuals.mockResolvedValue([]);
  });

  it("shows campaign first, then encounter, and does not load combat until both are chosen", async () => {
    render(<App />);

    expect(screen.getByText("Connecting to Owlbear…")).toBeTruthy();
    expect(mocks.loadEncounter).not.toHaveBeenCalled();

    await resolveRole("GM");

    expect(screen.getByLabelText("Campaign")).toBeTruthy();
    expect(screen.queryByLabelText("Encounter")).toBeNull();
    expect(mocks.loadEncounter).not.toHaveBeenCalled();

    fireEvent.change(screen.getByLabelText("Campaign"), { target: { value: "23" } });
    await waitFor(() => expect(screen.getByLabelText("Encounter")).toBeTruthy());
    expect(mocks.loadEncounter).not.toHaveBeenCalled();

    fireEvent.change(screen.getByLabelText("Encounter"), { target: { value: "40" } });

    await waitFor(() => {
      expect(mocks.loadEncounter).toHaveBeenCalledWith(
        "GM",
        expect.any(AbortSignal),
        { campaignId: "23", fightId: "40" },
        null,
        "The Price of Prophecy (Production)"
      );
    });

    expect(screen.queryByLabelText("Campaign")).toBeNull();
    expect(screen.getByRole("button", { name: "Change" })).toBeTruthy();
  });

  it("matches Owlbear accessibility names and applies sampled SVG colors on request", async () => {
    mocks.loadEncounter.mockResolvedValueOnce({
      source: "live",
      lastUpdated: new Date("2026-10-02T18:00:00Z"),
      snapshot: {
        encounter: {
          id: "40",
          name: "wg combat test",
          campaignName: "The Price of Prophecy (Production)",
          round: 1
        },
        combatants: [
          {
            id: "kota",
            name: "Kota",
            side: "ally",
            initiative: 18,
            ac: 19,
            hp: { current: 24, max: 24 },
            conditions: []
          },
          {
            id: "hadrosaurid",
            name: "Hadrosaurid",
            side: "enemy",
            initiative: 16,
            ac: 18,
            hp: { current: 40, max: 59 },
            conditions: []
          }
        ]
      }
    });
    mocks.getSceneTokenVisuals.mockResolvedValue([
      { id: "kota-token", name: "Kota", backgroundColor: "#2fb8d0" },
      { id: "hadro-token", name: "Hadrosaurid", backgroundColor: "#e8a832" }
    ]);

    render(<App />);
    await resolveRole("GM");
    await selectCampaignAndEncounter();
    await waitFor(() => expect(screen.getByText("Kota")).toBeTruthy());

    fireEvent.click(screen.getByRole("button", { name: "Match token colors" }));

    await waitFor(() => {
      expect(mocks.getSceneTokenVisuals).toHaveBeenCalledWith("GM");
      expect(screen.getByTitle("Matched token color: Kota")).toBeTruthy();
      expect(screen.getByTitle("Matched token color: Hadrosaurid")).toBeTruthy();
    });

    const circles = [
      screen.getByTitle("Matched token color: Kota"),
      screen.getByTitle("Matched token color: Hadrosaurid")
    ];
    const colors = circles.map((circle) => getComputedStyle(circle).backgroundColor);
    expect(new Set(colors).size).toBe(circles.length);
    expect(colors).toEqual(["rgb(47, 184, 208)", "rgb(232, 168, 50)"]);

    expect(screen.getByText(/Matched 2 of 2: Kota, Hadrosaurid/)).toBeTruthy();
    await waitFor(() => {
      expect(mocks.publishSharedTokenColors).toHaveBeenCalledWith("23", {
        kota: "#2fb8d0",
        hadrosaurid: "#e8a832"
      });
    });
  });

  it("uses GM-published token colors in the player view", async () => {
    mocks.sharedColors = { kota: "#2fb8d0" };
    mocks.loadEncounter.mockResolvedValueOnce({
      source: "live",
      lastUpdated: new Date("2026-10-02T18:00:00Z"),
      snapshot: {
        encounter: {
          id: "40",
          name: "wg combat test",
          campaignName: "The Price of Prophecy (Production)",
          round: 1
        },
        combatants: [
          {
            id: "kota",
            name: "Kota",
            side: "ally",
            initiative: 18,
            ac: 19,
            hp: { current: 24, max: 24 },
            conditions: []
          }
        ]
      }
    });

    render(<App />);
    await resolveRole("PLAYER");
    await selectCampaignAndEncounter();

    await waitFor(() => {
      expect(screen.getByTitle("Matched token color: Kota")).toBeTruthy();
    });
    expect(getComputedStyle(screen.getByTitle("Matched token color: Kota")).backgroundColor).toBe("rgb(47, 184, 208)");
    expect(screen.queryByRole("button", { name: /Set Kota token color/ })).toBeNull();
  });

  it("restores matched token colors after a reload", async () => {
    mocks.sharedColors = { kota: "#2fb8d0", hadrosaurid: "#e8a832" };
    mocks.loadEncounter.mockResolvedValueOnce({
      source: "live",
      lastUpdated: new Date("2026-10-02T18:00:00Z"),
      snapshot: {
        encounter: {
          id: "40",
          name: "wg combat test",
          campaignName: "The Price of Prophecy (Production)",
          round: 1
        },
        combatants: [
          {
            id: "kota",
            name: "Kota",
            side: "ally",
            initiative: 18,
            ac: 19,
            hp: { current: 24, max: 24 },
            conditions: []
          },
          {
            id: "hadrosaurid",
            name: "Hadrosaurid",
            side: "enemy",
            initiative: 16,
            ac: 18,
            hp: { current: 40, max: 59 },
            conditions: []
          }
        ]
      }
    });

    render(<App />);
    await resolveRole("GM");
    await selectCampaignAndEncounter();

    await waitFor(() => {
      expect(screen.getByTitle("Matched token color: Kota")).toBeTruthy();
      expect(screen.getByTitle("Matched token color: Hadrosaurid")).toBeTruthy();
    });
    expect(getComputedStyle(screen.getByTitle("Matched token color: Kota")).backgroundColor).toBe("rgb(47, 184, 208)");
    expect(getComputedStyle(screen.getByTitle("Matched token color: Hadrosaurid")).backgroundColor).toBe("rgb(232, 168, 50)");
    expect(mocks.getSceneTokenVisuals).not.toHaveBeenCalled();
  });

  it("restores manual colors from the room after browser storage is empty", async () => {
    mocks.manualColorBook = { "23::kota": "#6d28d9" };
    mocks.loadEncounter.mockResolvedValueOnce({
      source: "live",
      lastUpdated: new Date("2026-10-02T18:00:00Z"),
      snapshot: {
        encounter: {
          id: "40",
          name: "wg combat test",
          campaignName: "The Price of Prophecy (Production)",
          round: 1
        },
        combatants: [
          {
            id: "kota",
            name: "Kota",
            side: "ally",
            initiative: 18,
            ac: 19,
            hp: { current: 24, max: 24 },
            conditions: []
          }
        ]
      }
    });

    render(<App />);
    await resolveRole("GM");
    await selectCampaignAndEncounter();

    await waitFor(() => {
      expect(screen.getByTitle("Manual token color")).toBeTruthy();
    });
  });

  it("passes Player role through the campaign and encounter catalog", async () => {
    render(<App />);
    await resolveRole("PLAYER");

    expect(mocks.loadCampaignOptions).toHaveBeenCalledWith("PLAYER", expect.any(AbortSignal), null);

    fireEvent.change(screen.getByLabelText("Campaign"), { target: { value: "23" } });
    await waitFor(() => {
      expect(mocks.loadEncounterOptions).toHaveBeenCalledWith("23", "PLAYER", expect.any(AbortSignal), null);
    });
  });

  it("restores the last campaign and encounter after reload until Change is used", async () => {
    localStorage.setItem(
      "wanderers-owlbear-selection",
      JSON.stringify({ campaignId: "23", encounterId: "40" })
    );

    render(<App />);
    await resolveRole("GM");

    await waitFor(() => {
      expect(mocks.loadEncounter).toHaveBeenCalledWith(
        "GM",
        expect.any(AbortSignal),
        { campaignId: "23", fightId: "40" },
        null,
        "The Price of Prophecy (Production)"
      );
    });

    expect(screen.queryByLabelText("Campaign")).toBeNull();
    expect(screen.getByRole("button", { name: "Change" })).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Change" }));
    expect((screen.getByLabelText("Campaign") as HTMLSelectElement).value).toBe("23");
    expect((screen.getByLabelText("Encounter") as HTMLSelectElement).value).toBe("40");
  });

  it("Change reopens the selected campaign and encounter controls", async () => {
    render(<App />);
    await resolveRole("GM");
    await selectCampaignAndEncounter();

    await waitFor(() => expect(screen.getByRole("button", { name: "Change" })).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: "Change" }));

    expect((screen.getByLabelText("Campaign") as HTMLSelectElement).value).toBe("23");
    expect((screen.getByLabelText("Encounter") as HTMLSelectElement).value).toBe("40");

    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(screen.queryByLabelText("Campaign")).toBeNull();
  });

  it("never overlaps polling requests when a feed response is slow", async () => {
    vi.useFakeTimers();

    let resolveFirst: ((value: unknown) => void) | null = null;
    const firstResponse = new Promise((resolve) => {
      resolveFirst = resolve;
    });

    mocks.loadEncounter
      .mockReturnValueOnce(firstResponse)
      .mockResolvedValue(emptyResponse);

    render(<App />);

    await act(async () => {
      mocks.roleResolver?.("GM");
      await Promise.resolve();
    });

    fireEvent.change(screen.getByLabelText("Campaign"), { target: { value: "23" } });
    await act(async () => {
      await Promise.resolve();
    });
    fireEvent.change(screen.getByLabelText("Encounter"), { target: { value: "40" } });

    await act(async () => {
      await Promise.resolve();
    });
    expect(mocks.loadEncounter).toHaveBeenCalledTimes(1);

    await act(async () => {
      vi.advanceTimersByTime(180_000);
      await Promise.resolve();
    });
    expect(mocks.loadEncounter).toHaveBeenCalledTimes(1);

    await act(async () => {
      resolveFirst?.(emptyResponse);
      await Promise.resolve();
    });

    await act(async () => {
      vi.advanceTimersByTime(60_000);
      await Promise.resolve();
    });
    expect(mocks.loadEncounter).toHaveBeenCalledTimes(2);

    vi.useRealTimers();
  });

  it("clears GM encounter data and selection immediately when Owlbear downgrades to Player", async () => {
    mocks.loadEncounter.mockResolvedValueOnce({
      source: "live",
      lastUpdated: new Date("2026-10-02T18:00:00Z"),
      snapshot: {
        encounter: {
          id: "40",
          name: "wg combat test",
          campaignName: "The Price of Prophecy (Production)",
          round: 1
        },
        combatants: [{
          id: "enemy",
          name: "Hadrosaurid",
          side: "enemy",
          initiative: 16,
          ac: 18,
          hp: { current: 40, max: 59 },
          conditions: []
        }]
      }
    });

    render(<App />);
    await resolveRole("GM");
    await selectCampaignAndEncounter();
    await waitFor(() => expect(screen.getByText("40 / 59")).toBeTruthy());

    await act(async () => {
      mocks.roleChange?.("PLAYER");
    });

    expect(screen.queryByText("40 / 59")).toBeNull();
    expect(screen.getByText("PLAYER VIEW")).toBeTruthy();
    await waitFor(() => expect(screen.getByLabelText("Campaign")).toBeTruthy());
    expect(screen.queryByLabelText("Encounter")).toBeNull();
  });
});
