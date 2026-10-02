import OBR from "@owlbear-rodeo/sdk";
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
        // Fail closed if the embedded SDK cannot establish the user's role.
        resolve("PLAYER");
      }
    });
  });
}

export function subscribeToViewerRole(onRole: (role: ViewerRole) => void): () => void {
  if (!OBR.isAvailable) return () => {};

  let unsubscribePlayer = () => {};
  const attach = () => {
    unsubscribePlayer();
    unsubscribePlayer = OBR.player.onChange((player) => onRole(player.role));
  };

  if (OBR.isReady) {
    attach();
  } else {
    OBR.onReady(attach);
  }

  return () => {
    unsubscribePlayer();
  };
}

export function isOwlbearAvailable(): boolean {
  return OBR.isAvailable;
}
