import type { ViewerRole } from "../types";
import {
  diceEventsFromEncounterMeta,
  shouldPresentDiceEvent,
  type WgDiceAnimationEvent
} from "./diceEvent";

export type DiceRelay = {
  /** Mark logs already on the encounter so a reconnect does not replay them. */
  seed(meta: unknown, now?: number): void;
  /** New logs since the last seed or poll. */
  takeNew(meta: unknown, now?: number): WgDiceAnimationEvent[];
  /** Whether this client should open the overlay for a broadcast. */
  accept(event: WgDiceAnimationEvent, role: ViewerRole, now?: number): boolean;
};

export function createDiceRelay(now: () => number = Date.now): DiceRelay {
  const announced = new Set<string>();
  const presented = new Set<string>();
  let seeded = false;

  return {
    seed(meta) {
      for (const event of diceEventsFromEncounterMeta(meta, now())) {
        announced.add(event.eventId);
      }
      seeded = true;
    },
    takeNew(meta) {
      if (meta == null) return [];
      const events = diceEventsFromEncounterMeta(meta, now());
      if (!seeded) {
        for (const event of events) announced.add(event.eventId);
        seeded = true;
        return [];
      }
      const fresh = events.filter((event) => !announced.has(event.eventId));
      for (const event of fresh) announced.add(event.eventId);
      return fresh;
    },
    accept(event, role, at = now()) {
      if (!shouldPresentDiceEvent(event, role, at, presented)) return false;
      presented.add(event.eventId);
      return true;
    }
  };
}
