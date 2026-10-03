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
  itemChange: null as null | ((items: any[]) => void),
  metadata: {} as Record<string, unknown>,
  metadataChange: null as null | ((metadata: Record<string, unknown>) => void)
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
    room: {
      async getMetadata() {
        return state.metadata;
      },
      async setMetadata(update: Record<string, unknown>) {
        state.metadata = { ...state.metadata, ...update };
        state.metadataChange?.(state.metadata);
      },
      onMetadataChange(callback: (metadata: Record<string, unknown>) => void) {
        state.metadataChange = callback;
        return () => {
          state.metadataChange = null;
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
  isImage: (item: any) => item?.type === "IMAGE",
  isShape: (item: any) => item?.type === "SHAPE"
}));

import {
  getSceneTokenVisuals,
  getViewerRole,
  publishManualTokenColorBook,
  publishSharedTokenColors,
  subscribeToManualTokenColorBook,
  subscribeToSceneTokenVisuals,
  subscribeToSharedTokenColors,
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
    state.metadata = {};
    state.metadataChange = null;
    window.localStorage.clear();
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

  it("uses each creature ring instead of one shared portrait color", async () => {
    state.available = true;
    const portrait = "https://tokens.example/brown-creature.png";
    const creature = (id: string, name: string, strokeColor: string) => ([
      {
        id,
        type: "IMAGE",
        layer: "CHARACTER",
        name,
        image: { url: portrait, mime: "image/png" }
      },
      {
        id: `${id}-ring`,
        type: "SHAPE",
        layer: "ATTACHMENT",
        attachedTo: id,
        shapeType: "CIRCLE",
        scale: { x: 1, y: 1 },
        style: { strokeColor, strokeOpacity: 1, strokeWidth: 5, fillOpacity: 0 }
      }
    ]);
    state.items = [
      ...creature("vestige", "Unspooled Vestige", "#7c3aed"),
      ...creature("statue", "Animated Statue", "#94a3b8")
    ];

    const tokens = await getSceneTokenVisuals("GM");
    const colors = tokens.map((token) => token.backgroundColor);

    expect(tokens).toHaveLength(2);
    expect(new Set(colors).size).toBe(colors.length);
    expect(colors).toEqual(["#7c3aed", "#94a3b8"]);
    expect(colors.every((color) => color === "#8b5a2b")).toBe(false);
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

  it("publishes GM token colors into room metadata for players", async () => {
    state.available = true;
    const seen: Record<string, string>[] = [];
    const unsubscribe = subscribeToSharedTokenColors("campaign-23", (colors) => {
      seen.push(colors);
    });

    await publishSharedTokenColors("campaign-23", { kota: "#2fb8d0" });

    await vi.waitFor(() => {
      expect(seen.at(-1)).toEqual({ kota: "#2fb8d0" });
    });

    unsubscribe();
  });

  it("restores manual token colors from room metadata after browser storage is gone", async () => {
    state.available = true;
    state.metadata = {
      "wanderers-guide/manual-token-colors": { "23::sister mirela voss": "#c95dde" }
    };
    const seen: Record<string, string>[] = [];
    const unsubscribe = subscribeToManualTokenColorBook((colors) => {
      seen.push(colors);
    });

    await vi.waitFor(() => {
      expect(seen.at(-1)).toEqual({ "23::sister mirela voss": "#c95dde" });
    });

    await publishManualTokenColorBook({
      "23::sister mirela voss": "#c95dde",
      "23::jacko": "#ef3340"
    });

    await vi.waitFor(() => {
      expect(seen.at(-1)).toEqual({
        "23::sister mirela voss": "#c95dde",
        "23::jacko": "#ef3340"
      });
    });

    unsubscribe();
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
