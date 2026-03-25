/**
 * Server-side conditioning image rendering (no DOM).
 * Mirror of conditioning.ts for Node.js API routes (test suite).
 *
 * IMPORTANT: Blur radii and depth math must match conditioning.ts exactly.
 * Depth convention: 0 = far (black), 255 = near (white).
 */

import { SpatialRegion, CameraSettings } from "@/types/tokens";

const SIZE = 1024;

const SEG_COLORS = [
  [255, 0, 0], [0, 255, 0], [0, 0, 255], [255, 255, 0],
  [255, 0, 255], [0, 255, 255], [255, 128, 0], [128, 0, 255],
  [255, 0, 128], [0, 255, 128], [0, 128, 255], [128, 255, 0],
];

/** Color-coded segmentation map. */
export function renderSegmentationMap(regions: SpatialRegion[]): string {
  const pixels = new Uint8Array(SIZE * SIZE * 3);
  for (let i = 0; i < regions.length; i++) {
    const r = regions[i];
    const [cr, cg, cb] = SEG_COLORS[i % SEG_COLORS.length];
    const x0 = Math.round(r.x * SIZE);
    const y0 = Math.round(r.y * SIZE);
    const w = Math.round(r.width * SIZE);
    const h = Math.round(r.height * SIZE);
    for (let y = Math.max(0, y0); y < Math.min(SIZE, y0 + h); y++) {
      for (let x = Math.max(0, x0); x < Math.min(SIZE, x0 + w); x++) {
        const idx = (y * SIZE + x) * 3;
        pixels[idx] = cr; pixels[idx + 1] = cg; pixels[idx + 2] = cb;
      }
    }
  }
  return `data:image/png;base64,${Buffer.from(encodeRGBPNG(pixels, SIZE, SIZE)).toString("base64")}`;
}

/** Perspective camera depth map. Blur radius matches client (10). */
export function renderCameraDepthMap(settings: CameraSettings): string {
  const pixels = new Uint8Array(SIZE * SIZE);
  computePerspectiveDepth(settings, pixels);
  const blurred = boxBlur(pixels, SIZE, SIZE, 5); // ~10px equivalent for box blur
  return `data:image/png;base64,${Buffer.from(encodeGrayPNG(blurred, SIZE, SIZE)).toString("base64")}`;
}

/** Spatial regions depth map. Blur radius matches client (14). */
export function renderSpatialDepthMap(regions: SpatialRegion[]): string {
  const pixels = new Uint8Array(SIZE * SIZE);
  paintSpatialRegions(regions, pixels);
  const blurred = boxBlur(pixels, SIZE, SIZE, 7); // ~14px equivalent
  return `data:image/png;base64,${Buffer.from(encodeGrayPNG(blurred, SIZE, SIZE)).toString("base64")}`;
}

/** Combined: camera base + spatial overlay. Blur matches client (12). */
export function renderCombinedDepthMap(settings: CameraSettings, regions: SpatialRegion[]): string {
  const pixels = new Uint8Array(SIZE * SIZE);
  computePerspectiveDepth(settings, pixels);
  paintSpatialRegions(regions, pixels);
  const blurred = boxBlur(pixels, SIZE, SIZE, 6); // ~12px equivalent
  return `data:image/png;base64,${Buffer.from(encodeGrayPNG(blurred, SIZE, SIZE)).toString("base64")}`;
}

// ─── Core computation (matches conditioning.ts) ───

function computePerspectiveDepth(settings: CameraSettings, pixels: Uint8Array) {
  const elevRad = (settings.elevation * Math.PI) / 180;
  const azimuthRad = (settings.azimuth * Math.PI) / 180;
  const sensorHalf = 18;
  const vFovHalf = Math.atan(sensorHalf / settings.focalLength);
  const camHeight = 1.5;
  const maxDist = 20;
  const sinAz = Math.sin(azimuthRad);

  for (let py = 0; py < SIZE; py++) {
    const screenY = (py / SIZE - 0.5) * 2;
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

      pixels[py * SIZE + px] = Math.round(depth * 255);
    }
  }
}

function paintSpatialRegions(regions: SpatialRegion[], pixels: Uint8Array) {
  const sorted = [...regions].sort((a, b) => a.depth - b.depth);
  for (const r of sorted) {
    const brightness = Math.round(r.depth * 255);
    const x0 = Math.round(r.x * SIZE);
    const y0 = Math.round(r.y * SIZE);
    const w = Math.round(r.width * SIZE);
    const h = Math.round(r.height * SIZE);
    for (let y = Math.max(0, y0); y < Math.min(SIZE, y0 + h); y++) {
      for (let x = Math.max(0, x0); x < Math.min(SIZE, x0 + w); x++) {
        pixels[y * SIZE + x] = brightness;
      }
    }
  }
}

// ─── PNG encoding ───

