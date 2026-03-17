import { NextRequest, NextResponse } from "next/server";
import { routeGeneration } from "@/lib/pipeline-router";

export const maxDuration = 120;

export async function POST(req: NextRequest) {
  const startTime = Date.now();
  try {
    const body = await req.json();
    const { prompt, widgetState = {}, previousImageUrl } = body;

    if (!prompt || typeof prompt !== "string") {
      return NextResponse.json({ error: "Prompt is required" }, { status: 400 });
    }

    console.log(`[generate] Starting: "${prompt.slice(0, 80)}..."`);
    console.log(`[generate] Widgets: ${Object.keys(widgetState).filter(k => widgetState[k] != null).join(", ") || "none"}`);

    const result = await routeGeneration({
      prompt,
      enrichedPrompt: prompt,
      widgetState,
      previousImageUrl,
    });

    console.log(`[generate] Done in ${Date.now() - startTime}ms via ${result.pipeline}`);
    return NextResponse.json({ ...result, enrichedPrompt: result.enrichedPrompt });
  } catch (error) {
    console.error(`[generate] FAILED after ${Date.now() - startTime}ms:`, error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to generate image" },
      { status: 500 }
    );
  }
}
