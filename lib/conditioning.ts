/**
 * Client-side conditioning image rendering for ControlNet.
 * Every widget produces a REAL conditioning image — not just text.
 */

import { SpatialRegion, PoseKeypoint, DetectedToken } from "@/types/tokens";

const SIZE = 1024;

function blurCanvas(ctx: CanvasRenderingContext2D, r: number) {
  ctx.filter = `blur(${r}px)`;
  ctx.drawImage(ctx.canvas, 0, 0);
  ctx.filter = "none";
}

const HUMAN_TERMS = new Set([
  "person", "man", "woman", "figure", "character", "human",
  "child", "boy", "girl", "kid", "baby",
  "dancer", "athlete", "player", "worker", "soldier",
  "businessman", "businesswoman", "model", "singer",
  "gentleman", "lady", "guy",
]);

/**
 * Find the spatial region that best matches the pose subject.
 * 3-tier fallback: pose token text match → human term match → largest region.
 */
export function findPoseRegion(
  regions: SpatialRegion[],
  detectedTokens: DetectedToken[]
): SpatialRegion | null {
  if (regions.length === 0) return null;

  // Tier 1: Find pose token text, check if any region label is a substring of it
  const poseToken = detectedTokens.find(t => t.category === "pose");
  if (poseToken) {
    const poseText = poseToken.text.toLowerCase();
    const match = regions.find(r => poseText.includes(r.label.toLowerCase()));
    if (match) return match;
  }

  // Tier 2: Check region labels against human terms
  const humanRegion = regions.find(r => {
    const words = r.label.toLowerCase().split(/\s+/);
    return words.some(w => HUMAN_TERMS.has(w));
  });
  if (humanRegion) return humanRegion;

  // Tier 3: Largest region by area
  return regions.reduce((largest, r) =>
    r.width * r.height > largest.width * largest.height ? r : largest
  );
}

/**
 * Transform keypoints from full normalized [0,1] space into a spatial region's bounding box.
 * Preserves aspect ratio and centers the skeleton within the region (with 10% inset padding).
 */
