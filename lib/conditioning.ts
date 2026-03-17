/**
 * Client-side conditioning image rendering for ControlNet.
 * Every widget produces a REAL conditioning image — not just text.
 */

import { SpatialRegion, PoseKeypoint, CameraSettings } from "@/types/tokens";

const SIZE = 1024;

function blurCanvas(ctx: CanvasRenderingContext2D, r: number) {
  ctx.filter = `blur(${r}px)`;
  ctx.drawImage(ctx.canvas, 0, 0);
  ctx.filter = "none";
}

/** Depth map from spatial regions. Brighter = closer. Positions match image layout. */
export function renderDepthMap(regions: SpatialRegion[]): string {
  const canvas = document.createElement("canvas");
  canvas.width = SIZE; canvas.height = SIZE;
  const ctx = canvas.getContext("2d")!;

  ctx.fillStyle = "rgb(60,60,60)";
  ctx.fillRect(0, 0, SIZE, SIZE);

  const sorted = [...regions].sort((a, b) => a.depth - b.depth);
  for (const r of sorted) {
    const b = Math.round(50 + r.depth * 200);
    const cx = (r.x + r.width / 2) * SIZE, cy = (r.y + r.height / 2) * SIZE;
    const rx = (r.width / 2) * SIZE * 1.2, ry = (r.height / 2) * SIZE * 1.2;
    const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, Math.max(rx, ry));
    grad.addColorStop(0, `rgb(${b},${b},${b})`);
    grad.addColorStop(0.7, `rgb(${b},${b},${b})`);
    grad.addColorStop(1, `rgba(${b},${b},${b},0)`);
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.ellipse(cx, cy, rx * 1.3, ry * 1.3, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  blurCanvas(ctx, 20);
  return canvas.toDataURL("image/png");
}

/** OpenPose skeleton for ControlNet Pose. */
export function renderPoseSkeleton(keypoints: PoseKeypoint[]): string {
  const canvas = document.createElement("canvas");
  canvas.width = SIZE; canvas.height = SIZE;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, SIZE, SIZE);

  const kpMap = new Map(keypoints.map(k => [k.name, k]));
  const limbs: [string, string, string][] = [
    ["head","neck","#FF0000"],["neck","left_shoulder","#FF5500"],["neck","right_shoulder","#00FF00"],
    ["left_shoulder","left_elbow","#FFAA00"],["left_elbow","left_wrist","#FFFF00"],
    ["right_shoulder","right_elbow","#00FF55"],["right_elbow","right_wrist","#00FFAA"],
    ["neck","hip","#0000FF"],["hip","left_knee","#FF00FF"],["left_knee","left_ankle","#FF00AA"],
    ["hip","right_knee","#00AAFF"],["right_knee","right_ankle","#0055FF"],
  ];
  ctx.lineWidth = 10; ctx.lineCap = "round";
  for (const [from, to, color] of limbs) {
    const a = kpMap.get(from), b = kpMap.get(to);
    if (!a || !b) continue;
    ctx.strokeStyle = color;
    ctx.beginPath(); ctx.moveTo(a.x*SIZE, a.y*SIZE); ctx.lineTo(b.x*SIZE, b.y*SIZE); ctx.stroke();
  }
  for (const kp of keypoints) {
    ctx.fillStyle = "#FFF";
    ctx.beginPath(); ctx.arc(kp.x*SIZE, kp.y*SIZE, kp.name==="head"?16:9, 0, Math.PI*2); ctx.fill();
  }
  return canvas.toDataURL("image/png");
}

/**
 * Camera angle → depth map.
 *
 * Bird's eye (high elevation): nearly all ground, uniform mid-bright, small subject dot center
 * Eye level: horizon in middle, gradient from dark sky to bright ground
 * Worm's eye (low elevation): mostly sky (dark), thin bright ground strip at bottom
 */
