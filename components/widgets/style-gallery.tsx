"use client";

import { useMemo, useCallback, useState } from "react";
import { Slider } from "@/components/ui/slider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { StyleSelection } from "@/types/tokens";
import { WidgetStep, WidgetWizard } from "./widget-step";
import { cn } from "@/lib/utils";
import { Check, Loader2, Wand2 } from "lucide-react";

const STYLE_REFERENCES: Record<string, string[]> = {
  Photorealistic: ["Golden hour landscape", "Studio portrait", "Street photography", "Macro nature", "Aerial view", "Architecture interior"],
  Impressionist: ["Water lilies", "Sunlit garden", "Rainy boulevard", "Countryside haystacks", "Ballerina in motion", "Cathedral facade"],
  Watercolor: ["Misty landscape", "Flower bouquet", "Portrait sketch", "Seascape", "Forest path", "Sunset sky"],
  "Oil Painting": ["Classical still life", "Baroque portrait", "Stormy seascape", "Pastoral scene", "Renaissance figure", "Floral arrangement"],
  Anime: ["Shonen action scene", "Slice of life school", "Mecha pilot cockpit", "Fantasy floating islands", "Chibi character", "Neon night cityscape"],
  "Pixel Art": ["Retro platformer", "Top-down RPG map", "Character sprite sheet", "Isometric scene", "Sunset dither gradient", "Dungeon interior"],
  Sketch: ["Graphite portrait", "Architectural drawing", "Gesture figure study", "Nature botanical journal", "Urban ink sketch", "Charcoal still life"],
  Cinematic: ["Film noir alley", "Sci-fi corridor", "Western standoff", "Horror silhouette", "Romance sunset", "War drama scene"],
  "Pop Art": ["Warhol-style portrait", "Comic panel", "Bold consumer object", "Halftone gradient", "Neon typography", "Collage mashup"],
  Minimalist: ["Single isolated object", "Geometric shapes", "Monochrome scene", "Continuous line drawing", "Negative space", "Zen garden"],
  "Digital Art": ["Concept art hero", "Environment sci-fi vista", "Creature design", "Cyberpunk street", "Vehicle design", "Hologram UI"],
  Fantasy: ["Dragon in flight", "Enchanted forest", "Wizard tower", "Underwater kingdom", "Elven city", "Dark throne room"],
  Vintage: ["Sepia photograph", "1950s diner", "Victorian portrait", "Old postcard", "Retro travel poster", "Aged newspaper"],
  Abstract: ["Color field painting", "Geometric composition", "Fluid acrylic pour", "Splatter expressionism", "Op art illusion", "Textured layers"],
  "Art Deco": ["Gatsby ballroom", "Skyscraper facade", "Geometric jewelry", "Travel poster", "Cocktail lounge", "Fashion illustration"],
  "Studio Ghibli": ["Countryside meadow wind", "Spirited bathhouse", "Flying steampunk machine", "Forest spirit", "Seaside Mediterranean town", "Rainy bus stop"],
};

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
}

