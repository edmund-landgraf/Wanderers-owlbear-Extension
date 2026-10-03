import OBR, { isImage, isShape } from "@owlbear-rodeo/sdk";
import type { Item, Metadata } from "@owlbear-rodeo/sdk";
import type { OwlbearTokenVisual } from "./tokenMatch";
import { normalizeCombatantName } from "./tokenMatch";
import { readTokenBackgroundColor } from "./tokenColor";
import type { ViewerRole } from "./types";

const SHARED_TOKEN_COLORS_KEY = "wanderers-guide/token-colors";
const MANUAL_TOKEN_COLORS_KEY = "wanderers-guide/manual-token-colors";
const SHARED_TOKEN_COLORS_STORAGE = "wanderers-owlbear.shared-token-colors.v1";

export type SharedTokenColorMap = Record<string, string>;

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

function attachedRingColor(itemId: string, items: Item[]): string | null {
  const rings = items.filter((other) => {
    if (other.attachedTo !== itemId || !isShape(other) || other.shapeType !== "CIRCLE") return false;
    const { strokeColor, strokeOpacity, strokeWidth } = other.style ?? {};
    return Boolean(strokeColor) && strokeOpacity !== 0 && strokeWidth !== 0;
  });
  rings.sort((left, right) => (right.scale?.x ?? 1) - (left.scale?.x ?? 1));
  return rings[0]?.style.strokeColor ?? null;
}

async function itemToTokenVisual(item: Item, items: Item[]): Promise<OwlbearTokenVisual | null> {
  if (item.layer !== "CHARACTER" || !isImage(item) || !item.name?.trim()) return null;
  if (!item.image?.url) return null;

  const backgroundColor = attachedRingColor(item.id, items)
    ?? await readTokenBackgroundColor(item.image.url, item.image.mime);

  return {
    id: item.id,
    name: item.name,
    backgroundColor
  };
}

async function tokenVisualsFromItems(items: Item[]): Promise<OwlbearTokenVisual[]> {
  const resolved = await Promise.all(items.map((item) => itemToTokenVisual(item, items)));
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

function readStoredColorBook(): Record<string, SharedTokenColorMap> {
  try {
    const raw = window.localStorage.getItem(SHARED_TOKEN_COLORS_STORAGE);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed as Record<string, SharedTokenColorMap> : {};
  } catch {
    return {};
  }
}

function colorsForScope(book: unknown, campaignScope: string): SharedTokenColorMap {
  if (!book || typeof book !== "object") return {};
  const scope = (book as Record<string, unknown>)[campaignScope];
  if (!scope || typeof scope !== "object") return {};
  const colors: SharedTokenColorMap = {};
  for (const [name, color] of Object.entries(scope)) {
    if (typeof color === "string") colors[name] = color;
  }
  return colors;
}

export function sharedTokenColorKey(combatantName: string): string {
  return normalizeCombatantName(combatantName);
}

export async function publishSharedTokenColors(
  campaignScope: string,
  colors: SharedTokenColorMap
): Promise<void> {
  const book = readStoredColorBook();
  book[campaignScope] = colors;
  window.localStorage.setItem(SHARED_TOKEN_COLORS_STORAGE, JSON.stringify(book));

  if (!OBR.isAvailable) return;
  await waitUntilReady();
  const metadata = await OBR.room.getMetadata();
  const current = metadata[SHARED_TOKEN_COLORS_KEY];
  const nextBook = current && typeof current === "object" ? { ...(current as Record<string, SharedTokenColorMap>) } : {};
  nextBook[campaignScope] = colors;
  await OBR.room.setMetadata({ [SHARED_TOKEN_COLORS_KEY]: nextBook });
}

function colorBook(value: unknown): Record<string, string> {
  if (!value || typeof value !== "object") return {};
  const colors: Record<string, string> = {};
  for (const [key, color] of Object.entries(value)) {
    if (typeof color === "string") colors[key] = color;
  }
  return colors;
}

/** Room metadata survives the extension tab losing its browser storage. */
export async function publishManualTokenColorBook(colors: Record<string, string>): Promise<void> {
  if (!OBR.isAvailable) return;
  await waitUntilReady();
  await OBR.room.setMetadata({ [MANUAL_TOKEN_COLORS_KEY]: colors });
}

export function subscribeToManualTokenColorBook(
  onColors: (colors: Record<string, string>) => void
): () => void {
  if (!OBR.isAvailable) {
    onColors({});
    return () => {};
  }

  let active = true;
  let unsubscribe = () => {};
  const apply = (metadata: Metadata) => {
    if (!active) return;
    onColors(colorBook(metadata[MANUAL_TOKEN_COLORS_KEY]));
  };
  const attach = () => {
    if (!active) return;
    unsubscribe();
    unsubscribe = OBR.room.onMetadataChange(apply);
    void OBR.room.getMetadata().then(apply);
  };

  if (OBR.isReady) attach();
  else OBR.onReady(attach);

  return () => {
    active = false;
    unsubscribe();
  };
}

export function subscribeToSharedTokenColors(
  campaignScope: string,
  onColors: (colors: SharedTokenColorMap) => void
): () => void {
  let active = true;

  if (!OBR.isAvailable) {
    onColors(colorsForScope(readStoredColorBook(), campaignScope));
    const onStorage = (event: StorageEvent) => {
      if (event.key !== SHARED_TOKEN_COLORS_STORAGE) return;
      onColors(colorsForScope(readStoredColorBook(), campaignScope));
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }

  let unsubscribe = () => {};
  const apply = (metadata: Metadata) => {
    if (!active) return;
    onColors(colorsForScope(metadata[SHARED_TOKEN_COLORS_KEY], campaignScope));
  };
  const attach = () => {
    if (!active) return;
    unsubscribe();
    unsubscribe = OBR.room.onMetadataChange(apply);
    void OBR.room.getMetadata().then(apply);
  };

  if (OBR.isReady) attach();
  else OBR.onReady(attach);

  return () => {
    active = false;
    unsubscribe();
  };
}
