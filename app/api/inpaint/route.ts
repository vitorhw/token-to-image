import { NextRequest, NextResponse } from "next/server";
import { inpaintWithFlux } from "@/lib/fal";

export const maxDuration = 120;

export async function POST(req: NextRequest) {
  try {
    const { imageUrl, maskUrl, prompt } = await req.json();
    if (!imageUrl || !maskUrl || !prompt) {
      return NextResponse.json({ error: "imageUrl, maskUrl, and prompt are required" }, { status: 400 });
    }
    const resultUrl = await inpaintWithFlux(imageUrl, maskUrl, prompt);
    return NextResponse.json({ imageUrl: resultUrl });
  } catch (error) {
    console.error("Inpainting error:", error);
    return NextResponse.json({ error: "Failed to inpaint" }, { status: 500 });
  }
}
