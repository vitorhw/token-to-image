import { NextRequest, NextResponse } from "next/server";
import { generateSpatialMap } from "@/lib/gemini";

export async function POST(req: NextRequest) {
  try {
    const { regions, prompt, layoutDiagramDataUrl, poseKeypoints } = await req.json();
    if (!regions?.length) {
      return NextResponse.json({ error: "regions required" }, { status: 400 });
    }
    const mapDataUrl = await generateSpatialMap(regions, prompt || "", layoutDiagramDataUrl, poseKeypoints);
    return NextResponse.json({ mapDataUrl });
  } catch (error) {
    console.error("Spatial map generation error:", error);
    return NextResponse.json(
      { error: "Failed to generate spatial map" },
      { status: 500 }
    );
  }
}
