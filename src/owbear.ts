import OBR from "@owlbear-rodeo/sdk";
import type { ViewerRole } from "./types";

function queryRole(): ViewerRole | null {
  const value = new URLSearchParams(window.location.search).get("role")?.toUpperCase();
  return value === "GM" || value === "PLAYER" ? value : null;
}

export async function getViewerRole(): Promise<ViewerRole> {
  const forced = queryRole();
  if (forced) return forced;

  if (!OBR.isAvailable) {
    return "GM";
  }

  return new Promise((resolve) => {
    OBR.onReady(async () => {
      try {
        resolve(await OBR.player.getRole());
      } catch {
        resolve("GM");
      }
    });
  });
}

export function isOwlbearAvailable(): boolean {
  return OBR.isAvailable;
}
