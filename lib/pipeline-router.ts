import { WidgetState, GenerationResult, ModalConditioningRequest, ModalGenerateRequest } from "@/types/tokens";
import { generateWithGemini } from "./gemini";
import { generateWithFlux, generateWithControls } from "./fal";
import { isModalHealthy, generateWithModal } from "./modal";
export { buildRegionPromptText } from "./prompt-utils";

interface PipelineInput {
  prompt: string;
  widgetState: WidgetState;
  // New: pre-built conditioning for Modal backend
  conditioning?: ModalConditioningRequest;
  enable_controlnet?: boolean;
  enable_regional?: boolean;
  enable_ip_adapter?: boolean;
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
 * Strip spatial, camera, style, and color phrases from user prompt
 * so they don't contradict widget-derived descriptions.
 */
function cleanPromptOfWidgetPhrases(prompt: string, ws: WidgetState): string {
  let cleaned = prompt;

  // Remove spatial position phrases (the depth map + regional prompting handles this)
  if (ws.spatialRegions?.length) {
    cleaned = cleaned.replace(/\b(on the left|on the right|in the center|in the middle|in the foreground|in the background|in the front|in the back|next to|behind|in front of|on the left side|on the right side|far left|far right|centered|at the top|at the bottom)\b/gi, "");
  }

  // Remove camera angle phrases (the depth map + text prefix handles this)
  if (ws.cameraSettings) {
    cleaned = cleaned.replace(/\b(bird'?s[- ]eye|worm'?s[- ]eye|low angle|high angle|top[- ]down|eye level|close[- ]up|telephoto|wide angle|ultra wide|from above|from below|looking up|looking down|aerial view|overhead|shot from)\b/gi, "");
  }

  // Remove style phrases (the style prefix / IP-Adapter handles this)
  if (ws.styleSelection?.styleName) {
    const styleName = ws.styleSelection.styleName.toLowerCase();
    cleaned = cleaned.replace(new RegExp(`\\b${styleName}\\s*(style)?\\b`, "gi"), "");
  }

  // Remove color phrases that match widget selections (regional prompts handle these)
  if (ws.colorSelections?.length) {
    for (const c of ws.colorSelections) {
      cleaned = cleaned.replace(new RegExp(`\\b${c.name}\\b`, "gi"), "");
    }
  }

  // Clean up leftover punctuation artifacts
  cleaned = cleaned.replace(/,\s*,/g, ",").replace(/\s{2,}/g, " ").replace(/^[\s,]+|[\s,]+$/g, "");
  return cleaned;
}

/**
 * Build enriched prompt from widget state.
 *
 * Strips contradictory phrases from the user prompt, then adds
 * widget-derived descriptions as authoritative replacements.
 *
 * For fal.ai fallback: CLIP has a 77-token limit, keep concise.
 * For Modal backend: T5-XXL has 512 tokens, can be richer.
 */
export function buildEnrichedPrompt(prompt: string, ws: WidgetState, concise: boolean = true): string {
  const prefix: string[] = [];
  const suffix: string[] = [];

  // Clean user prompt of phrases that widgets now control
  const cleanedPrompt = cleanPromptOfWidgetPhrases(prompt, ws);

  // Style — authoritative prefix
  if (ws.styleSelection?.styleName) {
    prefix.push(`${ws.styleSelection.styleName} style,`);
  }

  // Camera — authoritative angle + lens from widget values
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

  // Spatial — authoritative positions from widget regions
  if (ws.spatialRegions?.length) {
    const descs = ws.spatialRegions.map(r =>
      `${r.label} ${describePosition(r.x, r.width)} ${describeDepth(r.depth)}`
    );
    suffix.push(descs.join(", "));
  }

  // Colors — bound to targets
  if (ws.colorSelections?.length) {
    const descs = ws.colorSelections.map(c => `${c.name} ${c.target}`);
    suffix.push(descs.join(", "));
  }

  const result = [...prefix, cleanedPrompt, ...suffix].join(" ");

  if (concise) {
    const words = result.split(/\s+/);
    if (words.length > 70) return words.slice(0, 70).join(" ");
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
  return !!(ws.depthMapDataUrl || ws.segMapDataUrl || ws.cannyMapDataUrl);
}

export async function routeGeneration(input: PipelineInput): Promise<GenerationResult> {
  const { widgetState: ws } = input;

  // Modal backend path — multi-signal conditioning
  // Try Modal directly (no health check — cold start can take 30s+ but generation also takes time)
  if (input.conditioning && process.env.MODAL_API_URL) {
    console.log("[router] Trying Modal backend (multi-signal conditioning)...");
    const enrichedPrompt = buildEnrichedPrompt(input.prompt, ws, false);

    const modalRequest: ModalGenerateRequest = {
      prompt: enrichedPrompt,
      conditioning: input.conditioning,
      enable_controlnet: input.enable_controlnet ?? true,
      enable_regional: input.enable_regional ?? true,
      enable_ip_adapter: input.enable_ip_adapter ?? false,
    };

    try {
      const { imageUrl, response } = await generateWithModal(modalRequest);
      return {
        imageUrl,
        provider: "modal",
        pipeline: response.pipeline_info,
        timestamp: Date.now(),
        seed: response.seed,
        enrichedPrompt: buildInfoSummary(enrichedPrompt, ws, response.conditioning_used ?? []),
        conditioningImages: [
          ...(ws.depthMapDataUrl ? [{ label: "Depth Map", url: ws.depthMapDataUrl, type: "depth" as const }] : []),
          ...(ws.cannyMapDataUrl ? [{ label: "Canny Edges", url: ws.cannyMapDataUrl, type: "canny" as const }] : []),
          ...(ws.regionMasks?.map(rm => ({ label: `Region: ${rm.prompt.slice(0, 30)}`, url: rm.maskDataUrl, type: "mask" as const })) ?? []),
        ],
      };
    } catch (err) {
      console.error("[router] Modal failed, falling back to fal.ai:", err);
      // Fall through to fal.ai paths
    }
  }

  // fal.ai ControlNet fallback — depth map only (degraded)
  const enrichedPrompt = buildEnrichedPrompt(input.prompt, ws, true);
  console.log(`[router] Enriched: "${enrichedPrompt.slice(0, 300)}"`);

  if (hasConditioningImages(ws)) {
    console.log("[router] fal.ai ControlNet fallback (depth map only)");
    const r = await generateWithControls({ prompt: enrichedPrompt, widgetState: ws });
    return { ...r, provider: "fal", pipeline: "Flux + ControlNet Depth", timestamp: Date.now(),
      enrichedPrompt: buildInfoSummary(enrichedPrompt, ws, r.conditioningImages) };
  }

  // Text-only path
  console.log("[router] Text-only pipeline");
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
