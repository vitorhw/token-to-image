"use client";

import { useMemo } from "react";
import { Slider } from "@/components/ui/slider";
import { Label } from "@/components/ui/label";
import { StyleSelection } from "@/types/tokens";
import { cn } from "@/lib/utils";

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
}

export function StyleGallery({ value, onChange, tokenText }: StyleGalleryProps) {
  // Sort styles: matching styles first, then the rest
  const sortedStyles = useMemo(() => {
    if (!tokenText) return ALL_STYLES;
    const t = tokenText.toLowerCase();
    const matching = ALL_STYLES.filter(s =>
      s.tags.some(tag => t.includes(tag)) || t.includes(s.name.toLowerCase())
    );
    const rest = ALL_STYLES.filter(s => !matching.includes(s));
    return [...matching, ...rest];
  }, [tokenText]);

  const hasMatches = tokenText && sortedStyles[0]?.tags.some(tag =>
    tokenText.toLowerCase().includes(tag)
  );

  function selectStyle(name: string) {
    onChange({ exemplarUrl: "", styleName: name, strength: value?.strength ?? 0.7 });
  }

  return (
    <div className="space-y-3">
      {hasMatches && (
        <Label className="text-xs text-muted-foreground">
          Suggested styles for &quot;{tokenText}&quot;
        </Label>
      )}
      <div className="grid grid-cols-4 gap-2">
        {sortedStyles.slice(0, 12).map((style, i) => (
          <button key={style.name} onClick={() => selectStyle(style.name)}
            className={cn(
              "group flex flex-col items-center gap-1 rounded-lg border-2 p-1.5 transition-all hover:scale-105",
              value?.styleName === style.name
                ? "border-primary bg-primary/5"
                : "border-transparent hover:border-border",
              hasMatches && i < (sortedStyles.filter((s) =>
                s.tags.some(tag => (tokenText || "").toLowerCase().includes(tag))
              ).length) && "ring-1 ring-primary/20",
            )}
          >
            <div className={cn("h-12 w-full rounded-md bg-gradient-to-br", style.gradient)} />
            <span className="text-[10px] font-medium leading-tight">{style.name}</span>
          </button>
        ))}
      </div>

      {value && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label className="text-xs">Style Strength: {Math.round(value.strength * 100)}%</Label>
            <span className="text-xs text-muted-foreground">{value.styleName}</span>
          </div>
          <Slider value={[value.strength * 100]}
            onValueChange={(val) => onChange({ ...value, strength: (Array.isArray(val) ? val[0] : val) / 100 })}
            min={10} max={100} step={5} />
          <p className="text-xs text-muted-foreground">
            Style name enriches the text prompt sent to the model
          </p>
        </div>
      )}
    </div>
  );
}