function boxBlur(data: Uint8Array, w: number, h: number, radius: number): Uint8Array {
  const result = new Uint8Array(w * h);
  const temp = new Uint8Array(w * h);
  const span = radius * 2 + 1;
  for (let y = 0; y < h; y++) {
    let sum = 0;
    for (let x = -radius; x <= radius; x++) sum += data[y * w + Math.max(0, Math.min(w - 1, x))];
    for (let x = 0; x < w; x++) {
      temp[y * w + x] = Math.round(sum / span);
      sum -= data[y * w + Math.max(0, x - radius)];
      sum += data[y * w + Math.min(w - 1, x + radius + 1)];
    }
  }
  for (let x = 0; x < w; x++) {
    let sum = 0;
    for (let y = -radius; y <= radius; y++) sum += temp[Math.max(0, Math.min(h - 1, y)) * w + x];
    for (let y = 0; y < h; y++) {
      result[y * w + x] = Math.round(sum / span);
      sum -= temp[Math.max(0, y - radius) * w + x];
      sum += temp[Math.min(h - 1, y + radius + 1) * w + x];
    }
  }
  return result;
}

function encodeGrayPNG(data: Uint8Array, width: number, height: number): Uint8Array {
  const filtered = new Uint8Array(height * (width + 1));
  for (let y = 0; y < height; y++) {
    filtered[y * (width + 1)] = 0;
    filtered.set(data.subarray(y * width, (y + 1) * width), y * (width + 1) + 1);
  }
  return buildPNG(width, height, 8, 0, filtered);
}

function encodeRGBPNG(data: Uint8Array, width: number, height: number): Uint8Array {
  const filtered = new Uint8Array(height * (width * 3 + 1));
  for (let y = 0; y < height; y++) {
    filtered[y * (width * 3 + 1)] = 0;
    filtered.set(data.subarray(y * width * 3, (y + 1) * width * 3), y * (width * 3 + 1) + 1);
  }
  return buildPNG(width, height, 8, 2, filtered);
}

function buildPNG(width: number, height: number, bitDepth: number, colorType: number, filteredData: Uint8Array): Uint8Array {
  const deflated = deflateRaw(filteredData);
  const chunks: Uint8Array[] = [];
  chunks.push(new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]));
  const ihdr = new Uint8Array(13);
  const v = new DataView(ihdr.buffer);
  v.setUint32(0, width); v.setUint32(4, height);
  ihdr[8] = bitDepth; ihdr[9] = colorType; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  chunks.push(makeChunk("IHDR", ihdr));
  chunks.push(makeChunk("IDAT", deflated));
  chunks.push(makeChunk("IEND", new Uint8Array(0)));
  let total = 0; for (const c of chunks) total += c.length;
  const result = new Uint8Array(total);
  let off = 0; for (const c of chunks) { result.set(c, off); off += c.length; }
  return result;
}

function makeChunk(type: string, data: Uint8Array): Uint8Array {
  const chunk = new Uint8Array(12 + data.length);
  const dv = new DataView(chunk.buffer);
  dv.setUint32(0, data.length);
  for (let i = 0; i < 4; i++) chunk[4 + i] = type.charCodeAt(i);
  chunk.set(data, 8);
  dv.setUint32(8 + data.length, crc32(chunk.subarray(4, 8 + data.length)));
  return chunk;
}

function deflateRaw(data: Uint8Array): Uint8Array {
  const blocks: Uint8Array[] = [];
  blocks.push(new Uint8Array([0x78, 0x01]));
  const MAX = 65535;
  for (let i = 0; i < data.length; i += MAX) {
    const end = Math.min(i + MAX, data.length);
    const len = end - i;
    const b = new Uint8Array(5 + len);
    b[0] = end >= data.length ? 1 : 0;
    b[1] = len & 0xFF; b[2] = (len >> 8) & 0xFF;
    b[3] = (~len) & 0xFF; b[4] = ((~len) >> 8) & 0xFF;
    b.set(data.subarray(i, end), 5);
    blocks.push(b);
  }
  let a = 1, c = 0;
  for (let i = 0; i < data.length; i++) { a = (a + data[i]) % 65521; c = (c + a) % 65521; }
  const adler = new Uint8Array(4);
  new DataView(adler.buffer).setUint32(0, (c << 16) | a);
  blocks.push(adler);
  let total = 0; for (const b of blocks) total += b.length;
  const result = new Uint8Array(total);
  let off = 0; for (const b of blocks) { result.set(b, off); off += b.length; }
  return result;
}

const crcTable = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    t[n] = c;
  }
  return t;
})();

function crc32(data: Uint8Array): number {
  let c = 0xFFFFFFFF;
  for (let i = 0; i < data.length; i++) c = crcTable[(c ^ data[i]) & 0xFF] ^ (c >>> 8);
  return (c ^ 0xFFFFFFFF) >>> 0;
}
