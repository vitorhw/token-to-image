import { NextRequest, NextResponse } from "next/server";
import { routeGeneration, buildEnrichedPrompt } from "@/lib/pipeline-router";
import { judgeImage } from "@/lib/gemini";
import { TEST_CASES } from "@/lib/test-cases";
import {
  renderSpatialDepthMap,
  renderCameraDepthMap,
  renderCombinedDepthMap,
} from "@/lib/conditioning-server";

export const maxDuration = 120;

export async function POST(req: NextRequest) {
  try {
    const { testId } = await req.json();
    const testCase = TEST_CASES.find(tc => tc.id === testId);
    if (!testCase) {
      return NextResponse.json({ error: `Test case not found: ${testId}` }, { status: 404 });
    }

    console.log(`[test] Running: ${testCase.name}`);

    // Render depth map server-side based on which widgets are active
    const widgetStateWithImages = { ...testCase.widgetState };
    const ws = testCase.widgetState;

    const hasSpatial = !!ws.spatialRegions?.length;
    const hasCamera = !!(ws.cameraSettings && (
      ws.cameraSettings.elevation !== 0 || ws.cameraSettings.azimuth !== 0 || ws.cameraSettings.focalLength !== 50
    ));

    if (hasSpatial && hasCamera) {
      widgetStateWithImages.depthMapDataUrl = renderCombinedDepthMap(ws.cameraSettings!, ws.spatialRegions!);
      console.log("[test] Rendered COMBINED depth map (camera + spatial)");
    } else if (hasCamera) {
      widgetStateWithImages.depthMapDataUrl = renderCameraDepthMap(ws.cameraSettings!);
      console.log("[test] Rendered CAMERA depth map");
    } else if (hasSpatial) {
      widgetStateWithImages.depthMapDataUrl = renderSpatialDepthMap(ws.spatialRegions!);
      console.log("[test] Rendered SPATIAL depth map");
    }

    // Build enriched prompt
    const enrichedPrompt = buildEnrichedPrompt(testCase.prompt, widgetStateWithImages);

    // Generate image
    const startTime = Date.now();
    const result = await routeGeneration({
      prompt: testCase.prompt,
      widgetState: widgetStateWithImages,
    });
    const generationTime = Date.now() - startTime;

    console.log(`[test] Generated in ${generationTime}ms via ${result.pipeline}`);

    // Judge with Gemini
    const judgeStartTime = Date.now();
    const judgement = await judgeImage(
      result.imageUrl,
      testCase.prompt,
      enrichedPrompt,
      testCase.widgetInstructions,
    );
    const judgeTime = Date.now() - judgeStartTime;

    console.log(`[test] Judged in ${judgeTime}ms — score: ${judgement.overallScore}/10, pass: ${judgement.overallPass}`);

    return NextResponse.json({
      testId: testCase.id,
      testName: testCase.name,
      imageUrl: result.imageUrl,
      pipeline: result.pipeline,
      enrichedPrompt,
      generationTime,
      judgeTime,
      judgement,
      conditioningImages: result.conditioningImages,
    });
  } catch (error) {
    console.error("[test] Error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Test failed" },
      { status: 500 }
    );
  }
}
