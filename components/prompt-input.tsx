"use client";

import { useRef, useCallback, useMemo, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Loader2 } from "lucide-react";
import { DetectedToken, TokenCategory, WidgetState } from "@/types/tokens";
import { ColorPicker } from "@/components/widgets/color-picker";
import { StyleGallery } from "@/components/widgets/style-gallery";
import { CameraControls } from "@/components/widgets/camera-controls";
import { SpatialCanvas } from "@/components/widgets/spatial-canvas";
import { cn } from "@/lib/utils";

// Extract key subjects/objects from prompt for auto-populating spatial canvas
function extractSubjects(prompt: string): string[] {
  // Split on commas first to respect clause boundaries
  const clauses = prompt.split(/[,;]/);
  const subjects: string[] = [];

  const stopWords = new Set([
    "a", "an", "the", "is", "are", "was", "were", "in", "on", "at", "to",
    "and", "or", "with", "by", "for", "of", "from", "towards", "toward",
    "into", "through", "during", "between", "above", "below", "under",
  ]);
  const actionWords = new Set([
    "walking", "running", "sitting", "standing", "looking", "wearing",
    "holding", "flying", "swimming", "parked", "placed", "resting",
  ]);
  // Spatial/positional words that aren't real objects
  const spatialWords = new Set([
    "left", "right", "center", "middle", "top", "bottom", "side",
    "foreground", "background", "front", "back", "corner", "edge",
    "distance", "horizon", "far", "near", "close",
  ]);
  // Style/lighting/camera terms that aren't objects
  const metaWords = new Set([
    "style", "lighting", "light", "hour", "view", "shot", "angle",
    "perspective", "level", "mode", "quality", "resolution", "render",
    "tone", "mood", "atmosphere", "cinematic", "dramatic", "golden",
    "natural", "ambient", "soft", "harsh", "warm", "cool",
  ]);

  for (const clause of clauses) {
    const words = clause.trim().split(/\s+/);
    for (let i = 0; i < words.length; i++) {
      const w = words[i].toLowerCase().replace(/[.:;!?]/g, "");
      if (!["a", "an", "the"].includes(w) || i + 1 >= words.length) continue;

      let phrase = "";
      for (let j = i + 1; j < Math.min(i + 4, words.length); j++) {
        const next = words[j].replace(/[,.:;!?]/g, "").toLowerCase();
        if (stopWords.has(next) || actionWords.has(next)) break;
        phrase += (phrase ? " " : "") + words[j].replace(/[,.:;!?]/g, "");
      }
      if (!phrase || phrase.length <= 2) continue;

      // Skip if the phrase is purely spatial/meta terms
      const phraseWords = phrase.toLowerCase().split(/\s+/);
      const isAllSpatialOrMeta = phraseWords.every(
        (pw) => spatialWords.has(pw) || metaWords.has(pw)
      );
      if (isAllSpatialOrMeta) continue;

      subjects.push(phrase);
    }
  }
  return [...new Set(subjects)].slice(0, 4);
}

const CATEGORY_COLORS: Record<TokenCategory, { bg: string; border: string; text: string }> = {
  spatial_position: { bg: "bg-blue-50", border: "border-blue-300", text: "text-blue-700" },
  spatial_size: { bg: "bg-blue-50", border: "border-blue-300", text: "text-blue-700" },
  spatial_depth: { bg: "bg-indigo-50", border: "border-indigo-300", text: "text-indigo-700" },
  color: { bg: "bg-rose-50", border: "border-rose-300", text: "text-rose-700" },
  camera_angle: { bg: "bg-purple-50", border: "border-purple-300", text: "text-purple-700" },
  style: { bg: "bg-amber-50", border: "border-amber-300", text: "text-amber-700" },
};

const CATEGORY_LABELS: Record<TokenCategory, string> = {
  spatial_position: "Spatial Position",
  spatial_size: "Object Size",
  spatial_depth: "Depth & Layers",
  color: "Color",
  camera_angle: "Camera Angle",
  style: "Art Style",
};

