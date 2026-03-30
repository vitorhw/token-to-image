"use client";

import { useMemo, useCallback, useState } from "react";
import { Slider } from "@/components/ui/slider";
import { Button } from "@/components/ui/button";
import { StyleSelection, StyleSuggestion } from "@/types/tokens";
import { cn } from "@/lib/utils";
import { Check, ChevronRight, Loader2 } from "lucide-react";
import type { EagerStylesData } from "@/components/prompt-input";

const ALL_STYLES = [
  { name: "Photorealistic", gradient: "from-gray-400 to-gray-600", tags: ["realistic", "photorealistic", "photo", "professional", "cinematic"] },
  { name: "Impressionist", gradient: "from-blue-300 to-purple-400", tags: ["impressionist", "monet", "painterly"] },
  { name: "Watercolor", gradient: "from-sky-200 to-pink-200", tags: ["watercolor", "soft", "pastel", "delicate"] },
  { name: "Oil Painting", gradient: "from-amber-600 to-yellow-800", tags: ["oil", "painting", "classical", "baroque", "renaissance"] },
  { name: "Anime", gradient: "from-pink-400 to-violet-500", tags: ["anime", "manga", "cartoon", "illustration"] },
  { name: "Pixel Art", gradient: "from-green-400 to-emerald-600", tags: ["pixel", "retro", "8-bit", "game"] },
  { name: "Sketch", gradient: "from-gray-200 to-gray-400", tags: ["sketch", "pencil", "drawing", "line art", "doodle"] },
  { name: "Cinematic", gradient: "from-slate-700 to-orange-900", tags: ["cinematic", "film", "noir", "dramatic", "moody"] },
  { name: "Pop Art", gradient: "from-yellow-400 to-red-500", tags: ["pop art", "warhol", "bold", "graphic"] },
  { name: "Minimalist", gradient: "from-white to-gray-100", tags: ["minimalist", "minimal", "clean", "simple", "flat"] },
  { name: "Digital Art", gradient: "from-cyan-400 to-blue-600", tags: ["digital", "concept art", "modern", "futuristic", "cyberpunk"] },
  { name: "Fantasy", gradient: "from-purple-500 to-indigo-700", tags: ["fantasy", "magical", "ethereal", "surreal", "gothic", "steampunk"] },
  { name: "Vintage", gradient: "from-amber-200 to-orange-300", tags: ["vintage", "retro", "old", "sepia", "aged"] },
  { name: "Abstract", gradient: "from-rose-400 to-indigo-400", tags: ["abstract", "geometric", "modern art"] },
  { name: "Art Deco", gradient: "from-amber-400 to-emerald-600", tags: ["art deco", "gatsby", "gold", "luxury"] },
  { name: "Studio Ghibli", gradient: "from-green-300 to-sky-400", tags: ["ghibli", "miyazaki", "whimsical"] },
];

interface StyleGalleryProps {
  value: StyleSelection | null;
  onChange: (style: StyleSelection) => void;
  tokenText?: string;
  onDone?: () => void;
  eagerStyles?: EagerStylesData | null;
  prompt?: string;
}

