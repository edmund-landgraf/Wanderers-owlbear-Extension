import OBR from "@owlbear-rodeo/sdk";
import { getViewerRole } from "../owbear";
import { getPollInterval, loadEncounterDiceMeta } from "../wgui";
import { getWguiSession } from "../wguiAuth";
import {
  DICE_CHANNEL,
  DICE_EVENT_STORAGE,
  DICE_MODAL_ID,
  isDiceAnimationEvent
} from "./diceEvent";
import { createDiceRelay } from "./diceRelay";

const SELECTION_KEY = "wanderers-owlbear-selection-local";

function readSelection() {
  try {
    const raw = localStorage.getItem(SELECTION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { campaignId?: unknown; encounterId?: unknown };
    if (typeof parsed.campaignId !== "string" || typeof parsed.encounterId !== "string") return null;
    if (!parsed.campaignId || !parsed.encounterId) return null;
    return { campaignId: parsed.campaignId, fightId: parsed.encounterId };
  } catch {
    return null;
  }
}

async function openDiceModal() {
  if (!OBR.isAvailable) return;
  await OBR.modal.open({
    id: DICE_MODAL_ID,
    url: "/dice-overlay",
    fullScreen: true,
    hideBackdrop: true,
    hidePaper: true,
    disablePointerEvents: false
  });
}

export function startDiceWatch() {
  const relay = createDiceRelay();
  let stopped = false;
  let timer = 0;
  let unsubscribe = () => {};

  const present = async (data: unknown) => {
    if (!isDiceAnimationEvent(data)) return;
    const role = await getViewerRole();
    if (!relay.accept(data, role)) return;
    localStorage.setItem(DICE_EVENT_STORAGE, JSON.stringify(data));
    await openDiceModal();
  };

  const poll = async () => {
    if (stopped) return;
    try {
      if (OBR.isAvailable) {
        const role = await getViewerRole();
        const session = await getWguiSession();
        const selection = readSelection();
        if (session && selection) {
          const meta = await loadEncounterDiceMeta(selection, session);
          const scope = `${selection.campaignId}:${selection.fightId}`;
          for (const event of relay.takeNew(meta, scope)) {
            if (event.audience === "gm" && role !== "GM") continue;
            await present(event);
            await OBR.broadcast.sendMessage(DICE_CHANNEL, event, { destination: "ALL" });
          }
        }
      }
    } catch {
      // The next poll retries. A missing dice log is not a combat failure.
    }
    if (!stopped) timer = window.setTimeout(poll, getPollInterval());
  };

  const boot = async () => {
    if (OBR.isAvailable) {
      if (!OBR.isReady) {
        await new Promise<void>((resolve) => OBR.onReady(resolve));
      }
      if (stopped) return;
      unsubscribe = OBR.broadcast.onMessage(DICE_CHANNEL, (message) => {
        void present(message.data);
      });
    }
    void poll();
  };

  void boot();

  return () => {
    stopped = true;
    window.clearTimeout(timer);
    unsubscribe();
  };
}
