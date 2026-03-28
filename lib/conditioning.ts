/**
 * Client-side conditioning image rendering for ControlNet.
 * Every widget produces a REAL conditioning image — not just text.
 */

import { SpatialRegion, PoseKeypoint } from "@/types/tokens";

const SIZE = 1024;

function blurCanvas(ctx: CanvasRenderingContext2D, r: number) {
  ctx.filter = `blur(${r}px)`;
  ctx.drawImage(ctx.canvas, 0, 0);
  ctx.filter = "none";
}

/** High-contrast test depth map for ControlNet diagnostic. Left third = white (near), rest = black (far). */
export function renderTestDepthMap(): string {
  const canvas = document.createElement("canvas");
  canvas.width = SIZE; canvas.height = SIZE;
  const ctx = canvas.getContext("2d")!;

  ctx.fillStyle = "rgb(0,0,0)";
  ctx.fillRect(0, 0, SIZE, SIZE);
  ctx.fillStyle = "rgb(255,255,255)";
  ctx.fillRect(0, 0, Math.round(SIZE / 3), SIZE);

  return canvas.toDataURL("image/png");
}

/** Depth map from spatial regions. Brighter = closer. Black bg, sharp rectangles, MiDaS-like. */
export function renderDepthMap(regions: SpatialRegion[]): string {
  const canvas = document.createElement("canvas");
  canvas.width = SIZE; canvas.height = SIZE;
  const ctx = canvas.getContext("2d")!;

  ctx.fillStyle = "rgb(0,0,0)";
  ctx.fillRect(0, 0, SIZE, SIZE);

  const sorted = [...regions].sort((a, b) => a.depth - b.depth);
  for (const r of sorted) {
    const b = Math.round(r.depth * 255);
    ctx.fillStyle = `rgb(${b},${b},${b})`;
    const cx = (r.x + r.width / 2) * SIZE;
    const cy = (r.y + r.height / 2) * SIZE;
    const rot = ((r.rotation ?? 0) * Math.PI) / 180;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(rot);
    ctx.fillRect(-r.width * SIZE / 2, -r.height * SIZE / 2, r.width * SIZE, r.height * SIZE);
    ctx.restore();
  }
  blurCanvas(ctx, 18);
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

