"use client";

import { useState } from "react";
import { Sparkles } from "lucide-react";

interface PromptSuggestionsProps {
  onSelect: (prompt: string) => void;
}

// All prompts are designed to trigger EVERY widget type:
// pose, spatial_position/depth, color, lighting, camera_angle, style
const SUGGESTION_POOL = [
  // Group 1: People + Nature
  "A dancer mid-leap on a cliff edge overlooking a turquoise ocean at golden hour, impressionist style, shot from a low angle",
  "An elderly fisherman casting his net in the foreground of a misty lake at dawn, watercolor style, dramatic side lighting, bird's eye view",
  "A child reaching up to catch fireflies in a dark forest, the warm glow illuminating their face, cinematic style, close-up shot",

  // Group 2: Urban + Professional
  "A street musician playing violin next to a red telephone booth in the rain, neon reflections on wet cobblestones, cyberpunk style, low angle shot",
  "A confident architect presenting blueprints in a modern glass office, soft diffused lighting, the city skyline visible in the background, photorealistic",
  "A skateboarder mid-trick above a graffiti-covered halfpipe, purple and orange sunset behind them, pop art style, wide angle",

  // Group 3: Fantasy + Conceptual
  "A samurai standing in the foreground of a cherry blossom garden, crimson armor, soft moonlight casting long shadows, anime style, close-up portrait",
  "An astronaut floating next to a giant blue jellyfish in deep space, bioluminescent glow, surreal style, bird's eye view",
  "A witch reading a glowing book in a cozy treehouse, warm candlelight, autumn forest visible through the window, fantasy illustration style",

  // Group 4: Animals + Scenes
  "A majestic eagle soaring above a snowy mountain range in the foreground, dramatic storm clouds behind, golden light breaking through, cinematic wide angle",
  "A curious fox sitting next to a vintage red lantern in a dark bamboo forest, soft warm lighting from below, watercolor style, eye level",
  "A white horse galloping along a beach at sunset, waves crashing in the background, warm orange and purple sky, oil painting style, side angle",
];

export function PromptSuggestions({ onSelect }: PromptSuggestionsProps) {
  // Pick 3 suggestions — use stable indices to avoid hydration mismatch
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
