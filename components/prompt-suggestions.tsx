"use client";

import { useState } from "react";
import { Card } from "@/components/ui/card";

interface PromptSuggestionsProps {
  onSelect: (prompt: string) => void;
}

const SUGGESTION_POOL = [
  "A dancer mid-leap on a cliff edge overlooking a turquoise ocean at golden hour, impressionist style",
  "An elderly fisherman casting his net in the foreground of a misty lake at dawn, watercolor style",
  "A child reaching up to catch fireflies in a dark forest, the warm glow illuminating their face, cinematic style",
  "A street musician playing violin next to a red telephone booth in the rain, neon reflections on wet cobblestones, cyberpunk style",
  "A confident architect presenting blueprints in a modern glass office, the city skyline visible in the background, photorealistic",
  "A skateboarder mid-trick above a graffiti-covered halfpipe, purple and orange sunset behind them, pop art style",
  "A samurai standing in the foreground of a cherry blossom garden, crimson armor, soft moonlight, anime style",
  "An astronaut floating next to a giant blue jellyfish in deep space, bioluminescent glow, surreal style",
  "A witch reading a glowing book in a cozy treehouse, warm candlelight, fantasy illustration style",
  "A majestic eagle soaring above a snowy mountain range, dramatic storm clouds, golden light breaking through, cinematic",
  "A curious fox sitting next to a vintage red lantern in a dark bamboo forest, watercolor style",
  "A white horse galloping along a beach at sunset, waves crashing in the background, oil painting style",
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
    <div className="space-y-2">
      <p className="text-sm font-medium text-muted-foreground">Try a prompt</p>
      <div className="flex flex-col gap-2">
        {suggestions.map((s, i) => (
          <Card
            key={i}
            className="cursor-pointer p-3 text-sm text-muted-foreground transition-colors hover:border-primary/30 hover:bg-accent hover:text-foreground"
            onClick={() => onSelect(s)}
          >
            {s}
          </Card>
        ))}
      </div>
    </div>
  );
}
