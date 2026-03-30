import { WidgetState, ConditioningImage } from "@/types/tokens";
import { generateWithGemini } from "./gemini";
import { generateWithFlux, generateWithControls, inpaintWithFlux } from "./fal";

interface PipelineInput {
  prompt: string;
  enrichedPrompt: string;
  widgetState: WidgetState;
  previousImageUrl?: string;
}

export interface PipelineResult {
  imageUrls: string[];
  provider: "gemini" | "fal";
  pipeline: string;
  enrichedPrompt: string;
  conditioningImages: ConditioningImage[];
}

function getActiveStyleReference(ws: WidgetState): string | undefined {
  return ws.styleSelection?.selectedReferences?.[0];
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
    const activeReference = getActiveStyleReference(ws);
    if (activeReference) {
      parts.push(`${ws.styleSelection.styleName} style, evoking ${activeReference}.`);
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

function buildInfoSummary(enrichedPrompt: string, ws: WidgetState, condImages: ConditioningImage[]): string {
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
    const activeReference = getActiveStyleReference(ws);
    const refs = activeReference
      ? ` (${activeReference})`
      : "";
    const exemplarCount = ws.styleSelection.exemplarUrls?.length
      ? " [1 reference image]"
      : "";
    lines.push(`Style: ${ws.styleSelection.styleName}${refs}${exemplarCount}`);
  }

  return lines.join("\n");
}

function hasConditioningImages(ws: WidgetState): boolean {
  return !!(ws.depthMapDataUrl || ws.poseImageDataUrl || ws.styleSelection?.exemplarUrls?.length);
}

function describeConditioningPipeline(ws: WidgetState): string {
  const parts: string[] = [];

  if (ws.depthMapDataUrl || ws.poseImageDataUrl) {
    if (ws.depthMapDataUrl && ws.poseImageDataUrl) {
      parts.push("Depth/Pose ControlNet");
    } else if (ws.depthMapDataUrl) {
      parts.push("Depth ControlNet");
    } else {
      parts.push("Pose ControlNet");
    }
  }

  if (ws.styleSelection?.exemplarUrls?.length) {
    parts.push("Reference Image");
  }

  return parts.length > 0 ? `Flux + ${parts.join(" + ")}` : "Flux General";
}

export async function routeGeneration(input: PipelineInput): Promise<PipelineResult> {
  const { widgetState: ws, previousImageUrl } = input;
  const enrichedPrompt = buildEnrichedPrompt(input.prompt, ws);

  console.log(`[router] Enriched: "${enrichedPrompt.slice(0, 250)}"`);

  // Inpainting — single image, no candidate grid
  if (ws.maskRegion && previousImageUrl) {
    const r = await inpaintWithFlux(previousImageUrl, ws.maskRegion.dataUrl, ws.maskRegion.editPrompt || enrichedPrompt);
    return {
      imageUrls: r.imageUrls,
      provider: "fal",
      pipeline: "Flux Inpainting",
      enrichedPrompt: buildInfoSummary(enrichedPrompt, ws, r.conditioningImages),
      conditioningImages: r.conditioningImages,
    };
  }

  // Conditioned path — 4 images from fal
  if (hasConditioningImages(ws)) {
    console.log(`[router] ${describeConditioningPipeline(ws)} pipeline (4 images)`);
    const r = await generateWithControls({ prompt: enrichedPrompt, widgetState: ws });
    return {
      imageUrls: r.imageUrls,
      provider: "fal",
      pipeline: describeConditioningPipeline(ws),
      enrichedPrompt: buildInfoSummary(enrichedPrompt, ws, r.conditioningImages),
      conditioningImages: r.conditioningImages,
    };
  }

  // Text-only — 4 parallel Gemini calls, fallback to Flux
  console.log("[router] Text-only pipeline (4 parallel Gemini calls)");
  try {
    const results = await Promise.allSettled(
      Array.from({ length: 4 }, () => generateWithGemini(enrichedPrompt))
    );
    const urls = results
      .filter((r): r is PromiseFulfilledResult<string> => r.status === "fulfilled")
      .map(r => r.value);
    if (urls.length === 0) throw new Error("All Gemini calls failed");
    return {
      imageUrls: urls,
      provider: "gemini",
      pipeline: "Gemini Flash",
      enrichedPrompt: buildInfoSummary(enrichedPrompt, ws, []),
      conditioningImages: [],
    };
  } catch {
    console.log("[router] Gemini failed, falling back to Flux (4 images)");
    const r = await generateWithFlux(enrichedPrompt);
    return {
      imageUrls: r.imageUrls,
      provider: "fal",
      pipeline: "Flux General",
      enrichedPrompt: buildInfoSummary(enrichedPrompt, ws, []),
      conditioningImages: [],
    };
  }
}
