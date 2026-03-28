"use client";

import { useRef, useCallback, useMemo, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Loader2 } from "lucide-react";
import { DetectedToken, TokenCategory, WidgetState } from "@/types/tokens";
import { ColorPicker } from "@/components/widgets/color-picker";
import { StyleGallery } from "@/components/widgets/style-gallery";
import { MaskPainter } from "@/components/widgets/mask-painter";
import { SpatialCanvas } from "@/components/widgets/spatial-canvas";
import { PoseEditor } from "@/components/widgets/pose-editor";
import { cn } from "@/lib/utils";

function extractSubjects(prompt: string): string[] {
  const words = prompt.split(/\s+/);
  const subjects: string[] = [];
  const skipWords = new Set(["a", "an", "the", "is", "are", "was", "were", "in", "on", "at", "to", "and", "or", "with", "by", "for", "of", "from", "towards", "toward", "into", "through"]);
  const actionWords = new Set(["walking", "running", "sitting", "standing", "looking", "wearing", "holding", "walking", "flying", "swimming"]);

  for (let i = 0; i < words.length; i++) {
    const w = words[i].toLowerCase().replace(/[,.:;!?]/g, "");
    if (["a", "an", "the"].includes(w) && i + 1 < words.length) {
      let phrase = "";
      for (let j = i + 1; j < Math.min(i + 4, words.length); j++) {
        const next = words[j].replace(/[,.:;!?]/g, "").toLowerCase();
        if (skipWords.has(next) || actionWords.has(next)) break;
        phrase += (phrase ? " " : "") + words[j].replace(/[,.:;!?]/g, "");
      }
      if (phrase && phrase.length > 2) subjects.push(phrase);
    }
  }
  return [...new Set(subjects)].slice(0, 4);
}

const CATEGORY_COLORS: Record<TokenCategory, { bg: string; border: string; text: string }> = {
  spatial_position: { bg: "bg-blue-50", border: "border-blue-300", text: "text-blue-700" },
  spatial_size: { bg: "bg-blue-50", border: "border-blue-300", text: "text-blue-700" },
  spatial_depth: { bg: "bg-indigo-50", border: "border-indigo-300", text: "text-indigo-700" },
  color: { bg: "bg-rose-50", border: "border-rose-300", text: "text-rose-700" },
  style: { bg: "bg-amber-50", border: "border-amber-300", text: "text-amber-700" },
  pose: { bg: "bg-green-50", border: "border-green-300", text: "text-green-700" },
  masking: { bg: "bg-red-50", border: "border-red-300", text: "text-red-700" },
};

const CATEGORY_LABELS: Record<TokenCategory, string> = {
  spatial_position: "Spatial Position",
  spatial_size: "Object Size",
  spatial_depth: "Depth & Layers",
  color: "Color",
  style: "Art Style",
  pose: "Pose & Gesture",
  masking: "Selective Edit",
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
  currentImageUrl?: string;
  allWidgetsResolved: boolean;
}

