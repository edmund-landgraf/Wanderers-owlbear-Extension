// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from "vitest";

const purpleSvg = "data:image/svg+xml,%3Csvg%3E%3Ccircle%20fill%3D%22%236d28d9%22%2F%3E%3C%2Fsvg%3E";
const blueSvg = "data:image/svg+xml,%3Csvg%3E%3Ccircle%20fill%3D%22%232fb8d0%22%2F%3E%3C%2Fsvg%3E";

const state = vi.hoisted(() => ({
  available: false,
  ready: true,
  role: "GM" as "GM" | "PLAYER",
  failRole: false,
  playerChange: null as null | ((player: { role: "GM" | "PLAYER" }) => void),
  readyCallback: null as null | (() => void),
  items: [] as any[],
  itemChange: null as null | ((items: any[]) => void)
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
      if (state.ready) callback();
      else state.readyCallback = callback;
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
    },
    scene: {
      items: {
        async getItems() {
          return state.items;
        },
        onChange(callback: (items: any[]) => void) {
          state.itemChange = callback;
          return () => {
            state.itemChange = null;
          };
        }
      }
    }
  },
  isImage: (item: any) => item?.type === "IMAGE"
}));

import {
  getSceneTokenVisuals,
  getViewerRole,
  subscribeToSceneTokenVisuals,
  subscribeToViewerRole
} from "./owbear";

describe("Owlbear role and token handling", () => {
  beforeEach(() => {
    state.available = false;
    state.ready = true;
    state.role = "GM";
    state.failRole = false;
    state.playerChange = null;
    state.readyCallback = null;
    state.items = [];
    state.itemChange = null;
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

  it("reads GM-visible CHARACTER names and extracts SVG color without rendering the SVG", async () => {
    state.available = true;
    state.items = [
      {
        id: "ulysses-token",
        type: "IMAGE",
        layer: "CHARACTER",
        name: "Ulysses",
        image: { url: purpleSvg, mime: "image/svg+xml" }
      },
      {
        id: "map",
        type: "IMAGE",
        layer: "MAP",
        name: "Ulysses",
        image: { url: purpleSvg, mime: "image/svg+xml" }
      },
      {
        id: "text",
        type: "TEXT",
        layer: "CHARACTER",
        name: "Ulysses"
      }
    ];

    await expect(getSceneTokenVisuals("GM")).resolves.toEqual([
      {
        id: "ulysses-token",
        name: "Ulysses",
        backgroundColor: "#6d28d9"
      }
    ]);
  });

  it("never reads scene token names for Player view", async () => {
    state.available = true;
    state.items = [{
      id: "secret",
      type: "IMAGE",
      layer: "CHARACTER",
      name: "Secret Creature",
      image: { url: purpleSvg, mime: "image/svg+xml" }
    }];

    await expect(getSceneTokenVisuals("PLAYER")).resolves.toEqual([]);
  });

  it("subscribes to scene token colors for GM only", async () => {
    state.available = true;
    const updates: unknown[] = [];
    const unsubscribe = subscribeToSceneTokenVisuals("GM", (tokens) => updates.push(tokens));

    state.itemChange?.([{
      id: "kota-token",
      type: "IMAGE",
      layer: "CHARACTER",
      name: "Kota",
      image: { url: blueSvg, mime: "image/svg+xml" }
    }]);

    await vi.waitFor(() => {
      expect(updates).toEqual([[
        { id: "kota-token", name: "Kota", backgroundColor: "#2fb8d0" }
      ]]);
    });

    unsubscribe();
    expect(state.itemChange).toBeNull();
  });

  it("does not attach a late role listener after the consumer unsubscribes", () => {
    state.available = true;
    state.ready = false;

    const unsubscribe = subscribeToViewerRole(() => {});
    expect(state.playerChange).toBeNull();

    unsubscribe();
    state.readyCallback?.();

    expect(state.playerChange).toBeNull();
  });
});