export function transformKeypointsToRegion(
  keypoints: PoseKeypoint[],
  region: SpatialRegion
): { keypoints: PoseKeypoint[]; scaleFactor: number } {
  // Compute pose bounding box
  const xs = keypoints.map(k => k.x);
  const ys = keypoints.map(k => k.y);
  const minX = Math.min(...xs), maxX = Math.max(...xs);
  const minY = Math.min(...ys), maxY = Math.max(...ys);
  const skelW = maxX - minX;
  const skelH = maxY - minY;
  const skelCenterX = (minX + maxX) / 2;
  const skelCenterY = (minY + maxY) / 2;

  // Inset target region by 10% padding
  const pad = 0.1;
  const targetW = region.width * (1 - 2 * pad);
  const targetH = region.height * (1 - 2 * pad);
  const regionCenterX = region.x + region.width / 2;
  const regionCenterY = region.y + region.height / 2;

  // Uniform scale preserving aspect ratio
  let scale: number;
  if (skelW < 1e-6 && skelH < 1e-6) {
    // Degenerate: all points coincident — just center them
    scale = 1;
  } else if (skelW < 1e-6) {
    scale = targetH / skelH;
  } else if (skelH < 1e-6) {
    scale = targetW / skelW;
  } else {
    scale = Math.min(targetW / skelW, targetH / skelH);
  }

  const transformed = keypoints.map(kp => ({
    ...kp,
    x: regionCenterX + (kp.x - skelCenterX) * scale,
    y: regionCenterY + (kp.y - skelCenterY) * scale,
  }));

  return { keypoints: transformed, scaleFactor: scale };
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

const DIAGRAM_PALETTE = [
  { fill: "rgba(220, 38, 38, 0.20)", border: "#DC2626", text: "#991B1B" },   // red
  { fill: "rgba(37, 99, 235, 0.20)", border: "#2563EB", text: "#1E3A8A" },   // blue
  { fill: "rgba(22, 163, 74, 0.20)", border: "#16A34A", text: "#14532D" },    // green
  { fill: "rgba(234, 88, 12, 0.20)", border: "#EA580C", text: "#7C2D12" },    // orange
  { fill: "rgba(147, 51, 234, 0.20)", border: "#9333EA", text: "#581C87" },   // purple
  { fill: "rgba(13, 148, 136, 0.20)", border: "#0D9488", text: "#134E4A" },   // teal
  { fill: "rgba(219, 39, 119, 0.20)", border: "#DB2777", text: "#831843" },   // pink
  { fill: "rgba(202, 138, 4, 0.20)", border: "#CA8A04", text: "#713F12" },    // amber
];

/** Labeled layout diagram for Gemini depth map generation. Colored rectangles with labels on white bg. */
export function renderLayoutDiagram(regions: SpatialRegion[]): string {
  const canvas = document.createElement("canvas");
  canvas.width = SIZE; canvas.height = SIZE;
  const ctx = canvas.getContext("2d")!;

  // White background — visually distinct from depth maps
  ctx.fillStyle = "#FFFFFF";
  ctx.fillRect(0, 0, SIZE, SIZE);

  const sorted = [...regions].sort((a, b) => a.depth - b.depth);
  for (let i = 0; i < sorted.length; i++) {
    const r = sorted[i];
    const palette = DIAGRAM_PALETTE[i % DIAGRAM_PALETTE.length];
    const cx = (r.x + r.width / 2) * SIZE;
    const cy = (r.y + r.height / 2) * SIZE;
    const w = r.width * SIZE;
    const h = r.height * SIZE;
    const rot = ((r.rotation ?? 0) * Math.PI) / 180;

    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(rot);

    // Filled rectangle
    ctx.fillStyle = palette.fill;
    ctx.fillRect(-w / 2, -h / 2, w, h);

    // Border
    ctx.strokeStyle = palette.border;
    ctx.lineWidth = 3;
    ctx.strokeRect(-w / 2, -h / 2, w, h);

    // Label text
    const fontSize = Math.max(14, Math.min(48, Math.floor(h * 0.15)));
    ctx.font = `bold ${fontSize}px sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = palette.text;
    const label = w < 60 ? r.label.slice(0, 3) + ".." : r.label;
    ctx.fillText(label, 0, -fontSize * 0.4, w - 8);

    // Depth annotation
    const depthCategory = r.depth < 0.3 ? "far" : r.depth < 0.6 ? "mid" : "near";
    const depthText = `depth: ${r.depth.toFixed(1)} (${depthCategory})`;
    const smallFont = Math.max(11, Math.floor(fontSize * 0.65));
    ctx.font = `${smallFont}px sans-serif`;
    ctx.fillStyle = "#666666";
    ctx.fillText(depthText, 0, fontSize * 0.5, w - 8);

    ctx.restore();
  }
  return canvas.toDataURL("image/png");
}

/** OpenPose skeleton for ControlNet Pose. Optionally transforms to match a spatial region. */
export function renderPoseSkeleton(
  keypoints: PoseKeypoint[],
  options?: {
    spatialRegions?: SpatialRegion[];
    detectedTokens?: DetectedToken[];
  }
): string {
  const canvas = document.createElement("canvas");
  canvas.width = SIZE; canvas.height = SIZE;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, SIZE, SIZE);

  let renderKeypoints = keypoints;
  let lineWidth = 10;
  let headRadius = 16;
  let jointRadius = 9;

  // Transform keypoints to spatial region if available
  if (options?.spatialRegions?.length) {
    const region = findPoseRegion(options.spatialRegions, options.detectedTokens ?? []);
    if (region) {
      const result = transformKeypointsToRegion(keypoints, region);
      renderKeypoints = result.keypoints;
      lineWidth = Math.max(2, Math.round(10 * result.scaleFactor));
      headRadius = Math.max(4, Math.round(16 * result.scaleFactor));
      jointRadius = Math.max(3, Math.round(9 * result.scaleFactor));
    }
  }

  const kpMap = new Map(renderKeypoints.map(k => [k.name, k]));
  const limbs: [string, string, string][] = [
    ["head","neck","#FF0000"],["neck","left_shoulder","#FF5500"],["neck","right_shoulder","#00FF00"],
    ["left_shoulder","left_elbow","#FFAA00"],["left_elbow","left_wrist","#FFFF00"],
    ["right_shoulder","right_elbow","#00FF55"],["right_elbow","right_wrist","#00FFAA"],
    ["neck","hip","#0000FF"],["hip","left_knee","#FF00FF"],["left_knee","left_ankle","#FF00AA"],
    ["hip","right_knee","#00AAFF"],["right_knee","right_ankle","#0055FF"],
  ];
  ctx.lineWidth = lineWidth; ctx.lineCap = "round";
  for (const [from, to, color] of limbs) {
    const a = kpMap.get(from), b = kpMap.get(to);
    if (!a || !b) continue;
    ctx.strokeStyle = color;
    ctx.beginPath(); ctx.moveTo(a.x*SIZE, a.y*SIZE); ctx.lineTo(b.x*SIZE, b.y*SIZE); ctx.stroke();
  }
  for (const kp of renderKeypoints) {
    ctx.fillStyle = "#FFF";
    ctx.beginPath(); ctx.arc(kp.x*SIZE, kp.y*SIZE, kp.name==="head"?headRadius:jointRadius, 0, Math.PI*2); ctx.fill();
  }
  return canvas.toDataURL("image/png");
}

