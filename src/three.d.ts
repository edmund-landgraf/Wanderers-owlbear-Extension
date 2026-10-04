declare module "three" {
  export class Vector3 {
    x: number;
    y: number;
    z: number;
    constructor(x?: number, y?: number, z?: number);
    addScaledVector(vector: Vector3, scale: number): this;
    clone(): Vector3;
    normalize(): this;
    project(camera: Camera): this;
    setFromMatrixColumn(matrix: unknown, index: number): this;
  }

  export interface Camera extends Object3D {
    matrixWorld: unknown;
  }

  export interface Object3D {
    getWorldPosition(target: Vector3): Vector3;
    getWorldScale(target: Vector3): Vector3;
    traverse(callback: (node: Object3D) => void): void;
  }
}
