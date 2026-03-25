"use client";

import { useState } from "react";
import { Sparkles } from "lucide-react";

interface PromptSuggestionsProps {
  onSelect: (prompt: string) => void;
}

// Prompts designed to trigger the 4 supported widgets:
// spatial_position/size/depth, color, camera_angle, style
const SUGGESTION_POOL = [
  // Nature + Spatial
  "A large red barn on the left side of a golden wheat field, with distant blue mountains in the background, watercolor style, wide angle shot",
  "A tiny white boat in the foreground of a turquoise ocean, with a lighthouse on the right side in the background, cinematic style, bird's eye view",
  "A green tree in the center foreground with a small cottage in the background on the right, impressionist style, eye level shot",

  // Urban + Color
  "A bright yellow taxi next to a red telephone booth on a city street, with tall buildings in the background, pop art style, low angle shot",
  "A neon purple sign in the foreground with a dark alley stretching into the background, cyberpunk style, wide angle",
  "A crimson vintage car parked on the left side of a cobblestone street, golden hour lighting, cinematic style, telephoto shot",

  // Fantasy + Style
  "A large crystal castle in the center background with a small glowing orb in the foreground, fantasy illustration style, low angle shot",
  "A white lighthouse on the right side of a cliff overlooking a deep blue ocean on the left, oil painting style, bird's eye view",
  "A small golden crown on a velvet cushion in the foreground, with a grand throne room in the background, baroque style, close-up",

  // Animals + Composition
  "A large orange cat on the left and a small grey mouse on the right, green garden background, watercolor style, eye level",
  "A majestic eagle soaring in the foreground above a snowy mountain range in the background, cinematic style, low angle wide shot",
  "A colorful parrot perched on a branch on the right side, with a tropical forest in the background, photorealistic style, close-up shot",
];

export function PromptSuggestions({ onSelect }: PromptSuggestionsProps) {
  const [suggestions] = useState(() => {
    const idx = typeof window !== "undefined" ? Math.floor(Math.random() * SUGGESTION_POOL.length) : 0;
    return [
      SUGGESTION_POOL[idx % SUGGESTION_POOL.length],
      SUGGESTION_POOL[(idx + 4) % SUGGESTION_POOL.length],
      SUGGESTION_POOL[(idx + 8) % SUGGESTION_POOL.length],
    ];
  });

  return (
    <div className="flex flex-col items-center justify-center gap-6 py-16">
      <div className="flex items-center gap-2 text-muted-foreground">
        <Sparkles className="h-5 w-5" />
        <p className="text-sm font-medium">Try a prompt to get started</p>
      </div>
      <div className="flex flex-col gap-2 w-full max-w-xl">
        {suggestions.map((s, i) => (
          <button
            key={i}
            onClick={() => onSelect(s)}
            className="rounded-lg border bg-card p-3 text-left text-sm text-muted-foreground transition-all hover:border-primary/30 hover:bg-accent hover:text-foreground"
          >
            {s}
          </button>
        ))}
      </div>
    </div>
  );
}