interface PromptInputProps {
  prompt: string;
  onPromptChange: (prompt: string) => void;
  detectedTokens: DetectedToken[];
  isDetecting: boolean;
  isGenerating: boolean;
  onDetect: () => void;
  onGenerate: () => void;
  widgetState: WidgetState;
  onWidgetStateChange: (state: Partial<WidgetState>) => void;
  configuredWidgets: Set<TokenCategory>;
}

function TokenWidget({
  token,
  widgetState,
  onWidgetStateChange,
  configuredWidgets,
  prompt,
}: {
  token: DetectedToken;
  widgetState: WidgetState;
  onWidgetStateChange: (state: Partial<WidgetState>) => void;
  configuredWidgets: Set<TokenCategory>;
  prompt: string;
}) {
  const colors = CATEGORY_COLORS[token.category];
  const isConfigured = configuredWidgets.has(token.category);

  return (
    <Popover>
      <PopoverTrigger>
        <span
          className={cn(
            "relative mx-0.5 inline-flex cursor-pointer items-center gap-1 rounded-md border px-2 py-0.5 text-sm font-medium transition-all hover:scale-[1.03] hover:shadow-sm",
            colors.bg, colors.border, colors.text,
          )}
          title={token.underspecification}
        >
          {token.text}
          <span className={cn(
            "inline-flex h-3.5 w-3.5 items-center justify-center rounded-full text-[9px] font-bold",
            isConfigured ? "bg-green-500 text-white" : "bg-orange-400 text-white"
          )}>
            {isConfigured ? "✓" : "!"}
          </span>
        </span>
      </PopoverTrigger>
      <PopoverContent className="w-96 max-h-[70vh] overflow-y-auto" align="start" sideOffset={8}>
        <div className="mb-3">
          <h4 className="text-sm font-semibold">{CATEGORY_LABELS[token.category]}</h4>
          <p className="text-xs text-muted-foreground">{token.underspecification}</p>
        </div>

        {token.category === "color" && (
          <ColorPicker
            targets={[token.text]}
            value={widgetState.colorSelections ?? []}
            onChange={(colors) => onWidgetStateChange({ colorSelections: colors })}
          />
        )}
        {token.category === "style" && (
          <StyleGallery
            value={widgetState.styleSelection ?? null}
            onChange={(style) => onWidgetStateChange({ styleSelection: style })}
            tokenText={token.text}
          />
        )}
        {token.category === "camera_angle" && (
          <CameraControls
            value={widgetState.cameraSettings ?? { elevation: 0, azimuth: 0, focalLength: 50, distance: 1 }}
            onChange={(settings) => onWidgetStateChange({ cameraSettings: settings })}
            tokenText={token.text}
          />
        )}
        {(token.category === "spatial_position" || token.category === "spatial_size" || token.category === "spatial_depth") && (
          <SpatialCanvas
            value={widgetState.spatialRegions ?? []}
            onChange={(regions) => onWidgetStateChange({ spatialRegions: regions })}
            subjects={extractSubjects(prompt)}
          />
        )}
      </PopoverContent>
    </Popover>
  );
}

