import { GoogleGenAI, Type } from "@google/genai";
import { DetectedToken, TokenCategory, PoseKeypoint } from "@/types/tokens";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });

const TOKEN_CATEGORIES: TokenCategory[] = [
  "spatial_position", "spatial_size", "spatial_depth", "color",
  "camera_angle", "style", "pose",
];

export async function detectTokens(prompt: string): Promise<DetectedToken[]> {
  const response = await ai.models.generateContent({
    model: "gemini-2.5-flash",
    contents: `You are a text-to-image prompt analyzer. Given a user's prompt, identify ambiguous visual tokens that would benefit from visual specification rather than text alone.

For each ambiguous token, return:
- text: the exact substring from the prompt
- startIndex: character index where the token starts in the prompt
- endIndex: character index where the token ends
- category: one of ${TOKEN_CATEGORIES.join(", ")}
- subcategory: specific sub-type
- underspecification: what exactly is ambiguous about this token
- suggestedWidget: brief description of what visual control would help

CRITICAL RULES:
- When multiple words describe the SAME subject's body language / pose / gesture (e.g. "confident businesswoman walking"), merge them into ONE pose token covering the full span. Do NOT create separate pose tokens for "confident" and "walking" if they describe the same person.
- Only flag tokens that are genuinely ambiguous for image generation
- Don't flag every color word — only when the exact shade matters and is underspecified
- Spatial terms like "next to", "in the corner" are almost always ambiguous
- Camera terms like "close-up", "bird's eye" need precise angle specification
- Style terms like "cinematic", "watercolor" benefit from visual reference
- Focus on the MOST impactful ambiguities (max 5-6 tokens per prompt)
- Tokens must NOT overlap in character ranges

Prompt: "${prompt}"

Return ONLY a JSON array of detected tokens. No markdown, no explanation.`,
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            text: { type: Type.STRING },
            startIndex: { type: Type.INTEGER },
            endIndex: { type: Type.INTEGER },
            category: { type: Type.STRING },
            subcategory: { type: Type.STRING },
            underspecification: { type: Type.STRING },
            suggestedWidget: { type: Type.STRING },
          },
          required: ["text", "startIndex", "endIndex", "category", "subcategory", "underspecification", "suggestedWidget"],
        },
      },
    },
  });

  try {
    const tokens = JSON.parse(response.text ?? "[]") as DetectedToken[];
    return tokens.filter((t) => TOKEN_CATEGORIES.includes(t.category as TokenCategory));
  } catch {
    return [];
  }
}

/**
 * Generate multiple pose variations from a description.
 * Returns 4 different interpretations so user can choose.
 */
export async function generatePoseVariations(description: string, fullPrompt: string): Promise<{
  variations: { poseName: string; reasoning: string; keypoints: PoseKeypoint[] }[];
}> {
  const JOINTS = [
    "head", "neck", "left_shoulder", "right_shoulder",
    "left_elbow", "right_elbow", "left_wrist", "right_wrist",
    "hip", "left_knee", "right_knee", "left_ankle", "right_ankle",
  ];

  const response = await ai.models.generateContent({
    model: "gemini-2.5-flash",
    contents: `You are a human pose estimation expert. Given a description, generate 4 DIFFERENT plausible 2D skeleton pose variations.

Coordinate space: 0-1 normalized. (0,0) = top-left, (1,1) = bottom-right.
Head near y=0.1, feet near y=0.9, centered at x=0.5.

Joints: ${JOINTS.join(", ")}

Context: "${fullPrompt}"
Pose description: "${description}"

Generate 4 distinct interpretations. For example if the description is "confident walking":
- Variation 1: striding forward with chest out
- Variation 2: power walk with arms swinging
- Variation 3: casual confident walk with hands in pockets
- Variation 4: walking with one hand raised

Each variation should be a genuinely different pose, not just tiny shifts.`,
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          variations: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                poseName: { type: Type.STRING },
                reasoning: { type: Type.STRING },
                keypoints: {
                  type: Type.ARRAY,
                  items: {
                    type: Type.OBJECT,
                    properties: {
                      name: { type: Type.STRING },
                      x: { type: Type.NUMBER },
                      y: { type: Type.NUMBER },
                    },
                    required: ["name", "x", "y"],
                  },
                },
              },
              required: ["poseName", "reasoning", "keypoints"],
            },
          },
        },
        required: ["variations"],
      },
    },
  });

  try {
    const data = JSON.parse(response.text ?? '{"variations":[]}');
    return {
      variations: (data.variations ?? []).map((v: any) => ({
        poseName: v.poseName ?? description,
        reasoning: v.reasoning ?? "",
        keypoints: (v.keypoints ?? []).map((kp: any) => ({
          name: kp.name,
          x: Math.max(0, Math.min(1, kp.x)),
          y: Math.max(0, Math.min(1, kp.y)),
          confidence: 1,
        })),
      })),
    };
  } catch {
    return { variations: [] };
  }
}

export async function generateWithGemini(prompt: string): Promise<string> {
  const response = await ai.models.generateContent({
    model: "gemini-2.5-flash-preview-image-generation",
    contents: prompt,
    config: {
      responseModalities: ["TEXT", "IMAGE"],
    },
  });

  for (const part of response.candidates?.[0]?.content?.parts ?? []) {
    if (part.inlineData) {
      const base64 = part.inlineData.data;
      const mimeType = part.inlineData.mimeType;
      return `data:${mimeType};base64,${base64}`;
    }
  }

  throw new Error("No image generated by Gemini");
}
