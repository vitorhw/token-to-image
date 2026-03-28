import { NextRequest, NextResponse } from "next/server";
import { generateStyleReference } from "@/lib/gemini";

export async function POST(req: NextRequest) {
  try {
    const { styleName, concepts } = await req.json();
    if (!styleName || !concepts?.length) {
      return NextResponse.json({ error: "styleName and concepts required" }, { status: 400 });
    }

    // Generate all reference images in parallel
    const results = await Promise.allSettled(
      (concepts as string[]).map((concept: string) =>
        generateStyleReference(styleName, concept)
      )
    );

    const images: Record<string, string> = {};
    (concepts as string[]).forEach((concept: string, i: number) => {
      const result = results[i];
      if (result.status === "fulfilled") {
        images[concept] = result.value;
      }
    });

    return NextResponse.json({ images });
  } catch (error) {
    console.error("Style reference generation error:", error);
    return NextResponse.json({ error: "Failed to generate references" }, { status: 500 });
  }
}
