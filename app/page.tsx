"use client";

import { useReducer, useCallback, useRef, useMemo, useState } from "react";
import { PromptInput } from "@/components/prompt-input";
import { ImageViewer } from "@/components/image-viewer";
import { CandidateGrid } from "@/components/candidate-grid";
import { PromptSuggestions } from "@/components/prompt-suggestions";
import { MaskPainter } from "@/components/widgets/mask-painter";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Info, Paintbrush, Image as ImageIcon } from "lucide-react";
import { TAXONOMY } from "@/lib/token-taxonomy";
import { cn } from "@/lib/utils";
import {
  AppState,
  ConditioningImage,
  DetectedToken,
  GenerationResult,
  TokenCategory,
  WidgetState,
} from "@/types/tokens";

interface Snapshot {
  prompt: string;
  widgetState: WidgetState;
  detectedTokens: DetectedToken[];
}

type Action =
  | { type: "SET_PROMPT"; prompt: string }
  | { type: "SET_DETECTING"; isDetecting: boolean }
  | { type: "SET_GENERATING"; isGenerating: boolean }
  | { type: "SET_GENERATION_STATUS"; status: string }
  | { type: "SET_TOKENS"; tokens: DetectedToken[] }
  | { type: "UPDATE_WIDGET_STATE"; state: Partial<WidgetState> }
  | { type: "ADD_GENERATION"; result: GenerationResult & { enrichedPrompt?: string }; snapshot: Snapshot }
  | { type: "SELECT_HISTORY_ITEM"; result: GenerationResult }
  | { type: "RESET_WIDGETS" };

interface ExtendedAppState extends AppState {
  generationStatus: string;
  enrichedPrompts: Map<number, string>;
  snapshots: Map<number, Snapshot>;
}

const initialState: ExtendedAppState = {
  prompt: "",
  detectedTokens: [],
  widgetState: {},
  generationHistory: [],
  currentImage: null,
  isDetecting: false,
  isGenerating: false,
  activeWidget: null,
  generationStatus: "",
  enrichedPrompts: new Map(),
  snapshots: new Map(),
};

function reducer(state: ExtendedAppState, action: Action): ExtendedAppState {
  switch (action.type) {
    case "SET_PROMPT":
      return { ...state, prompt: action.prompt };
    case "SET_DETECTING":
      return { ...state, isDetecting: action.isDetecting };
    case "SET_GENERATING":
      return { ...state, isGenerating: action.isGenerating };
    case "SET_GENERATION_STATUS":
      return { ...state, generationStatus: action.status };
    case "SET_TOKENS":
      return { ...state, detectedTokens: action.tokens };
    case "UPDATE_WIDGET_STATE":
      return { ...state, widgetState: { ...state.widgetState, ...action.state } };
    case "ADD_GENERATION": {
      const newPrompts = new Map(state.enrichedPrompts);
      const newSnapshots = new Map(state.snapshots);
      if (action.result.enrichedPrompt) {
        newPrompts.set(action.result.timestamp, action.result.enrichedPrompt);
      }
      newSnapshots.set(action.result.timestamp, action.snapshot);
      return {
        ...state,
        currentImage: action.result,
        generationHistory: [...state.generationHistory, action.result],
        widgetState: { ...state.widgetState, maskRegion: undefined },
        generationStatus: "",
        enrichedPrompts: newPrompts,
        snapshots: newSnapshots,
      };
    }
    case "SELECT_HISTORY_ITEM": {
      const snapshot = state.snapshots.get(action.result.timestamp);
      if (snapshot) {
        return {
          ...state,
          currentImage: action.result,
          prompt: snapshot.prompt,
          widgetState: { ...snapshot.widgetState, maskRegion: undefined },
          detectedTokens: snapshot.detectedTokens,
        };
      }
      return { ...state, currentImage: action.result };
    }
    case "RESET_WIDGETS":
      return { ...state, widgetState: {} };
    default:
      return state;
  }
}

