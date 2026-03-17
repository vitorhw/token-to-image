import { NextRequest, NextResponse } from "next/server";
import { detectTokens } from "@/lib/gemini";

export async function POST(req: NextRequest) {
  try {
    const { prompt } = await req.json();
    if (!prompt || typeof prompt !== "string") {
      return NextResponse.json({ error: "Prompt is required" }, { status: 400 });
    }
    const tokens = await detectTokens(prompt);
    return NextResponse.json({ tokens });
  } catch (error) {
    console.error("Token detection error:", error);
    return NextResponse.json({ error: "Failed to detect tokens" }, { status: 500 });
  }
}
