"use client";

import { useReducer, useCallback, useRef, useMemo, useState } from "react";
import { PromptInput } from "@/components/prompt-input";
import { ImageViewer } from "@/components/image-viewer";
import { PromptSuggestions } from "@/components/prompt-suggestions";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Info } from "lucide-react";
import { TAXONOMY } from "@/lib/token-taxonomy";
import {
  AppState,
  DetectedToken,
  GenerationResult,
  TokenCategory,
  WidgetState,
} from "@/types/tokens";

type Action =
  | { type: "SET_PROMPT"; prompt: string }
  | { type: "SET_DETECTING"; isDetecting: boolean }
  | { type: "SET_GENERATING"; isGenerating: boolean }
  | { type: "SET_GENERATION_STATUS"; status: string }
  | { type: "SET_TOKENS"; tokens: DetectedToken[] }
  | { type: "UPDATE_WIDGET_STATE"; state: Partial<WidgetState> }
  | { type: "ADD_GENERATION"; result: GenerationResult & { enrichedPrompt?: string } }
  | { type: "SELECT_HISTORY_ITEM"; result: GenerationResult }
  | { type: "RESET_WIDGETS" };

interface ExtendedAppState extends AppState {
  generationStatus: string;
  enrichedPrompts: Map<number, string>;
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
      if (action.result.enrichedPrompt) {
        newPrompts.set(action.result.timestamp, action.result.enrichedPrompt);
      }
      return {
        ...state,
        currentImage: action.result,
        generationHistory: [...state.generationHistory, action.result],
        widgetState: { ...state.widgetState, maskRegion: undefined },
        generationStatus: "",
        enrichedPrompts: newPrompts,
      };
    }
    case "SELECT_HISTORY_ITEM":
      return { ...state, currentImage: action.result };
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
  const detectAbortRef = useRef<AbortController | null>(null);

  const configuredWidgets = useMemo(() => {
    const configured = new Set<TokenCategory>();
    const ws = state.widgetState;
    if (ws.colorSelections?.length) configured.add("color");
    // Camera: only configured if user changed from defaults
    if (ws.cameraSettings && (ws.cameraSettings.elevation !== 0 || ws.cameraSettings.azimuth !== 0 || ws.cameraSettings.focalLength !== 50)) {
      configured.add("camera_angle");
    }
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

    // Render ALL conditioning images from widget state (client-side)
    const conditioning = await import("@/lib/conditioning");
    const widgetStateWithImages = { ...state.widgetState };

    // Spatial regions → depth map (or test depth map for diagnostics)
    if (useTestDepthMap) {
      widgetStateWithImages.depthMapDataUrl = conditioning.renderTestDepthMap();
      console.log("[client] Using TEST depth map");
    } else if (state.widgetState.spatialRegions?.length) {
      widgetStateWithImages.depthMapDataUrl = conditioning.renderDepthMap(state.widgetState.spatialRegions);
      console.log("[client] Rendered spatial depth map");
    }
    // Pose keypoints → skeleton image
    if (state.widgetState.poseSelection?.keypoints.length) {
      widgetStateWithImages.poseImageDataUrl = conditioning.renderPoseSkeleton(state.widgetState.poseSelection.keypoints);
      console.log("[client] Rendered pose skeleton");
    }
    // Capture raw conditioning images for debug UI
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
      dispatch({ type: "ADD_GENERATION", result: { ...data, enrichedPrompt: data.enrichedPrompt } });
    } catch (err) {
      console.error("Generation failed:", err);
      dispatch({ type: "SET_GENERATION_STATUS", status: `Error: ${err instanceof Error ? err.message : "Failed"}` });
    } finally {
      clearInterval(statusInterval);
      dispatch({ type: "SET_GENERATING", isGenerating: false });
    }
  }, [state.prompt, state.widgetState, state.currentImage, useTestDepthMap]);

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
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Token Taxonomy</DialogTitle>
            </DialogHeader>
            <ScrollArea className="max-h-[60vh]">
              <div className="space-y-4 pr-4">
                {TAXONOMY.map((entry) => (
                  <div key={entry.category} className="rounded-lg border p-3">
                    <div className="flex items-center gap-2">
                      <h4 className="text-sm font-semibold">{entry.label}</h4>
                      <Badge variant="outline" className="text-xs">{entry.subcategory}</Badge>
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">{entry.underspecification}</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      <span className="font-medium">Widget:</span> {entry.widgetDescription}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      <span className="font-medium">Source:</span> {entry.literatureSource}
                    </p>
                    <div className="mt-2 flex flex-wrap gap-1">
                      {entry.patterns.slice(0, 12).map((p) => (
                        <Badge key={p} variant="secondary" className="text-[10px]">{p}</Badge>
                      ))}
                      {entry.patterns.length > 12 && (
                        <Badge variant="secondary" className="text-[10px]">+{entry.patterns.length - 12} more</Badge>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </ScrollArea>
          </DialogContent>
        </Dialog>
      </header>

      {/* Chat-style main area */}
      <div className="flex flex-1 flex-col overflow-hidden">
        {/* Scrollable content */}
        <div className="flex-1 overflow-y-auto">
          <div className="mx-auto max-w-3xl px-4 py-6">
            {state.currentImage || state.isGenerating ? (
              <ImageViewer
                currentImage={state.currentImage}
                history={state.generationHistory}
                onSelectHistoryItem={(item) =>
                  dispatch({ type: "SELECT_HISTORY_ITEM", result: item })
                }
                isGenerating={state.isGenerating}
                generationStatus={state.generationStatus}
                enrichedPrompt={currentEnrichedPrompt}
                debugConditioningImages={debugConditioningImages}
                useTestDepthMap={useTestDepthMap}
                onToggleTestDepthMap={setUseTestDepthMap}
              />
            ) : !state.prompt.trim() ? (
              <PromptSuggestions
                onSelect={(p) => {
                  dispatch({ type: "SET_PROMPT", prompt: p });
                  // Set the contentEditable text
                  const el = document.querySelector("[contenteditable]");
                  if (el) el.textContent = p;
                }}
              />
            ) : null}
          </div>
        </div>

        {/* Prompt input fixed at bottom */}
        <div className="shrink-0 border-t bg-background">
          <div className="mx-auto max-w-3xl px-4 py-3">
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
            />
          </div>
        </div>
      </div>
    </div>
  );
}
