import { Vector3, type Camera, type Object3D } from "three";

export function placeDiceLabel(
  anchor: { x: number; y: number },
  viewport: { width: number; height: number },
  label: { width: number; height: number },
  padding = 8
) {
  const minX = padding;
  const maxX = Math.max(minX, viewport.width - padding - label.width);
  const halfH = label.height / 2;
  const minY = padding + halfH;
  const maxY = Math.max(minY, viewport.height - padding - halfH);
  return {
    x: Math.min(Math.max(anchor.x, minX), maxX),
    y: Math.min(Math.max(anchor.y, minY), maxY)
  };
}

export function placeDiceLabelBeside(
  center: { x: number; y: number },
  radius: number,
  viewport: { width: number; height: number },
  label: { width: number; height: number },
  padding = 8
) {
  const gap = 6;
  const reach = Math.max(0, radius) + gap;
  const rightX = center.x + reach;
  const leftX = center.x - reach - label.width;
  const rightFits = rightX + label.width <= viewport.width - padding;
  const leftFits = leftX >= padding;
  if (rightFits) return placeDiceLabel({ x: rightX, y: center.y }, viewport, label, padding);
  if (leftFits) return placeDiceLabel({ x: leftX, y: center.y }, viewport, label, padding);
  const belowY = center.y + reach + label.height / 2;
  const aboveY = center.y - reach - label.height / 2;
  const y = belowY + label.height / 2 <= viewport.height - padding ? belowY : aboveY;
  return placeDiceLabel({ x: center.x - label.width / 2, y }, viewport, label, padding);
}

function project(mesh: { getWorldPosition: (target: Vector3) => Vector3 }, camera: Camera, host: HTMLElement) {
  const vector = new Vector3();
  mesh.getWorldPosition(vector);
  vector.project(camera);
  return {
    x: (vector.x * 0.5 + 0.5) * host.clientWidth,
    y: (-vector.y * 0.5 + 0.5) * host.clientHeight
  };
}

function dieScreenRadius(mesh: Object3D, camera: Camera, host: HTMLElement) {
  let best = 0;
  mesh.traverse((node) => {
    const geometry = "geometry" in node
      ? (node as Object3D & { geometry?: { boundingSphere: { radius: number } | null; computeBoundingSphere: () => void } }).geometry
      : undefined;
    if (!geometry) return;
    if (!geometry.boundingSphere) geometry.computeBoundingSphere();
    const sphere = geometry.boundingSphere;
    if (!sphere) return;
    const scale = new Vector3();
    node.getWorldScale(scale);
    best = Math.max(best, sphere.radius * Math.max(scale.x, scale.y, scale.z));
  });
  if (best <= 0) return 72;
  const center = new Vector3();
  mesh.getWorldPosition(center);
  const right = new Vector3().setFromMatrixColumn(camera.matrixWorld, 0).normalize();
  const edge = center.clone().addScaledVector(right, best);
  const a = project(mesh, camera, host);
  edge.project(camera);
  const b = {
    x: (edge.x * 0.5 + 0.5) * host.clientWidth,
    y: (-edge.y * 0.5 + 0.5) * host.clientHeight
  };
  const radius = Math.hypot(b.x - a.x, b.y - a.y);
  return Number.isFinite(radius) && radius > 8 ? radius : 72;
}

export function diceLabelPositions(
  names: string[],
  dice: Array<{ mesh?: Object3D }>,
  camera: Camera,
  host: HTMLElement
) {
  const viewport = { width: host.clientWidth, height: host.clientHeight };
  return names.map((name, index) => {
    const mesh = dice[index]?.mesh;
    const point = mesh ? project(mesh, camera, host) : { x: viewport.width / 2, y: viewport.height / 2 };
    const radius = mesh ? dieScreenRadius(mesh, camera, host) : 72;
    const node = host.parentElement?.querySelector(`[data-dice-label="${index}"]`);
    const measured = node?.getBoundingClientRect();
    const placed = placeDiceLabelBeside(
      point,
      radius,
      viewport,
      { width: measured?.width ?? Math.min(280, name.length * 7.2 + 16), height: measured?.height ?? 22 }
    );
    return { name, x: placed.x, y: placed.y };
  });
}
