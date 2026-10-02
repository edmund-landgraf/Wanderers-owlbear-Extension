// @vitest-environment jsdom

import { act, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  roleResolver: null as null | ((role: "GM" | "PLAYER") => void),
  roleChange: null as null | ((role: "GM" | "PLAYER") => void),
  loadEncounter: vi.fn()
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
  }
}));

vi.mock("./wgui", () => ({
  getPollInterval: () => 60_000,
  loadEncounter: mocks.loadEncounter
}));

import App from "./App";

describe("role-gated encounter loading", () => {
  beforeEach(() => {
    mocks.roleResolver = null;
    mocks.roleChange = null;
    mocks.loadEncounter.mockReset();
    mocks.loadEncounter.mockResolvedValue({
      source: "live",
      lastUpdated: new Date("2026-10-02T18:00:00Z"),
      snapshot: {
        encounter: { id: "40", name: "Test Encounter", round: 1 },
        combatants: []
      }
    });
  });

  it("does not request encounter data until Owlbear role resolves", async () => {
    render(<App />);

    expect(screen.getByText("Connecting to Owlbear…")).toBeTruthy();
    expect(mocks.loadEncounter).not.toHaveBeenCalled();

    await act(async () => {
      mocks.roleResolver?.("PLAYER");
    });

    await waitFor(() => {
      expect(mocks.loadEncounter).toHaveBeenCalledTimes(1);
    });
    expect(mocks.loadEncounter).toHaveBeenCalledWith("PLAYER", expect.any(AbortSignal));
    expect(screen.getByText("PLAYER VIEW")).toBeTruthy();
  });

  it("requests GM projection only after GM role resolves", async () => {
    render(<App />);
    expect(mocks.loadEncounter).not.toHaveBeenCalled();

    await act(async () => {
      mocks.roleResolver?.("GM");
    });

    await waitFor(() => {
      expect(mocks.loadEncounter).toHaveBeenCalledWith("GM", expect.any(AbortSignal));
    });
    expect(screen.getByText("GM VIEW")).toBeTruthy();
  });

  it("clears GM data immediately before loading a downgraded Player projection", async () => {
    let resolvePlayer: ((value: unknown) => void) | null = null;
    const playerResponse = new Promise((resolve) => {
      resolvePlayer = resolve;
    });

    mocks.loadEncounter
      .mockResolvedValueOnce({
        source: "live",
        lastUpdated: new Date("2026-10-02T18:00:00Z"),
        snapshot: {
          encounter: { id: "40", name: "Test Encounter", round: 1 },
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
      })
      .mockReturnValueOnce(playerResponse);

    render(<App />);

    await act(async () => {
      mocks.roleResolver?.("GM");
    });
    await waitFor(() => expect(screen.getByText("40 / 59")).toBeTruthy());

    await act(async () => {
      mocks.roleChange?.("PLAYER");
    });

    expect(screen.queryByText("40 / 59")).toBeNull();
    expect(screen.getByText("Loading encounter…")).toBeTruthy();

    await act(async () => {
      resolvePlayer?.({
        source: "live",
        lastUpdated: new Date("2026-10-02T18:00:01Z"),
        snapshot: {
          encounter: { id: "40", name: "Test Encounter", round: 1 },
          combatants: [{
            id: "enemy",
            name: "Hadrosaurid",
            side: "enemy",
            initiative: 16,
            hp: { state: "Injured" },
            conditions: []
          }]
        }
      });
    });

    await waitFor(() => expect(screen.getByText("Injured")).toBeTruthy());
    expect(screen.getByText("PLAYER VIEW")).toBeTruthy();
    expect(screen.queryByText("40 / 59")).toBeNull();
  });
});
