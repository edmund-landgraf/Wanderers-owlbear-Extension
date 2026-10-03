import { useEffect } from "react";
import { startDiceWatch } from "./dice/diceWatch";

export default function Background() {
  useEffect(() => startDiceWatch(), []);
  return null;
}
