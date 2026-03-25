/**
 * Client-side conditioning image rendering for ControlNet + EasyControls.
 *
 * Two conditioning signals for spatial control:
 * 1. SEGMENTATION MAP (easycontrols "seg" + "spatial") — object POSITION and SIZE
 * 2. DEPTH MAP (controlnet_unions "depth") — DEPTH layering
 *
 * Camera Angle produces a perspective-projected depth map using proper camera
 * optics with hyperbolic falloff (matching Depth Anything V2 output).
 *
 * Depth convention: 0 = far (black), 255 = near (white). This matches MiDaS
 * and Depth Anything V2 (inverse depth), which ControlNet was trained on.
 */

import { SpatialRegion, CameraSettings } from "@/types/tokens";

const SIZE = 1024;

// Distinct colors for segmentation regions
const SEG_COLORS = [
  "#FF0000", "#00FF00", "#0000FF", "#FFFF00",
  "#FF00FF", "#00FFFF", "#FF8000", "#8000FF",
  "#FF0080", "#00FF80", "#0080FF", "#80FF00",
];

function blurCanvas(ctx: CanvasRenderingContext2D, r: number) {
  ctx.filter = `blur(${r}px)`;
  ctx.drawImage(ctx.canvas, 0, 0);
  ctx.filter = "none";
}

/** High-contrast test depth map for diagnostics. */
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

/**
 * Color-coded segmentation map for spatial regions.
 * Each region = unique solid color. Background = black.
 * Controls WHERE and HOW BIG each object should be.
 */
export function renderSegmentationMap(regions: SpatialRegion[]): string {
  const canvas = document.createElement("canvas");
  canvas.width = SIZE; canvas.height = SIZE;
  const ctx = canvas.getContext("2d")!;

  ctx.fillStyle = "#000000";
  ctx.fillRect(0, 0, SIZE, SIZE);

  for (let i = 0; i < regions.length; i++) {
    const r = regions[i];
    ctx.fillStyle = SEG_COLORS[i % SEG_COLORS.length];
    ctx.fillRect(
      Math.round(r.x * SIZE),
      Math.round(r.y * SIZE),
      Math.round(r.width * SIZE),
      Math.round(r.height * SIZE),
    );
  }

  return canvas.toDataURL("image/png");
}

/**
 * Perspective depth map from camera settings.
 * Simulates rays from camera through a virtual sensor intersecting a ground plane.
 * Produces hyperbolic depth falloff matching Depth Anything V2 output.
 */
export function renderCameraDepthMap(settings: CameraSettings): string {
  const canvas = document.createElement("canvas");
  canvas.width = SIZE; canvas.height = SIZE;
  const ctx = canvas.getContext("2d")!;
  const imageData = ctx.createImageData(SIZE, SIZE);

  computePerspectiveDepth(settings, imageData.data);

  ctx.putImageData(imageData, 0, 0);
  blurCanvas(ctx, 10);
  return canvas.toDataURL("image/png");
}

/** Depth map from spatial regions only (no camera). */
export function renderSpatialDepthMap(regions: SpatialRegion[]): string {
  const canvas = document.createElement("canvas");
  canvas.width = SIZE; canvas.height = SIZE;
  const ctx = canvas.getContext("2d")!;

  ctx.fillStyle = "rgb(0,0,0)";
  ctx.fillRect(0, 0, SIZE, SIZE);

  const sorted = [...regions].sort((a, b) => a.depth - b.depth);
  for (const r of sorted) {
    const b = Math.round(r.depth * 255);
    ctx.fillStyle = `rgb(${b},${b},${b})`;
    ctx.fillRect(r.x * SIZE, r.y * SIZE, r.width * SIZE, r.height * SIZE);
  }
  blurCanvas(ctx, 14);
  return canvas.toDataURL("image/png");
}

/** Combined: camera perspective base + spatial regions overlaid. */
export function renderCombinedDepthMap(
  settings: CameraSettings,
  regions: SpatialRegion[],
): string {
  const canvas = document.createElement("canvas");
  canvas.width = SIZE; canvas.height = SIZE;
  const ctx = canvas.getContext("2d")!;
  const imageData = ctx.createImageData(SIZE, SIZE);

  computePerspectiveDepth(settings, imageData.data);

  // Spatial regions override camera depth in their area
  const sorted = [...regions].sort((a, b) => a.depth - b.depth);
  for (const r of sorted) {
    const brightness = Math.round(r.depth * 255);
    const x0 = Math.round(r.x * SIZE);
    const y0 = Math.round(r.y * SIZE);
    const w = Math.round(r.width * SIZE);
    const h = Math.round(r.height * SIZE);

    for (let y = Math.max(0, y0); y < Math.min(SIZE, y0 + h); y++) {
      for (let x = Math.max(0, x0); x < Math.min(SIZE, x0 + w); x++) {
        const idx = (y * SIZE + x) * 4;
        imageData.data[idx] = brightness;
        imageData.data[idx + 1] = brightness;
        imageData.data[idx + 2] = brightness;
      }
    }
  }

  ctx.putImageData(imageData, 0, 0);
  blurCanvas(ctx, 12);
  return canvas.toDataURL("image/png");
}

/**
 * Core perspective depth computation.
 *
 * For each pixel, cast a ray from the camera through that pixel's position
 * on a virtual sensor, and intersect with a ground plane (y=0).
 *
 * - Elevation: camera pitch in degrees (positive = looking down)
 * - Azimuth: camera yaw in degrees (0=front, 90=right, 180=back)
 * - Focal length: controls vertical FOV (14mm=wide, 200mm=telephoto)
 *
 * Convention: 0 = far (black), 255 = near (white).
 */
/** Client-side: always writes to RGBA ImageData. */
function computePerspectiveDepth(
  settings: CameraSettings,
  pixels: Uint8ClampedArray,
) {
  const elevRad = (settings.elevation * Math.PI) / 180;
  const azimuthRad = (settings.azimuth * Math.PI) / 180;

  // Vertical FOV from focal length (35mm full-frame equivalent)
  const sensorHalf = 18; // half of 36mm sensor
  const vFovHalf = Math.atan(sensorHalf / settings.focalLength);

  const camHeight = 1.5;
  const maxDist = 20;

  // Azimuth: side views create lateral depth variation
  const sinAz = Math.sin(azimuthRad);

  for (let py = 0; py < SIZE; py++) {
    const screenY = (py / SIZE - 0.5) * 2;

    // Ray elevation angle (positive elev in UI = looking down = negative ray angle)
    const pixelElevAngle = -elevRad - screenY * vFovHalf;

    for (let px = 0; px < SIZE; px++) {
      const screenX = (px / SIZE - 0.5) * 2;
      const lateralDepthBias = screenX * sinAz * 0.12;

      let depth = 0;

      if (pixelElevAngle < -0.005) {
        const dist = camHeight / Math.sin(-pixelElevAngle);
        depth = Math.max(0, 1 - (dist / maxDist));
        depth = Math.max(0, Math.min(1, depth + lateralDepthBias));
      }

      const brightness = Math.round(depth * 255);
      const idx = (py * SIZE + px) * 4;
      pixels[idx] = brightness;
      pixels[idx + 1] = brightness;
      pixels[idx + 2] = brightness;
      pixels[idx + 3] = 255;
    }
  }
}