export function PromptInput({
  prompt,
  onPromptChange,
  detectedTokens,
  isDetecting,
  isGenerating,
  onDetect,
  onGenerate,
  widgetState,
  onWidgetStateChange,
  configuredWidgets,
}: PromptInputProps) {
  const editableRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<NodeJS.Timeout | null>(null);
  const lastPromptRef = useRef(prompt);

  // Live debounced token detection
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!prompt.trim() || prompt.trim().length < 10) return;

    debounceRef.current = setTimeout(() => {
      onDetect();
    }, 800);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prompt]);

  const handleInput = useCallback(() => {
    const el = editableRef.current;
    if (!el) return;
    const text = el.innerText || "";
    lastPromptRef.current = text;
    onPromptChange(text);
  }, [onPromptChange]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        onGenerate();
      }
    },
    [onGenerate]
  );

  // Inline token view — fix indices by finding actual token text in prompt
  const inlineTokenView = useMemo(() => {
    if (!detectedTokens.length || !prompt) return null;

    const fixedTokens = detectedTokens.map((token) => {
      const idx = prompt.indexOf(token.text);
      if (idx >= 0) {
        return { ...token, startIndex: idx, endIndex: idx + token.text.length };
      }
      const lowerIdx = prompt.toLowerCase().indexOf(token.text.toLowerCase());
      if (lowerIdx >= 0) {
        return { ...token, startIndex: lowerIdx, endIndex: lowerIdx + token.text.length };
      }
      return token;
    });

    // Remove overlapping tokens (keep the first one)
    const nonOverlapping = fixedTokens.filter((token, i) => {
      for (let j = 0; j < i; j++) {
        if (token.startIndex < fixedTokens[j].endIndex && token.endIndex > fixedTokens[j].startIndex) {
          return false;
        }
      }
      return true;
    });

    const sorted = [...nonOverlapping].sort((a, b) => a.startIndex - b.startIndex);
    const parts: React.ReactNode[] = [];
    let lastIndex = 0;

    for (const token of sorted) {
      const start = Math.max(token.startIndex, lastIndex);
      if (start > lastIndex) {
        parts.push(
          <span key={`t-${lastIndex}`}>{prompt.slice(lastIndex, start)}</span>
        );
      }
      parts.push(
        <TokenWidget
          key={`w-${start}`}
          token={token}
          widgetState={widgetState}
          onWidgetStateChange={onWidgetStateChange}
          configuredWidgets={configuredWidgets}
          prompt={prompt}
        />
      );
      lastIndex = token.endIndex;
    }
    if (lastIndex < prompt.length) {
      parts.push(<span key={`t-${lastIndex}`}>{prompt.slice(lastIndex)}</span>);
    }

    return parts;
  }, [prompt, detectedTokens, widgetState, onWidgetStateChange, configuredWidgets]);

  return (
    <div className="space-y-0">
      {/* Inline token annotations */}
      {inlineTokenView && (
        <div className="rounded-t-xl border border-b-0 bg-muted/20 px-4 py-3">
          <p className="flex flex-wrap items-center gap-y-2 text-sm leading-relaxed">
            {inlineTokenView}
          </p>
        </div>
      )}

      {/* Input area */}
      <div className={cn(
        "relative border bg-background",
        inlineTokenView ? "rounded-b-xl" : "rounded-xl",
      )}>
        <div
          ref={editableRef}
          contentEditable
          suppressContentEditableWarning
          onInput={handleInput}
          onKeyDown={handleKeyDown}
          data-placeholder="Describe the image you want to create..."
          className={cn(
            "min-h-[50px] px-4 py-3 pr-44 text-base outline-none",
            "empty:before:pointer-events-none empty:before:text-muted-foreground empty:before:content-[attr(data-placeholder)]",
            isGenerating && "pointer-events-none opacity-60",
          )}
        />

        <div className="flex items-center justify-between border-t px-3 py-2">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            {isDetecting && (
              <span className="flex items-center gap-1.5">
                <Loader2 className="h-3 w-3 animate-spin" />
                Analyzing tokens...
              </span>
            )}
            {!isDetecting && detectedTokens.length > 0 && (
              <span>
                {detectedTokens.length} token{detectedTokens.length > 1 ? "s" : ""} detected
              </span>
            )}
          </div>
          <Button
            onClick={onGenerate}
            disabled={isGenerating || isDetecting || !prompt.trim()}
            className="bg-primary px-5"
          >
            {isGenerating && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
            Generate Image
          </Button>
        </div>
      </div>
    </div>
  );
}
