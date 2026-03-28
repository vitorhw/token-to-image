import { GoogleGenAI, Type } from "@google/genai";
import { DetectedToken, TokenCategory, PoseKeypoint } from "@/types/tokens";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });

const TOKEN_CATEGORIES: TokenCategory[] = [
  "spatial_position", "spatial_size", "spatial_depth", "color",
  "style", "pose",
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
- POSE tokens should ONLY be created for HUMAN subjects (people, characters, figures). Do NOT create pose tokens for animals (horses, dogs, birds, etc.) or non-living objects. The pose widget uses a human skeleton with joints like shoulders, elbows, knees — it only works for human body poses.
- Only flag tokens that are genuinely ambiguous for image generation
- Don't flag every color word — only when the exact shade matters and is underspecified
- Spatial terms like "next to", "in the corner" are almost always ambiguous
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

export async function generateSpatialMap(
  regions: { label: string; x: number; y: number; width: number; height: number; depth: number; rotation?: number }[],
  prompt: string,
  referenceMapDataUrl?: string,
  poseKeypoints?: { name: string; x: number; y: number }[],
): Promise<string> {
  const layoutDesc = regions.map(r => {
    const gray = Math.round(r.depth * 255);
    const rot = r.rotation ?? 0;
    return `- "${r.label}": position x=${Math.round(r.x * 100)}% y=${Math.round(r.y * 100)}%, size ${Math.round(r.width * 100)}%x${Math.round(r.height * 100)}%, rotated ${rot}°, gray brightness ${gray}/255`;
  }).join('\n');

  let poseDesc = "";
  if (poseKeypoints?.length) {
    poseDesc = `\n\nIMPORTANT — A human pose skeleton has been configured. The human silhouette in the depth map MUST match this pose:
${poseKeypoints.map(kp => `  ${kp.name}: (${Math.round(kp.x * 100)}%, ${Math.round(kp.y * 100)}%)`).join('\n')}
The person's silhouette shape must reflect this skeleton — limb positions, head angle, etc.`;
  }

  // Build content parts — include reference image if available
  const contentParts: any[] = [];

  if (referenceMapDataUrl) {
    const base64 = referenceMapDataUrl.split(",")[1];
    const mime = referenceMapDataUrl.match(/:(.*?);/)?.[1] ?? "image/png";
    contentParts.push({
      inlineData: { data: base64, mimeType: mime },
    });
    contentParts.push({
      text: `The image above is a rough reference layout showing the approximate positions, sizes, and rotations of objects as gray rectangles. Your job is to REFINE this layout into a proper depth map:

1. Keep EVERY object at the EXACT SAME position, size, and rotation shown in the reference
2. Replace the rectangles with appropriate SILHOUETTE shapes (person → human shape, tree → tree shape, building → building shape, etc.)
3. Keep the EXACT SAME gray brightness values — do not change depths
4. Pure grayscale, no color, no outlines, no detail inside shapes — just solid filled silhouettes
5. Keep the black background
6. Add slight gaussian blur to edges
7. NO TEXT in the output

Scene context: "${prompt}"

Objects:
${layoutDesc}${poseDesc}

Output a refined 1024x1024 grayscale depth map that matches the reference layout exactly but with proper silhouettes instead of rectangles.`,
    });
  } else {
    contentParts.push({
      text: `Generate a DEPTH MAP for ControlNet. Every pixel is a grayscale depth value.

Rules:
1. PURE GRAYSCALE — no color
2. NO outlines, edges, wireframes, or detail. Solid flat fills only.
3. BLACK background = far. Brighter = closer.
4. Each object is a solid filled SILHOUETTE shape at the specified gray value
5. Slight gaussian blur on edges
6. NO TEXT

Scene: "${prompt}"

Objects:
${layoutDesc}${poseDesc}

Generate a 1024x1024 grayscale depth map.`,
    });
  }

  const response = await ai.models.generateContent({
    model: "gemini-2.5-flash-image",
    contents: contentParts,
    config: {
      responseModalities: ["IMAGE"],
    },
  });

  for (const part of response.candidates?.[0]?.content?.parts ?? []) {
    if (part.inlineData) {
      return `data:${part.inlineData.mimeType};base64,${part.inlineData.data}`;
    }
  }
  throw new Error("No depth map generated");
}

export async function generateStyleReference(styleName: string, concept: string): Promise<string> {
  const response = await ai.models.generateContent({
    model: "gemini-2.5-flash-image",
    contents: `Generate a small thumbnail reference image in ${styleName} style depicting: ${concept}. Make it a clear, beautiful example of this style. Square format.`,
    config: {
      responseModalities: ["IMAGE"],
    },
  });

  for (const part of response.candidates?.[0]?.content?.parts ?? []) {
    if (part.inlineData) {
      return `data:${part.inlineData.mimeType};base64,${part.inlineData.data}`;
    }
  }
  throw new Error("No reference image generated");
}

export async function generateWithGemini(prompt: string): Promise<string> {
  const response = await ai.models.generateContent({
    model: "gemini-2.5-flash-image",
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
