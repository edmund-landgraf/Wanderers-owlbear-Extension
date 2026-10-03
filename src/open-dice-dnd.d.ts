declare module "open-dice-dnd" {
  import type { Camera, Object3D } from "three";

  export class DiceRoller {
    camera: Camera;
    dice: Array<{ mesh?: Object3D }>;
    constructor(options: {
      container: HTMLElement;
      width: number;
      height: number;
    });
    roll(dice: Array<{
      dice: string;
      rolled: number;
      diceColor?: number;
      textColor?: string;
      backgroundColor?: string;
    }>): Promise<unknown>;
    destroy(): void;
  }
}