function TokenWidget({
  token,
  widgetState,
  onWidgetStateChange,
  configuredWidgets,
  prompt,
  currentImageUrl,
}: {
  token: DetectedToken;
  widgetState: WidgetState;
  onWidgetStateChange: (state: Partial<WidgetState>) => void;
  configuredWidgets: Set<TokenCategory>;
  prompt: string;
  currentImageUrl?: string;
}) {
  const [open, setOpen] = useState(false);
  const colors = CATEGORY_COLORS[token.category];
  const isConfigured = configuredWidgets.has(token.category);

  return (
    <Popover open={open} onOpenChange={setOpen}>
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
            onDone={() => setOpen(false)}
          />
        )}
        {token.category === "style" && (
          <StyleGallery
            value={widgetState.styleSelection ?? null}
            onChange={(style) => onWidgetStateChange({ styleSelection: style })}
            tokenText={token.text}
            onDone={() => setOpen(false)}
          />
        )}
        {token.category === "masking" && currentImageUrl && (
          <MaskPainter
            imageUrl={currentImageUrl}
            value={widgetState.maskRegion ?? null}
            onChange={(mask) => onWidgetStateChange({ maskRegion: mask })}
          />
        )}
        {(token.category === "spatial_position" || token.category === "spatial_size" || token.category === "spatial_depth") && (
          <SpatialCanvas
            value={widgetState.spatialRegions ?? []}
            onChange={(regions) => onWidgetStateChange({ spatialRegions: regions })}
            subjects={extractSubjects(prompt)}
            prompt={prompt}
            onDepthMapGenerated={(dataUrl) => onWidgetStateChange({ depthMapDataUrl: dataUrl })}
            generatedMapUrl={widgetState.depthMapDataUrl}
            poseKeypoints={widgetState.poseSelection?.keypoints}
            onDone={() => setOpen(false)}
          />
        )}
        {token.category === "pose" && (
          <PoseEditor
            value={widgetState.poseSelection ?? null}
            onChange={(pose) => onWidgetStateChange({ poseSelection: pose })}
            poseDescription={token.text}
            fullPrompt={prompt}
            onDone={() => setOpen(false)}
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
  currentImageUrl,
  allWidgetsResolved,
}: PromptInputProps) {
  const editableRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<NodeJS.Timeout | null>(null);
  const lastPromptRef = useRef(prompt);

  // Sync contentEditable when prompt changes externally
  useEffect(() => {
    const el = editableRef.current;
    if (!el) return;
    if (el.innerText !== prompt && prompt !== lastPromptRef.current) {
      el.innerText = prompt;
      lastPromptRef.current = prompt;
    }
  }, [prompt]);

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
        if (allWidgetsResolved) onGenerate();
      }
    },
    [onGenerate, allWidgetsResolved]
  );

  // Inline token view
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
          currentImageUrl={currentImageUrl}
        />
      );
      lastIndex = token.endIndex;
    }
    if (lastIndex < prompt.length) {
      parts.push(<span key={`t-${lastIndex}`}>{prompt.slice(lastIndex)}</span>);
    }

    return parts;
  }, [prompt, detectedTokens, widgetState, onWidgetStateChange, configuredWidgets, currentImageUrl]);

  const unresolvedCount = detectedTokens.length > 0
    ? detectedTokens.filter(t => !configuredWidgets.has(t.category)).length
    : 0;

  return (
    <div className="space-y-2">
      {/* Input area — just the text box */}
      <div className="rounded-xl border bg-background">
        <div
          ref={editableRef}
          contentEditable
          suppressContentEditableWarning
          onInput={handleInput}
          onKeyDown={handleKeyDown}
          data-placeholder="Describe the image you want to create..."
          className={cn(
            "min-h-[80px] px-4 py-3 text-sm outline-none",
            "empty:before:pointer-events-none empty:before:text-muted-foreground empty:before:content-[attr(data-placeholder)]",
            isGenerating && "pointer-events-none opacity-60",
          )}
        />
      </div>

      {/* Detected tokens card — always visible */}
      {inlineTokenView ? (
        <div className="rounded-xl border bg-muted/20 px-4 py-3">
          <p className="mb-1.5 text-[10px] font-medium tracking-wider text-muted-foreground">
            Detected Tokens
          </p>
          <p className="flex flex-wrap items-center gap-y-2 text-sm leading-relaxed">
            {inlineTokenView}
          </p>
        </div>
      ) : (
        <div className="rounded-xl border border-dashed border-muted-foreground/20 bg-muted/10 px-4 py-3">
          <p className="mb-2 text-[10px] font-medium tracking-wider text-muted-foreground">
            Detected Tokens
          </p>
          {isDetecting ? (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Loader2 className="h-3 w-3 animate-spin" />
              Analyzing your prompt...
            </div>
          ) : (
            <div className="flex gap-2">
              <div className="h-6 w-20 rounded-md bg-muted/50" />
              <div className="h-6 w-16 rounded-md bg-muted/50" />
              <div className="h-6 w-24 rounded-md bg-muted/50" />
            </div>
          )}
        </div>
      )}

      {/* Generate button — right-aligned, content width */}
      <div className="flex justify-end">
        <Button
          onClick={onGenerate}
          disabled={isGenerating || isDetecting || !prompt.trim() || !allWidgetsResolved}
          className="bg-primary px-6 h-10"
        >
          {isGenerating && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
          Generate Image
        </Button>
      </div>
    </div>
  );
}
