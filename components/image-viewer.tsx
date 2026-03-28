"use client";

import { GenerationResult } from "@/types/tokens";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Separator } from "@/components/ui/separator";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Loader2, Info } from "lucide-react";

interface ImageViewerProps {
  currentImage: GenerationResult | null;
  isGenerating: boolean;
  generationStatus?: string;
  enrichedPrompt?: string;
  debugConditioningImages?: { type: string; dataUrl: string; scale: number }[];
  useTestDepthMap?: boolean;
  onToggleTestDepthMap?: (v: boolean) => void;
}

export function ImageViewer({
  currentImage,
  isGenerating,
  generationStatus,
  enrichedPrompt,
  debugConditioningImages,
  useTestDepthMap,
  onToggleTestDepthMap,
}: ImageViewerProps) {
  const condImages = currentImage?.conditioningImages ?? [];

  return (
    <div className="space-y-3">
      {/* Image */}
      <div className="relative overflow-hidden rounded-xl border bg-muted/10">
        {isGenerating ? (
          <div className="flex aspect-square items-center justify-center">
            <div className="flex flex-col items-center gap-3">
              <Loader2 className="h-7 w-7 animate-spin text-primary" />
              <p className="text-sm text-muted-foreground">{generationStatus || "Generating..."}</p>
            </div>
          </div>
        ) : currentImage ? (
          <div className="relative">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={currentImage.imageUrl} alt="Generated" className="w-full" />

            {/* Pipeline info button */}
            <Popover>
              <PopoverTrigger>
                <span className="absolute bottom-3 right-3 inline-flex items-center gap-1 rounded-full bg-black/70 px-2.5 py-1 text-[11px] text-white cursor-pointer hover:bg-black/90 backdrop-blur-sm">
                  <Info className="h-3 w-3" />
                  {currentImage.pipeline}
                </span>
              </PopoverTrigger>
              <PopoverContent className="w-[500px] max-h-[80vh] overflow-y-auto p-0" align="end" side="top">
                <div className="p-4">
                  <h4 className="text-sm font-semibold">Generation Pipeline</h4>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {currentImage.provider === "fal" ? "fal.ai" : "Gemini"} &middot; {currentImage.pipeline}
                  </p>
                </div>
                <Separator />

                {/* Conditioning images grid */}
                {condImages.length > 0 && (
                  <div className="p-4 space-y-2">
                    <p className="text-xs font-medium">Conditioning Inputs</p>
                    <div className="grid grid-cols-2 gap-2">
                      {condImages.map((ci, i) => (
                        <div key={i} className="rounded-lg border overflow-hidden bg-black">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={ci.url} alt={ci.label} className="w-full aspect-square object-contain" />
                          <p className="bg-muted/80 px-2 py-1 text-[10px] font-medium text-center">{ci.label}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Full details */}
                <div className="border-t p-4">
                  <details>
                    <summary className="text-xs font-medium cursor-pointer flex items-center gap-1 text-muted-foreground hover:text-foreground">
                      <span className="text-[10px]">&#9660;</span>
                      Full prompt &amp; parameters
                    </summary>
                    <pre className="mt-2 whitespace-pre-wrap text-[11px] text-muted-foreground leading-relaxed bg-muted/30 rounded-lg p-3">
{enrichedPrompt}
                    </pre>
                  </details>
                </div>
              </PopoverContent>
            </Popover>
          </div>
        ) : null}
      </div>

      {/* Debug: Raw conditioning images */}
      {!isGenerating && currentImage && (debugConditioningImages?.length || onToggleTestDepthMap) && (
        <details className="rounded-lg border bg-muted/10 p-3">
          <summary className="text-xs font-medium cursor-pointer flex items-center gap-1.5 text-muted-foreground hover:text-foreground">
            <span className="text-[10px]">&#9660;</span>
            Debug: Conditioning ({debugConditioningImages?.length ?? 0} images)
          </summary>
          {onToggleTestDepthMap && (
            <div className="mt-3 flex items-center gap-2">
              <Checkbox
                checked={useTestDepthMap ?? false}
                onCheckedChange={(checked) => onToggleTestDepthMap(checked === true)}
              />
              <Label className="text-xs text-muted-foreground cursor-pointer">
                Use test depth map (high-contrast left-side rectangle)
              </Label>
            </div>
          )}
          {debugConditioningImages && debugConditioningImages.length > 0 && (
            <div className="mt-3 grid grid-cols-2 gap-3">
              {debugConditioningImages.map((img, i) => (
                <div key={i} className="rounded-lg border overflow-hidden bg-black">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={img.dataUrl} alt={`${img.type} conditioning`} className="w-full aspect-square object-contain" />
                  <div className="bg-muted/80 px-2 py-1.5 space-y-0.5">
                    <p className="text-[10px] font-medium">{img.type.toUpperCase()} conditioning</p>
                    <p className="text-[10px] text-muted-foreground">
                      Scale: {img.scale} &middot; Size: {Math.round(img.dataUrl.length / 1024)}KB data URL
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </details>
      )}
    </div>
  );
}
