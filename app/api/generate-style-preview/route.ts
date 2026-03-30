import { NextRequest, NextResponse } from "next/server";
import { generateStylePreview } from "@/lib/gemini";

export async function POST(req: NextRequest) {
  try {
    const { prompt, styleName, description } = await req.json();
    if (!prompt || !styleName || !description) {
      return NextResponse.json({ error: "prompt, styleName, and description required" }, { status: 400 });
    }

    const imageUrl = await generateStylePreview(styleName, description, prompt);
    return NextResponse.json({ imageUrl });
  } catch (error) {
    console.error("Style preview generation error:", error);
    return NextResponse.json({ error: "Failed to generate style preview" }, { status: 500 });
  }
}
