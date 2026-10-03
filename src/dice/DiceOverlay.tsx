import { useEffect, useState } from "react";
import OBR from "@owlbear-rodeo/sdk";
import { getViewerRole } from "../owbear";
import {
  DICE_EVENT_STORAGE,
  DICE_MODAL_ID,
  diceLabel,
  diceRollConfig,
  isDiceAnimationEvent,
  type WgDiceAnimationEvent
} from "./diceEvent";
import { diceLabelPositions } from "./diceLabels";

function readStoredEvent(): WgDiceAnimationEvent | null {
  try {
    const raw = localStorage.getItem(DICE_EVENT_STORAGE);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    return isDiceAnimationEvent(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export default function DiceOverlay() {
  const [event] = useState(readStoredEvent);
  const [failed, setFailed] = useState(false);
  const [labels, setLabels] = useState<Array<{ name: string; x: number; y: number }>>([]);

  useEffect(() => {
    document.body.classList.add("dice-overlay");
    return () => document.body.classList.remove("dice-overlay");
  }, []);

  useEffect(() => {
    const host = document.getElementById("dice-host");
    if (!host || !event) return;
    let cancelled = false;
    let frame = 0;
    let roller: { destroy: () => void } | null = null;

    const close = () => {
      if (cancelled) return;
      cancelled = true;
      if (OBR.isAvailable) void OBR.modal.close(DICE_MODAL_ID);
    };

    const onKey = (keyEvent: KeyboardEvent) => {
      if (keyEvent.key === "Escape") close();
    };
    const onClick = () => close();
    window.addEventListener("keydown", onKey);
    host.parentElement?.addEventListener("click", onClick);

    void (async () => {
      try {
        const [{ DiceRoller }, role] = await Promise.all([
          import("open-dice-dnd"),
          getViewerRole()
        ]);
        if (cancelled) return;
        const names = event.throws.map((item) => diceLabel(item, role));
        const next = new DiceRoller({
          container: host,
          width: host.clientWidth || window.innerWidth,
          height: host.clientHeight || window.innerHeight
        });
        roller = next;
        await next.roll(diceRollConfig(event.throws));
        if (cancelled) return;
        const follow = () => {
          setLabels(diceLabelPositions(names, next.dice, next.camera, host));
          frame = requestAnimationFrame(follow);
        };
        follow();
      } catch {
        if (!cancelled) setFailed(true);
      }
    })();

    return () => {
      cancelled = true;
      window.removeEventListener("keydown", onKey);
      host.parentElement?.removeEventListener("click", onClick);
      cancelAnimationFrame(frame);
      roller?.destroy();
    };
  }, [event]);

  if (!event) {
    return <p className="dice-overlay-status">No dice roll to show.</p>;
  }

  return (
    <div className="dice-overlay-stage" role="presentation">
      <p className="dice-overlay-title">{event.title ?? "Dice"}</p>
      <div id="dice-host" className="dice-overlay-host" />
      {labels.map((label, index) => (
        <span
          key={`${label.name}-${index}`}
          data-dice-label={index}
          className="dice-name-label"
          style={{ left: label.x, top: label.y }}
        >
          {label.name}
        </span>
      ))}
      {failed ? <p className="dice-overlay-status">The dice could not be shown.</p> : null}
    </div>
  );
}