export function StyleGallery({ value, onChange, tokenText, onDone }: StyleGalleryProps) {
  const [generatedImages, setGeneratedImages] = useState<Record<string, string>>({});
  const [isGeneratingRefs, setIsGeneratingRefs] = useState(false);

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

  const concepts = value?.styleName ? (STYLE_REFERENCES[value.styleName] ?? []) : [];

  const selectStyle = useCallback((name: string) => {
    setGeneratedImages({});
    onChange({ exemplarUrls: [], styleName: name, strength: value?.strength ?? 0.7, selectedReferences: [] });
  }, [onChange, value?.strength]);

  const toggleReference = useCallback((label: string) => {
    if (!value) return;
    const current = value.selectedReferences ?? [];
    const next = current.includes(label) ? current.filter(r => r !== label) : [...current, label];
    onChange({ ...value, selectedReferences: next });
  }, [value, onChange]);

  const generateReferenceImages = useCallback(async () => {
    if (!value?.styleName || !concepts.length) return;
    setIsGeneratingRefs(true);
    try {
      const res = await fetch("/api/generate-style-refs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ styleName: value.styleName, concepts }),
      });
      const data = await res.json();
      if (data.images) setGeneratedImages(data.images);
    } catch (err) {
      console.error("Failed to generate reference images:", err);
    } finally {
      setIsGeneratingRefs(false);
    }
  }, [value?.styleName, concepts]);

  return (
    <WidgetWizard onDone={onDone}>
      <WidgetStep
        step={1}
        title="Choose a Style"
        complete={!!value?.styleName}
      >
        <div className="grid grid-cols-4 gap-2">
          {sortedStyles.slice(0, 12).map((style) => (
            <button key={style.name} onClick={() => selectStyle(style.name)}
              className={cn(
                "flex flex-col items-center gap-1 rounded-lg border-2 p-1.5 transition-all hover:scale-105",
                value?.styleName === style.name
                  ? "border-primary bg-primary/5"
                  : "border-transparent hover:border-border",
              )}
            >
              <div className={cn("h-10 w-full rounded-md bg-gradient-to-br", style.gradient)} />
              <span className="text-[10px] font-medium leading-tight">{style.name}</span>
            </button>
          ))}
        </div>
      </WidgetStep>

        <WidgetStep step={2} title="Select Reference Concepts" hidden={!value || concepts.length === 0}>
          {value && concepts.length > 0 && (
            <>
              <div className="mb-2 flex items-center justify-between">
                <Button size="sm" variant="outline" className="h-7 text-xs" onClick={generateReferenceImages} disabled={isGeneratingRefs}>
                  {isGeneratingRefs ? (
                    <><Loader2 className="mr-1 h-3 w-3 animate-spin" />Generating...</>
                  ) : (
                    <><Wand2 className="mr-1 h-3 w-3" />{Object.keys(generatedImages).length > 0 ? "Regenerate" : "Generate"} Images</>
                  )}
                </Button>
                {(value.selectedReferences?.length ?? 0) > 0 && (
                  <Badge variant="secondary" className="text-[10px]">{value.selectedReferences.length} selected</Badge>
                )}
              </div>
              <div className="grid grid-cols-3 gap-2">
                {concepts.map((concept) => {
                  const isSelected = value.selectedReferences?.includes(concept) ?? false;
                  const imageUrl = generatedImages[concept];
                  return (
                    <button key={concept} onClick={() => toggleReference(concept)}
                      className={cn(
                        "relative flex flex-col overflow-hidden rounded-lg border-2 text-left transition-all hover:scale-[1.03]",
                        isSelected ? "border-primary bg-primary/5" : "border-border/50 hover:border-border",
                      )}
                    >
                      {imageUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={imageUrl} alt={concept} className="w-full aspect-square object-cover" />
                      ) : (
                        <div className="w-full aspect-square bg-muted/20 flex items-center justify-center">
                          <span className="text-[9px] text-muted-foreground/60 px-1 text-center leading-tight">{concept}</span>
                        </div>
                      )}
                      {isSelected && (
                        <div className="absolute top-1.5 right-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-primary text-primary-foreground">
                          <Check className="h-3 w-3" />
                        </div>
                      )}
                      <p className="px-1.5 py-1 text-[10px] font-medium leading-tight truncate w-full">{concept}</p>
                    </button>
                  );
                })}
              </div>
            </>
          )}
        </WidgetStep>

        <WidgetStep step={concepts.length > 0 ? 3 : 2} title="Adjust Strength" hidden={!value}>
          {value && (
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">{value.styleName}</span>
                <span className="font-medium">{Math.round(value.strength * 100)}%</span>
              </div>
              <Slider value={[value.strength * 100]}
                onValueChange={(val) => onChange({ ...value, strength: (Array.isArray(val) ? val[0] : val) / 100 })}
                min={10} max={100} step={5} />
            </div>
          )}
        </WidgetStep>

      {/* Preview of what gets sent */}
      {value && (value.selectedReferences?.length ?? 0) > 0 && (
        <div className="rounded-lg border bg-muted/20 p-2.5">
          <p className="text-[10px] font-medium text-muted-foreground mb-1">Sent to Model</p>
          <p className="text-[11px] font-mono text-foreground/80 leading-relaxed">
            &ldquo;{value.styleName} style, evoking {value.selectedReferences.join(", ")}.&rdquo;
          </p>
        </div>
      )}
    </WidgetWizard>
  );
}
