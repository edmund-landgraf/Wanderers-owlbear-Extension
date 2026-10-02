// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  available: false,
  ready: true,
  role: "GM" as "GM" | "PLAYER",
  failRole: false,
  playerChange: null as null | ((player: { role: "GM" | "PLAYER" }) => void)
}));

vi.mock("@owlbear-rodeo/sdk", () => ({
  default: {
    get isAvailable() {
      return state.available;
    },
    get isReady() {
      return state.ready;
    },
    onReady(callback: () => void) {
      callback();
      return () => {};
    },
    player: {
      async getRole() {
        if (state.failRole) throw new Error("role unavailable");
        return state.role;
      },
      onChange(callback: (player: { role: "GM" | "PLAYER" }) => void) {
        state.playerChange = callback;
        return () => {
          state.playerChange = null;
        };
      }
    }
  }
}));

import { getViewerRole, subscribeToViewerRole } from "./owbear";

describe("Owlbear role handling", () => {
  beforeEach(() => {
    state.available = false;
    state.ready = true;
    state.role = "GM";
    state.failRole = false;
    state.playerChange = null;
    window.history.replaceState({}, "", "/");
  });

  it("allows query role only for standalone browser preview", async () => {
    window.history.replaceState({}, "", "/?role=PLAYER");
    expect(await getViewerRole()).toBe("PLAYER");
  });

  it("ignores query role when actually embedded in Owlbear", async () => {
    state.available = true;
    state.role = "PLAYER";
    window.history.replaceState({}, "", "/?role=GM");

    expect(await getViewerRole()).toBe("PLAYER");
  });

  it("fails closed to PLAYER when Owlbear role lookup errors", async () => {
    state.available = true;
    state.failRole = true;

    expect(await getViewerRole()).toBe("PLAYER");
  });

  it("subscribes to role changes while embedded", () => {
    state.available = true;
    const roles: string[] = [];
    const unsubscribe = subscribeToViewerRole((role) => roles.push(role));

    state.playerChange?.({ role: "PLAYER" });
    state.playerChange?.({ role: "GM" });
    expect(roles).toEqual(["PLAYER", "GM"]);

    unsubscribe();
    expect(state.playerChange).toBeNull();
  });
});
