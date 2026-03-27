/**
 * Shared prompt utilities — safe for both client and server.
 * No server-only imports (no gemini, fal, modal).
 */

import { SpatialRegion, ColorSelection } from "@/types/tokens";

function describeDepth(depth: number): string {
  if (depth < 0.3) return "in the background";
  if (depth < 0.6) return "in the mid-ground";
  return "in the foreground";
}

/**
 * Build a focused per-region prompt for Regional Prompting.
 * Binds color selections to matching regions by target name.
 */
export function buildRegionPromptText(
  region: SpatialRegion,
  colorSelections?: ColorSelection[],
): string {
  let prompt = region.label;

  // Bind matching color
  const match = colorSelections?.find(c =>
    region.label.toLowerCase().includes(c.target.toLowerCase()) ||
    c.target.toLowerCase().includes(region.label.toLowerCase())
  );
  if (match) {
    prompt = `${match.name} ${prompt}`;
  }

  // Size hint
  const area = region.width * region.height;
  if (area > 0.25) prompt += ", large";
  else if (area < 0.04) prompt += ", small";

  // Depth hint
  prompt += `, ${describeDepth(region.depth)}`;

  return prompt;
}
