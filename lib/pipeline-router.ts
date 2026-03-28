import { WidgetState, GenerationResult } from "@/types/tokens";
import { generateWithGemini } from "./gemini";
import { generateWithFlux, generateWithControls, inpaintWithFlux } from "./fal";

interface PipelineInput {
  prompt: string;
  enrichedPrompt: string;
  widgetState: WidgetState;
  previousImageUrl?: string;
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
 * Build enriched prompt with widget state PREPENDED as structured instructions.
 * Models weight the start of the prompt more heavily.
 */
function buildEnrichedPrompt(prompt: string, ws: WidgetState): string {
  const parts: string[] = [];

  // Style FIRST (most impactful on overall result)
  if (ws.styleSelection?.styleName) {
    const refs = ws.styleSelection.selectedReferences;
    if (refs?.length) {
      parts.push(`${ws.styleSelection.styleName} style, evoking ${refs.join(", ")}.`);
    } else {
      parts.push(`${ws.styleSelection.styleName} style.`);
    }
  }

  // Spatial layout
  if (ws.spatialRegions?.length) {
    const descs = ws.spatialRegions.map(r =>
      `${r.label} placed ${describePosition(r.x, r.width)}, ${describeDepth(r.depth)}`
    );
    parts.push(`Composition: ${descs.join("; ")}.`);
  }

  // The original prompt in the middle
  parts.push(prompt);

  // Colors
  if (ws.colorSelections?.length) {
    const descs = ws.colorSelections.map(c => `${c.target}: ${c.name} (${c.hex})`);
    parts.push(`Colors: ${descs.join(", ")}.`);
  }

  // Pose
  if (ws.poseSelection?.sourceName) {
    parts.push(`Subject pose: ${ws.poseSelection.sourceName}.`);
  }

  return parts.join(" ");
}

function buildInfoSummary(enrichedPrompt: string, ws: WidgetState, condImages: any[]): string {
  const lines: string[] = [`Prompt:\n${enrichedPrompt}`];

  if (condImages.length > 0) {
    lines.push("\nConditioning:");
    condImages.forEach(ci => lines.push(`  [${ci.type.toUpperCase()}] ${ci.label}`));
  }

  if (ws.spatialRegions?.length) {
    lines.push(`Spatial: ${ws.spatialRegions.map(r => `"${r.label}" at x=${Math.round(r.x*100)}% depth=${Math.round(r.depth*100)}%`).join(", ")}`);
  }
  if (ws.colorSelections?.length) {
    lines.push(`Colors: ${ws.colorSelections.map(c => `${c.target}=${c.name}`).join(", ")}`);
  }
  if (ws.poseSelection?.sourceName) {
    lines.push(`Pose: ${ws.poseSelection.sourceName}`);
  }
  if (ws.styleSelection?.styleName) {
    lines.push(`Style: ${ws.styleSelection.styleName}`);
  }

  return lines.join("\n");
}

function hasConditioningImages(ws: WidgetState): boolean {
  return !!(ws.depthMapDataUrl || ws.poseImageDataUrl || ws.styleSelection?.exemplarUrls?.length);
}

export async function routeGeneration(input: PipelineInput): Promise<GenerationResult> {
  const { widgetState: ws, previousImageUrl } = input;
  const enrichedPrompt = buildEnrichedPrompt(input.prompt, ws);

  console.log(`[router] Enriched: "${enrichedPrompt.slice(0, 250)}"`);

  // Inpainting
  if (ws.maskRegion && previousImageUrl) {
    const r = await inpaintWithFlux(previousImageUrl, ws.maskRegion.dataUrl, ws.maskRegion.editPrompt || enrichedPrompt);
    return { ...r, provider: "fal", pipeline: "Flux Inpainting", timestamp: Date.now(),
      enrichedPrompt: buildInfoSummary(enrichedPrompt, ws, r.conditioningImages) };
  }

  // ControlNet path
  if (hasConditioningImages(ws)) {
    console.log("[router] ControlNet pipeline");
    const r = await generateWithControls({ prompt: enrichedPrompt, widgetState: ws });
    return { ...r, provider: "fal", pipeline: "Flux + ControlNet", timestamp: Date.now(),
      enrichedPrompt: buildInfoSummary(enrichedPrompt, ws, r.conditioningImages) };
  }

  // Text-only
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