export function StyleGallery({ value, onChange, tokenText, onDone, eagerStyles, prompt }: StyleGalleryProps) {
  const [showFullGallery, setShowFullGallery] = useState(false);
  const [fallbackLoading, setFallbackLoading] = useState<string | null>(null);

  const suggestions = eagerStyles?.suggestions ?? [];
  const isLoadingSuggestions = eagerStyles?.isLoadingSuggestions ?? false;
  const hasSuggestions = suggestions.length > 0 || isLoadingSuggestions;

  const sortedStyles = useMemo(() => {
    if (!tokenText) return ALL_STYLES;
    const t = tokenText.toLowerCase();
    const matching = ALL_STYLES.filter(s =>
      s.tags.some(tag => t.includes(tag)) || t.includes(s.name.toLowerCase())
    );
    const rest = ALL_STYLES.filter(s => !matching.includes(s));
    return [...matching, ...rest];
  }, [tokenText]);

  const selectSuggestion = useCallback((suggestion: StyleSuggestion) => {
    onChange({
      styleName: suggestion.styleName,
      selectedReferences: [suggestion.description],
      exemplarUrls: suggestion.previewUrl ? [suggestion.previewUrl] : [],
      strength: value?.strength ?? 0.7,
    });
  }, [onChange, value?.strength]);

  const selectFallbackStyle = useCallback(async (name: string) => {
    // Select immediately with prompt enrichment only
    onChange({
      styleName: name,
      selectedReferences: [],
      exemplarUrls: [],
      strength: value?.strength ?? 0.7,
    });

    // Generate a preview of the user's prompt in this style
    if (!prompt) return;
    setFallbackLoading(name);
    try {
      const res = await fetch("/api/generate-style-preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt, styleName: name, description: name + " art style" }),
      });
      const data = await res.json();
      if (data.imageUrl) {
        onChange({
          styleName: name,
          selectedReferences: [name + " style"],
          exemplarUrls: [data.imageUrl],
          strength: value?.strength ?? 0.7,
        });
      }
    } catch {
      // Silently fail — style is already selected via prompt enrichment
    } finally {
      setFallbackLoading(null);
    }
  }, [onChange, value?.strength, prompt]);

  return (
    <div className="space-y-3">
      {/* Suggested Styles */}
      {hasSuggestions && (
        <div>
          <p className="mb-2 text-xs font-semibold">Suggested Styles</p>
          {isLoadingSuggestions ? (
            <div className="flex items-center gap-2 py-4 text-xs text-muted-foreground">
              <Loader2 className="h-3 w-3 animate-spin" />
              Analyzing your prompt for style suggestions...
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-2">
              {suggestions.map((s, i) => {
                const isSelected = value?.styleName === s.styleName;
                return (
                  <button
                    key={i}
                    onClick={() => selectSuggestion(s)}
                    className={cn(
                      "relative flex flex-col overflow-hidden rounded-lg border-2 text-left transition-all hover:scale-[1.02]",
                      isSelected ? "border-primary bg-primary/5" : "border-border/50 hover:border-border",
                    )}
                  >
                    {s.status === "loaded" && s.previewUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={s.previewUrl} alt={s.styleName} className="w-full aspect-[4/3] object-cover" />
                    ) : (
                      <div className="w-full aspect-[4/3] bg-muted/30 flex items-center justify-center">
                        {s.status === "pending" ? (
                          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground/40" />
                        ) : (
                          <span className="text-[9px] text-muted-foreground/40">Failed</span>
                        )}
                      </div>
                    )}
                    {isSelected && (
                      <div className="absolute top-1.5 right-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-primary text-primary-foreground">
                        <Check className="h-3 w-3" />
                      </div>
                    )}
                    <div className="px-2 py-1.5">
                      <p className="text-[11px] font-medium leading-tight truncate">{s.styleName}</p>
                      <p className="text-[9px] text-muted-foreground leading-tight truncate">{s.description}</p>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* More styles toggle */}
      {!showFullGallery && (
        <button
          onClick={() => setShowFullGallery(true)}
          className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          More styles
          <ChevronRight className="h-3 w-3" />
        </button>
      )}

      {/* Full gallery fallback */}
      {showFullGallery && (
        <div>
          <p className="mb-2 text-xs font-semibold">All Styles</p>
          <div className="grid grid-cols-4 gap-2">
            {sortedStyles.map((style) => (
              <button
                key={style.name}
                onClick={() => selectFallbackStyle(style.name)}
                className={cn(
                  "relative flex flex-col items-center gap-1 rounded-lg border-2 p-1.5 transition-all hover:scale-105",
                  value?.styleName === style.name
                    ? "border-primary bg-primary/5"
                    : "border-transparent hover:border-border",
                )}
              >
                <div className={cn("h-10 w-full rounded-md bg-gradient-to-br", style.gradient)} />
                {fallbackLoading === style.name && (
                  <div className="absolute inset-0 flex items-center justify-center rounded-lg bg-background/60">
                    <Loader2 className="h-4 w-4 animate-spin" />
                  </div>
                )}
                <span className="text-[10px] font-medium leading-tight">{style.name}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Strength slider — visible when a style is selected */}
      {value?.styleName && (
        <>
          <div className="space-y-2 pt-1">
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">{value.styleName}</span>
              <span className="font-medium">{Math.round(value.strength * 100)}%</span>
            </div>
            <Slider
              value={[value.strength * 100]}
              onValueChange={(val) => onChange({ ...value, strength: (Array.isArray(val) ? val[0] : val) / 100 })}
              min={10} max={100} step={5}
            />
          </div>

          {/* Sent to Model info box */}
          <div className="rounded-lg border bg-muted/20 p-2.5">
            <p className="mb-1 text-[10px] font-medium text-muted-foreground">Sent to Model</p>
            <p className="text-[11px] font-mono text-foreground/80 leading-relaxed">
              &ldquo;{value.styleName} style{value.selectedReferences?.[0] ? `, evoking ${value.selectedReferences[0]}` : ""}.&rdquo;
            </p>
            <p className="mt-1 text-[10px] text-muted-foreground">
              {value.exemplarUrls.length > 0
                ? "1 reference image attached for Fal reference-image conditioning."
                : "Prompt enrichment only (no reference image)."}
            </p>
          </div>

          {/* Done button */}
          <Button className="w-full h-10" onClick={onDone}>
            Done
          </Button>
        </>
      )}
    </div>
  );
}
