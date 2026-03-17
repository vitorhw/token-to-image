import { NextRequest, NextResponse } from "next/server";
import { generatePoseVariations } from "@/lib/gemini";

export async function POST(req: NextRequest) {
  try {
    const { description, fullPrompt } = await req.json();
    if (!description) {
      return NextResponse.json({ error: "description is required" }, { status: 400 });
    }
    const result = await generatePoseVariations(description, fullPrompt || description);
    return NextResponse.json(result);
  } catch (error) {
    console.error("Pose generation error:", error);
    return NextResponse.json({ error: "Failed to generate poses" }, { status: 500 });
  }
}
