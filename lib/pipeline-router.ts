import { WidgetState, GenerationResult } from "@/types/tokens";
import { generateWithGemini } from "./gemini";
import { generateWithFlux, generateWithControls } from "./fal";

interface PipelineInput {
  prompt: string;
  widgetState: WidgetState;
}

function describePosition(x: number, width: number): string {
  const center = x + width / 2;
  if (center < 0.33) return "on the left third";
  if (center < 0.66) return "in the center";
  return "on the right third";
}

function describeDepth(depth: number): string {
  if (depth < 0.3) return "in the background";
  if (depth < 0.6) return "in the mid-ground";
  return "in the foreground";
}

/**
 * Build enriched prompt from widget state.
 *
 * CRITICAL: CLIP has a 77-token limit. Enrichment must be CONCISE.
 * Keep total prompt under ~60 words. Most important info first.
 * Color names only, no hex codes (tokenizers fragment them).
 */
export function buildEnrichedPrompt(prompt: string, ws: WidgetState): string {
  const prefix: string[] = [];
  const suffix: string[] = [];

  // Style — short prefix
  if (ws.styleSelection?.styleName) {
    prefix.push(`${ws.styleSelection.styleName} style,`);
  }

  // Camera — concise angle + lens
  if (ws.cameraSettings) {
    const cam = ws.cameraSettings;
    let angle = "";
    if (cam.elevation > 70) angle = "top-down bird's eye view,";
    else if (cam.elevation > 30) angle = "high angle shot,";
    else if (cam.elevation < -50) angle = "extreme low angle worm's eye view,";
    else if (cam.elevation < -20) angle = "low angle shot,";

    const lens = cam.focalLength < 24 ? " ultra wide angle," :
      cam.focalLength < 35 ? " wide angle," :
      cam.focalLength > 100 ? " telephoto," :
      cam.focalLength > 70 ? " shallow depth of field," : "";

    const facing = cam.azimuth > 45 && cam.azimuth <= 135 ? " from the right," :
      cam.azimuth > 135 && cam.azimuth <= 225 ? " from behind," :
      cam.azimuth > 225 && cam.azimuth <= 315 ? " from the left," : "";

    if (angle || lens || facing) {
      prefix.push(`${angle}${lens}${facing}`.replace(/,+$/, ","));
    }
  }

  // Spatial — brief position hints (depth map handles the precise layout)
  if (ws.spatialRegions?.length) {
    const descs = ws.spatialRegions.map(r =>
      `${r.label} ${describePosition(r.x, r.width)} ${describeDepth(r.depth)}`
    );
    suffix.push(descs.join(", "));
  }

  // Colors — descriptive names only (no hex)
  if (ws.colorSelections?.length) {
    const descs = ws.colorSelections.map(c => `${c.name} ${c.target}`);
    suffix.push(descs.join(", "));
  }

  const result = [...prefix, prompt, ...suffix].join(" ");

  // Safety: if still over ~75 words, truncate suffix
  const words = result.split(/\s+/);
  if (words.length > 70) {
    return words.slice(0, 70).join(" ");
  }

  return result;
}

function buildInfoSummary(enrichedPrompt: string, ws: WidgetState, condImages: any[]): string {
  const lines: string[] = [`Prompt:\n${enrichedPrompt}`];

  if (condImages.length > 0) {
    lines.push("\nConditioning:");
    condImages.forEach(ci => lines.push(`  [${ci.type.toUpperCase()}] ${ci.label}`));
  }

  if (ws.cameraSettings) {
    const c = ws.cameraSettings;
    lines.push(`\nCamera: elevation ${c.elevation}°, rotation ${c.azimuth}°, ${c.focalLength}mm`);
  }
  if (ws.spatialRegions?.length) {
    lines.push(`Spatial: ${ws.spatialRegions.map(r => `"${r.label}" at x=${Math.round(r.x*100)}% y=${Math.round(r.y*100)}% w=${Math.round(r.width*100)}% h=${Math.round(r.height*100)}% depth=${Math.round(r.depth*100)}%`).join(", ")}`);
  }
  if (ws.colorSelections?.length) {
    lines.push(`Colors: ${ws.colorSelections.map(c => `${c.target}=${c.name}`).join(", ")}`);
  }
  if (ws.styleSelection?.styleName) {
    lines.push(`Style: ${ws.styleSelection.styleName} (strength ${Math.round(ws.styleSelection.strength * 100)}%)`);
  }

  return lines.join("\n");
}

function hasConditioningImages(ws: WidgetState): boolean {
  return !!(ws.depthMapDataUrl || ws.segMapDataUrl);
}

export async function routeGeneration(input: PipelineInput): Promise<GenerationResult> {
  const { widgetState: ws } = input;
  const enrichedPrompt = buildEnrichedPrompt(input.prompt, ws);

  console.log(`[router] Enriched: "${enrichedPrompt.slice(0, 300)}"`);

  // ControlNet path — spatial depth map present
  if (hasConditioningImages(ws)) {
    console.log("[router] ControlNet pipeline (depth map)");
    const r = await generateWithControls({ prompt: enrichedPrompt, widgetState: ws });
    return { ...r, provider: "fal", pipeline: "Flux + ControlNet Depth", timestamp: Date.now(),
      enrichedPrompt: buildInfoSummary(enrichedPrompt, ws, r.conditioningImages) };
  }

  // Text-only (with enrichment from color/camera/style widgets)
  console.log("[router] Text-only pipeline (with prompt enrichment)");
  try {
    const imageUrl = await generateWithGemini(enrichedPrompt);
    return { imageUrl, provider: "gemini", pipeline: "Gemini Flash", timestamp: Date.now(),
      enrichedPrompt: buildInfoSummary(enrichedPrompt, ws, []), conditioningImages: [] };
  } catch {
    const r = await generateWithFlux(enrichedPrompt);
    return { ...r, provider: "fal", pipeline: "Flux General", timestamp: Date.now(),
      enrichedPrompt: buildInfoSummary(enrichedPrompt, ws, []) };
  }
}
