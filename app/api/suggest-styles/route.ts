import { NextRequest, NextResponse } from "next/server";
import { suggestStyles } from "@/lib/gemini";

export async function POST(req: NextRequest) {
  try {
    const { prompt, tokenText } = await req.json();
    if (!prompt || !tokenText) {
      return NextResponse.json({ error: "prompt and tokenText required" }, { status: 400 });
    }

    const suggestions = await suggestStyles(prompt, tokenText);
    return NextResponse.json({ suggestions });
  } catch (error) {
    console.error("Style suggestion error:", error);
    return NextResponse.json({ error: "Failed to suggest styles" }, { status: 500 });
  }
}