export function renderCameraDepthMap(cam: CameraSettings): string {
  const canvas = document.createElement("canvas");
  canvas.width = SIZE; canvas.height = SIZE;
  const ctx = canvas.getContext("2d")!;

  const elevNorm = (cam.elevation + 90) / 180; // 0=worm, 0.5=eye, 1=bird

  if (elevNorm > 0.75) {
    // Bird's eye: looking down, ground fills frame, subject small in center
    ctx.fillStyle = "rgb(160,160,160)";
    ctx.fillRect(0, 0, SIZE, SIZE);
    // Small bright subject spot in center (closer to camera)
    const grad = ctx.createRadialGradient(SIZE/2, SIZE/2, 0, SIZE/2, SIZE/2, SIZE*0.15);
    grad.addColorStop(0, "rgb(240,240,240)");
    grad.addColorStop(1, "rgb(160,160,160)");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, SIZE, SIZE);
  } else if (elevNorm < 0.25) {
    // Worm's eye: looking up, mostly sky, subject looms above
    const skyH = SIZE * 0.75;
    ctx.fillStyle = "rgb(30,30,30)";
    ctx.fillRect(0, 0, SIZE, skyH);
    // Subject silhouette in upper-center (nearer)
    const grad = ctx.createRadialGradient(SIZE/2, skyH*0.5, 0, SIZE/2, skyH*0.5, SIZE*0.25);
    grad.addColorStop(0, "rgb(200,200,200)");
    grad.addColorStop(1, "rgb(30,30,30)");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, SIZE, skyH);
    // Ground at bottom (very near = very bright)
    const gGrad = ctx.createLinearGradient(0, skyH, 0, SIZE);
    gGrad.addColorStop(0, "rgb(100,100,100)");
    gGrad.addColorStop(1, "rgb(240,240,240)");
    ctx.fillStyle = gGrad;
    ctx.fillRect(0, skyH, SIZE, SIZE - skyH);
  } else {
    // Eye level: horizon in middle, gradient
    const horizonY = (0.35 + (elevNorm - 0.25) * 0.6) * SIZE;
    const skyGrad = ctx.createLinearGradient(0, 0, 0, horizonY);
    skyGrad.addColorStop(0, "rgb(20,20,20)");
    skyGrad.addColorStop(1, "rgb(60,60,60)");
    ctx.fillStyle = skyGrad;
    ctx.fillRect(0, 0, SIZE, horizonY);

    const nearBright = Math.round(120 + (1 - elevNorm) * 120);
    const groundGrad = ctx.createLinearGradient(0, horizonY, 0, SIZE);
    groundGrad.addColorStop(0, "rgb(60,60,60)");
    groundGrad.addColorStop(1, `rgb(${nearBright},${nearBright},${nearBright})`);
    ctx.fillStyle = groundGrad;
    ctx.fillRect(0, horizonY, SIZE, SIZE - horizonY);
  }

  blurCanvas(ctx, 15);
  return canvas.toDataURL("image/png");
}

/**
 * Lighting → light map for ControlNet conditioning.
 * Bright spots where lights are, dark elsewhere.
 */
export function renderLightingMap(lights: { x: number; y: number; intensity: number; colorTemp: number }[]): string {
  const canvas = document.createElement("canvas");
  canvas.width = SIZE; canvas.height = SIZE;
  const ctx = canvas.getContext("2d")!;

  ctx.fillStyle = "rgb(30,30,30)";
  ctx.fillRect(0, 0, SIZE, SIZE);

  for (const l of lights) {
    const cx = ((l.x + 1) / 2) * SIZE, cy = ((l.y + 1) / 2) * SIZE;
    const radius = SIZE * 0.4 * l.intensity;
    const warm = l.colorTemp < 4000 ? 1 : l.colorTemp > 7000 ? 0 : (7000 - l.colorTemp) / 3000;
    const r = Math.round(200 + warm * 55), g = Math.round(180 + warm * 30), b = Math.round(160 - warm * 60);
    const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, radius);
    grad.addColorStop(0, `rgba(${r},${g},${b},${l.intensity})`);
    grad.addColorStop(0.5, `rgba(${r},${g},${b},${l.intensity * 0.3})`);
    grad.addColorStop(1, `rgba(${r},${g},${b},0)`);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, SIZE, SIZE);
  }
  blurCanvas(ctx, 25);
  return canvas.toDataURL("image/png");
}