export default function Home() {
  const [state, dispatch] = useReducer(reducer, initialState);
  const [debugConditioningImages, setDebugConditioningImages] = useState<
    { type: string; dataUrl: string; scale: number }[]
  >([]);
  const [useTestDepthMap, setUseTestDepthMap] = useState(false);
  const [showMaskDialog, setShowMaskDialog] = useState(false);
  const [candidateImages, setCandidateImages] = useState<string[] | null>(null);
  const [pendingGeneration, setPendingGeneration] = useState<{
    provider: "gemini" | "fal";
    pipeline: string;
    enrichedPrompt: string;
    conditioningImages: ConditioningImage[];
    snapshot: Snapshot;
  } | null>(null);
  const detectAbortRef = useRef<AbortController | null>(null);

  const configuredWidgets = useMemo(() => {
    const configured = new Set<TokenCategory>();
    const ws = state.widgetState;
    if (ws.colorSelections?.length) configured.add("color");
    if (ws.styleSelection?.styleName) configured.add("style");
    if (ws.poseSelection?.keypoints?.length) configured.add("pose");
    if (ws.spatialRegions?.length) {
      configured.add("spatial_position");
      configured.add("spatial_size");
      configured.add("spatial_depth");
    }
    if (ws.maskRegion) configured.add("masking");
    return configured;
  }, [state.widgetState]);

  // Check if all detected tokens have their widgets configured
  const allWidgetsResolved = useMemo(() => {
    if (state.detectedTokens.length === 0) return true;
    return state.detectedTokens.every(t => configuredWidgets.has(t.category));
  }, [state.detectedTokens, configuredWidgets]);

  const handleDetect = useCallback(async () => {
    if (!state.prompt.trim()) return;
    if (detectAbortRef.current) detectAbortRef.current.abort();
    const controller = new AbortController();
    detectAbortRef.current = controller;
    dispatch({ type: "SET_DETECTING", isDetecting: true });

    try {
      const res = await fetch("/api/detect-tokens", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: state.prompt }),
        signal: controller.signal,
      });
      const data = await res.json();
      dispatch({ type: "SET_TOKENS", tokens: data.tokens ?? [] });
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return;
    } finally {
      dispatch({ type: "SET_DETECTING", isDetecting: false });
    }
  }, [state.prompt]);

  const handleGenerate = useCallback(async () => {
    if (!state.prompt.trim()) return;
    dispatch({ type: "SET_GENERATING", isGenerating: true });
    dispatch({ type: "SET_GENERATION_STATUS", status: "Rendering conditioning images..." });

    const conditioning = await import("@/lib/conditioning");
    const widgetStateWithImages = { ...state.widgetState };

    if (useTestDepthMap) {
      widgetStateWithImages.depthMapDataUrl = conditioning.renderTestDepthMap();
    } else if (state.widgetState.depthMapDataUrl) {
      // Use the Gemini-generated depth map if available
      widgetStateWithImages.depthMapDataUrl = state.widgetState.depthMapDataUrl;
    } else if (state.widgetState.spatialRegions?.length) {
      // Fallback: render client-side depth map from rectangles
      widgetStateWithImages.depthMapDataUrl = conditioning.renderDepthMap(state.widgetState.spatialRegions);
    }
    if (state.widgetState.poseSelection?.keypoints.length) {
      widgetStateWithImages.poseImageDataUrl = conditioning.renderPoseSkeleton(
        state.widgetState.poseSelection.keypoints,
        {
          spatialRegions: state.widgetState.spatialRegions,
          detectedTokens: state.detectedTokens,
        }
      );
    }

    const debugImages: { type: string; dataUrl: string; scale: number }[] = [];
    if (widgetStateWithImages.depthMapDataUrl) {
      debugImages.push({ type: "depth", dataUrl: widgetStateWithImages.depthMapDataUrl, scale: 0.55 });
    }
    if (widgetStateWithImages.poseImageDataUrl) {
      debugImages.push({ type: "pose", dataUrl: widgetStateWithImages.poseImageDataUrl, scale: 0.6 });
    }
    setDebugConditioningImages(debugImages);

    dispatch({ type: "SET_GENERATION_STATUS", status: "Sending to pipeline..." });

    const startTime = Date.now();
    const statusInterval = setInterval(() => {
      const elapsed = Math.floor((Date.now() - startTime) / 1000);
      if (elapsed < 10) dispatch({ type: "SET_GENERATION_STATUS", status: `Generating image... (${elapsed}s)` });
      else if (elapsed < 25) dispatch({ type: "SET_GENERATION_STATUS", status: `Still generating... (${elapsed}s)` });
      else dispatch({ type: "SET_GENERATION_STATUS", status: `Taking longer than usual... (${elapsed}s)` });
    }, 1000);

    // Capture snapshot BEFORE the generation call
    const snapshot: Snapshot = {
      prompt: state.prompt,
      widgetState: { ...state.widgetState },
      detectedTokens: [...state.detectedTokens],
    };

    try {
      const res = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: state.prompt,
          widgetState: widgetStateWithImages,
          previousImageUrl: state.currentImage?.imageUrl,
        }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      const imageUrls: string[] = data.imageUrls;
      if (imageUrls.length === 1) {
        // Single result (inpainting) — skip selection, add directly
        dispatch({
          type: "ADD_GENERATION",
          result: {
            imageUrl: imageUrls[0],
            provider: data.provider,
            pipeline: data.pipeline,
            timestamp: Date.now(),
            enrichedPrompt: data.enrichedPrompt,
            conditioningImages: data.conditioningImages,
          },
          snapshot,
        });
      } else {
        // Multiple candidates — enter selection mode
        setCandidateImages(imageUrls);
        setPendingGeneration({
          provider: data.provider,
          pipeline: data.pipeline,
          enrichedPrompt: data.enrichedPrompt,
          conditioningImages: data.conditioningImages,
          snapshot,
        });
      }
    } catch (err) {
      console.error("Generation failed:", err);
      dispatch({ type: "SET_GENERATION_STATUS", status: `Error: ${err instanceof Error ? err.message : "Failed"}` });
    } finally {
      clearInterval(statusInterval);
      dispatch({ type: "SET_GENERATING", isGenerating: false });
    }
  }, [state.prompt, state.widgetState, state.detectedTokens, state.currentImage, useTestDepthMap]);

  const handleSelectCandidate = useCallback((index: number) => {
    if (!candidateImages || !pendingGeneration) return;
    const result: GenerationResult = {
      imageUrl: candidateImages[index],
      provider: pendingGeneration.provider,
      pipeline: pendingGeneration.pipeline,
      timestamp: Date.now(),
      enrichedPrompt: pendingGeneration.enrichedPrompt,
      conditioningImages: pendingGeneration.conditioningImages,
    };
    dispatch({ type: "ADD_GENERATION", result, snapshot: pendingGeneration.snapshot });
    setCandidateImages(null);
    setPendingGeneration(null);
  }, [candidateImages, pendingGeneration]);

  const currentEnrichedPrompt = state.currentImage
    ? state.enrichedPrompts.get(state.currentImage.timestamp)
    : undefined;

  return (
    <div className="flex h-screen flex-col">
      {/* Header */}
      <header className="flex shrink-0 items-center justify-between border-b px-6 py-3">
        <h1 className="text-lg font-semibold tracking-tight">Tokens to Image</h1>
        <Dialog>
          <DialogTrigger>
            <span className="inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium hover:bg-accent cursor-pointer">
              <Info className="h-4 w-4" />
              Supported Tokens
            </span>
          </DialogTrigger>
          <DialogContent className="max-w-3xl">
            <DialogHeader>
              <DialogTitle>Supported Tokens</DialogTitle>
            </DialogHeader>
            <ScrollArea className="max-h-[75vh]">
              <div className="pr-4">
                {/* Column headers */}
                <div className="mb-2 grid grid-cols-[100px_1fr_160px] gap-6 px-3 text-xs font-semibold tracking-wide text-muted-foreground">
                  <span>Token</span>
                  <span>Conditioning Signal</span>
                  <span>Pipeline</span>
                </div>

                {/* Rows */}
                <div className="space-y-2">
                  {TAXONOMY.map((entry) => (
                    <div key={entry.category} className="grid grid-cols-[100px_1fr_160px] gap-6 items-start rounded-lg border px-4 py-3">
                      <span className="text-sm font-semibold">{entry.label}</span>

                      <div>
                        {entry.conditioning ? (
                          <div className="space-y-0.5">
                            <Badge variant="secondary" className="text-[10px]">{entry.conditioning}</Badge>
                            <p className="text-[11px] text-muted-foreground leading-relaxed">{entry.conditioningDetail}</p>
                          </div>
                        ) : (
                          <span className="text-xs text-muted-foreground/50">None (text only)</span>
                        )}
                      </div>

                      <Badge variant="outline" className="text-[10px] w-fit">{entry.pipeline}</Badge>
                    </div>
                  ))}
                </div>

                {/* Sources */}
                <p className="mt-3 text-[10px] text-muted-foreground">
                  {TAXONOMY.map(e => e.source).join(" | ")}
                </p>
              </div>
            </ScrollArea>
          </DialogContent>
        </Dialog>
      </header>

      {/* Two-panel layout */}
      <div className="flex flex-1 overflow-hidden">
        {/* LEFT PANEL — Prompt, tokens, widgets, generate */}
        <div className="flex w-[420px] shrink-0 flex-col border-r">
          <ScrollArea className="flex-1">
            <div className="px-6 py-3 space-y-4">
              {/* Prompt input */}
              <PromptInput
                prompt={state.prompt}
                onPromptChange={(p) => dispatch({ type: "SET_PROMPT", prompt: p })}
                detectedTokens={state.detectedTokens}
                isDetecting={state.isDetecting}
                isGenerating={state.isGenerating}
                onDetect={handleDetect}
                onGenerate={handleGenerate}
                widgetState={state.widgetState}
                onWidgetStateChange={(s) => dispatch({ type: "UPDATE_WIDGET_STATE", state: s })}
                configuredWidgets={configuredWidgets}
                currentImageUrl={state.currentImage?.imageUrl}
                allWidgetsResolved={allWidgetsResolved}
              />

              {/* Prompt suggestions — below input so layout doesn't shift */}
              {!state.prompt.trim() && !state.currentImage && (
                <PromptSuggestions
                  onSelect={(p) => {
                    dispatch({ type: "SET_PROMPT", prompt: p });
                    const el = document.querySelector("[contenteditable]");
                    if (el) el.textContent = p;
                  }}
                />
              )}

              {/* Mask / Inpaint button — always visible when there's an image */}
              {state.currentImage && !state.isGenerating && (
                <>
                  <Separator />
                  <Dialog open={showMaskDialog} onOpenChange={setShowMaskDialog}>
                    <DialogTrigger>
                      <span className="inline-flex w-full items-center justify-center gap-2 rounded-md border border-input bg-background px-4 py-2 text-sm font-medium hover:bg-accent hover:text-accent-foreground cursor-pointer">
                        <Paintbrush className="h-4 w-4" />
                        Edit Region (Inpainting)
                      </span>
                    </DialogTrigger>
                    <DialogContent className="max-w-lg">
                      <DialogHeader>
                        <DialogTitle>Paint Mask for Inpainting</DialogTitle>
                      </DialogHeader>
                      <MaskPainter
                        imageUrl={state.currentImage.imageUrl}
                        value={state.widgetState.maskRegion ?? null}
                        onChange={(mask) => {
                          dispatch({ type: "UPDATE_WIDGET_STATE", state: { maskRegion: mask } });
                        }}
                      />
                      <div className="flex justify-end gap-2 pt-2">
                        <Button variant="outline" onClick={() => setShowMaskDialog(false)}>
                          Cancel
                        </Button>
                        <Button
                          onClick={() => {
                            setShowMaskDialog(false);
                            handleGenerate();
                          }}
                          disabled={!state.widgetState.maskRegion?.dataUrl}
                        >
                          Apply &amp; Regenerate
                        </Button>
                      </div>
                    </DialogContent>
                  </Dialog>
                </>
              )}
            </div>
          </ScrollArea>
        </div>

        {/* RIGHT PANEL — Iterations + Image */}
        <div className="flex flex-1 flex-col overflow-hidden">
          {/* Iteration thumbnails */}
          <div className="shrink-0 border-b bg-muted/30 px-6 py-3">
            {state.generationHistory.length > 0 ? (
              <>
                <ScrollArea className="w-full">
                  <div className="flex gap-2 pb-1">
                    {state.generationHistory.map((item, i) => (
                      <button
                        key={item.timestamp}
                        onClick={() => dispatch({ type: "SELECT_HISTORY_ITEM", result: item })}
                        className={cn(
                          "relative h-16 w-16 shrink-0 overflow-hidden rounded-lg border-2 transition-all hover:scale-105",
                          state.currentImage?.timestamp === item.timestamp
                            ? "border-primary ring-2 ring-primary/20"
                            : "border-transparent opacity-60 hover:opacity-100"
                        )}
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={item.imageUrl} alt={`v${i + 1}`} className="h-full w-full object-cover" />
                        <span className="absolute bottom-0 left-0 rounded-tr bg-black/60 px-1 text-[9px] text-white">
                          v{i + 1}
                        </span>
                      </button>
                    ))}
                  </div>
                  <ScrollBar orientation="horizontal" />
                </ScrollArea>
              </>
            ) : (
              <div>
                <div className="flex gap-2">
                  {[0, 1, 2].map(i => (
                    <div key={i} className="h-16 w-16 shrink-0 rounded-lg border-2 border-dashed border-muted-foreground/15 bg-muted/30" />
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Image display */}
          <div className="flex-1 overflow-y-auto">
            <div className="max-w-3xl p-6">
              {state.isGenerating ? (
                <ImageViewer
                  currentImage={state.currentImage}
                  isGenerating={true}
                  generationStatus={state.generationStatus}
                  enrichedPrompt={currentEnrichedPrompt}
                  debugConditioningImages={debugConditioningImages}
                  useTestDepthMap={useTestDepthMap}
                  onToggleTestDepthMap={setUseTestDepthMap}
                />
              ) : candidateImages ? (
                <CandidateGrid
                  candidates={candidateImages}
                  onSelect={handleSelectCandidate}
                  pipeline={pendingGeneration?.pipeline ?? ""}
                />
              ) : state.currentImage ? (
                <ImageViewer
                  currentImage={state.currentImage}
                  isGenerating={false}
                  generationStatus={state.generationStatus}
                  enrichedPrompt={currentEnrichedPrompt}
                  debugConditioningImages={debugConditioningImages}
                  useTestDepthMap={useTestDepthMap}
                  onToggleTestDepthMap={setUseTestDepthMap}
                />
              ) : (
                /* Skeleton for image */
                <div className="aspect-square max-w-xl rounded-xl border-2 border-dashed border-muted-foreground/15 bg-muted/10 flex items-center justify-center">
                  <ImageIcon className="h-10 w-10 opacity-20 text-muted-foreground" strokeWidth={1.5} />
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
