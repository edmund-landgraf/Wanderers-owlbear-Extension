import OBR, { isImage } from "@owlbear-rodeo/sdk";
import type { Item } from "@owlbear-rodeo/sdk";
import type { OwlbearTokenVisual } from "./tokenMatch";
import { readTokenBackgroundColor } from "./tokenColor";
import type { ViewerRole } from "./types";

function queryRole(): ViewerRole | null {
  const value = new URLSearchParams(window.location.search).get("role")?.toUpperCase();
  return value === "GM" || value === "PLAYER" ? value : null;
}

export async function getViewerRole(): Promise<ViewerRole> {
  if (!OBR.isAvailable) {
    return queryRole() ?? "GM";
  }

  return new Promise((resolve) => {
    OBR.onReady(async () => {
      try {
        resolve(await OBR.player.getRole());
      } catch {
        resolve("PLAYER");
      }
    });
  });
}

export function subscribeToViewerRole(onRole: (role: ViewerRole) => void): () => void {
  if (!OBR.isAvailable) return () => {};

  let active = true;
  let unsubscribePlayer = () => {};
  const attach = () => {
    if (!active) return;
    unsubscribePlayer();
    unsubscribePlayer = OBR.player.onChange((player) => onRole(player.role));
  };

  if (OBR.isReady) {
    attach();
  } else {
    OBR.onReady(attach);
  }

  return () => {
    active = false;
    unsubscribePlayer();
  };
}

async function itemToTokenVisual(item: Item): Promise<OwlbearTokenVisual | null> {
  if (item.layer !== "CHARACTER" || !isImage(item) || !item.name?.trim()) return null;
  if (!item.image?.url) return null;

  const backgroundColor = await readTokenBackgroundColor(item.image.url, item.image.mime);

  return {
    id: item.id,
    name: item.name,
    backgroundColor
  };
}

async function tokenVisualsFromItems(items: Item[]): Promise<OwlbearTokenVisual[]> {
  const resolved = await Promise.all(items.map(itemToTokenVisual));
  return resolved.filter((item): item is OwlbearTokenVisual => item !== null);
}

async function waitUntilReady(): Promise<void> {
  if (OBR.isReady) return;
  await new Promise<void>((resolve) => OBR.onReady(resolve));
}

export async function getSceneTokenVisuals(role: ViewerRole): Promise<OwlbearTokenVisual[]> {
  if (role !== "GM" || !OBR.isAvailable) return [];

  await waitUntilReady();
  const items = await OBR.scene.items.getItems();
  return tokenVisualsFromItems(items);
}

export function subscribeToSceneTokenVisuals(
  role: ViewerRole,
  onTokens: (tokens: OwlbearTokenVisual[]) => void
): () => void {
  if (role !== "GM" || !OBR.isAvailable) return () => {};

  let active = true;
  let unsubscribeItems = () => {};

  const attach = () => {
    if (!active) return;
    unsubscribeItems();
    unsubscribeItems = OBR.scene.items.onChange((items) => {
      void tokenVisualsFromItems(items).then((tokens) => {
        if (active) onTokens(tokens);
      });
    });
  };

  if (OBR.isReady) attach();
  else OBR.onReady(attach);

  return () => {
    active = false;
    unsubscribeItems();
  };
}

export function isOwlbearAvailable(): boolean {
  return OBR.isAvailable;
}
