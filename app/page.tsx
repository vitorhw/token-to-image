"use client";

import { useReducer, useCallback, useRef, useMemo, useState } from "react";
import { PromptInput } from "@/components/prompt-input";
import { ImageViewer } from "@/components/image-viewer";
import { PromptSuggestions } from "@/components/prompt-suggestions";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Info, FlaskConical } from "lucide-react";
import { TAXONOMY } from "@/lib/token-taxonomy";
import Link from "next/link";
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

// Removed — no emojis in UI

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
    if (ws.cameraSettings && (ws.cameraSettings.elevation !== 0 || ws.cameraSettings.azimuth !== 0 || ws.cameraSettings.focalLength !== 50)) {
      configured.add("camera_angle");
    }
    if (ws.styleSelection?.styleName) configured.add("style");
    if (ws.spatialRegions?.length) {
      configured.add("spatial_position");
      configured.add("spatial_size");
      configured.add("spatial_depth");
    }
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

    const condLib = await import("@/lib/conditioning");
    const { buildRegionPromptText } = await import("@/lib/prompt-utils");
    const widgetStateWithImages = { ...state.widgetState };
    const ws = state.widgetState;

    const hasSpatial = !!ws.spatialRegions?.length;
    const hasCamera = !!(ws.cameraSettings && (
      ws.cameraSettings.elevation !== 0 || ws.cameraSettings.azimuth !== 0 || ws.cameraSettings.focalLength !== 50
    ));
    const hasStyle = !!ws.styleSelection?.styleName;
    const hasColors = !!ws.colorSelections?.length;

    // ── Render all conditioning images ──

    // 1. Depth map (same logic as before)
    if (useTestDepthMap) {
      widgetStateWithImages.depthMapDataUrl = condLib.renderTestDepthMap();
    } else if (hasSpatial && hasCamera) {
      widgetStateWithImages.depthMapDataUrl = condLib.renderCombinedDepthMap(ws.cameraSettings!, ws.spatialRegions!);
    } else if (hasCamera) {
      widgetStateWithImages.depthMapDataUrl = condLib.renderCameraDepthMap(ws.cameraSettings!);
    } else if (hasSpatial) {
      widgetStateWithImages.depthMapDataUrl = condLib.renderSpatialDepthMap(ws.spatialRegions!);
    }

    // 2. Canny edge map (if spatial regions exist)
    if (hasSpatial) {
      widgetStateWithImages.cannyMapDataUrl = condLib.renderCannyMap(ws.spatialRegions!);
    }

    // 3. Region masks + per-region prompts (for Regional Prompting)
    if (hasSpatial) {
      const regionMasks = ws.spatialRegions!.map(region => ({
        regionId: region.id,
        maskDataUrl: condLib.renderRegionMask(region),
        prompt: buildRegionPromptText(region, ws.colorSelections),
      }));
      // Add background mask
      regionMasks.push({
        regionId: "background",
        maskDataUrl: condLib.renderBackgroundMask(ws.spatialRegions!),
        prompt: state.prompt, // background gets full scene prompt
      });
      widgetStateWithImages.regionMasks = regionMasks;
    }

    // 4. Style reference image (async fetch, in parallel)
    let styleRefDataUrl: string | null = null;
    if (hasStyle) {
      try {
        const { loadStyleReference } = await import("@/lib/style-references");
        styleRefDataUrl = await loadStyleReference(ws.styleSelection!.styleName);
        if (styleRefDataUrl) {
          widgetStateWithImages.styleReferenceDataUrl = styleRefDataUrl;
        }
      } catch {
        console.log("[client] Style reference not available");
      }
    }

    // ── Build conditioning payload for Modal backend ──
    const conditioningPayload: Record<string, any> = {};
    const hasAnyConditioning = widgetStateWithImages.depthMapDataUrl || hasSpatial || hasStyle;

    if (widgetStateWithImages.depthMapDataUrl) {
      conditioningPayload.depth_map = widgetStateWithImages.depthMapDataUrl;
    }
    if (widgetStateWithImages.cannyMapDataUrl) {
      conditioningPayload.canny_map = widgetStateWithImages.cannyMapDataUrl;
    }
    if (widgetStateWithImages.regionMasks?.length) {
      conditioningPayload.regions = widgetStateWithImages.regionMasks.map(rm => ({
        mask: rm.maskDataUrl,
        prompt: rm.prompt,
      }));
      conditioningPayload.base_ratio = 0.2;
    }
    if (styleRefDataUrl) {
      conditioningPayload.style_reference = styleRefDataUrl;
      conditioningPayload.style_strength = ws.styleSelection?.strength ?? 0.6;
    }
    conditioningPayload.controlnet_scales = { depth: 0.8, canny: 0.4 };

    // ── Debug UI ──
    const debugImages: { type: string; dataUrl: string; scale: number }[] = [];
    if (widgetStateWithImages.depthMapDataUrl) {
      const label = hasSpatial && hasCamera ? "combined (camera+spatial)"
        : hasCamera ? "camera perspective" : "spatial depth";
      debugImages.push({ type: `depth: ${label}`, dataUrl: widgetStateWithImages.depthMapDataUrl, scale: 0.45 });
    }
    if (widgetStateWithImages.cannyMapDataUrl) {
      debugImages.push({ type: "canny edges", dataUrl: widgetStateWithImages.cannyMapDataUrl, scale: 0.3 });
    }
    if (styleRefDataUrl) {
      debugImages.push({ type: "style reference", dataUrl: styleRefDataUrl, scale: ws.styleSelection?.strength ?? 0.6 });
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
          // New: structured conditioning for Modal backend
          ...(hasAnyConditioning ? {
            conditioning: conditioningPayload,
            enable_controlnet: hasSpatial || hasCamera,
            enable_regional: hasSpatial,
            enable_ip_adapter: hasStyle && !!styleRefDataUrl,
          } : {}),
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
  }, [state.prompt, state.widgetState, useTestDepthMap]);

  const currentEnrichedPrompt = state.currentImage
    ? state.enrichedPrompts.get(state.currentImage.timestamp)
    : undefined;

  return (
    <div className="flex h-screen flex-col">
      {/* Header */}
      <header className="flex shrink-0 items-center justify-between border-b px-6 py-3">
        <h1 className="text-lg font-semibold tracking-tight">Tokens to Image</h1>
        <div className="flex items-center gap-2">
        <Link href="/test" className="inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium hover:bg-accent text-muted-foreground">
          <FlaskConical className="h-4 w-4" />
          Test Suite
        </Link>
        <Dialog>
          <DialogTrigger>
            <span className="inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium hover:bg-accent cursor-pointer">
              <Info className="h-4 w-4" />
              Supported Tokens
            </span>
          </DialogTrigger>
          <DialogContent className="max-w-3xl">
            <DialogHeader>
              <DialogTitle>Supported Widgets</DialogTitle>
              <p className="text-sm text-muted-foreground mt-1">
                Each widget detects ambiguous tokens in your prompt and produces a conditioning signal for precise control.
              </p>
            </DialogHeader>
            <ScrollArea className="max-h-[65vh]">
              <div className="space-y-4 pr-4">
                {TAXONOMY.map((entry) => (
                  <div key={entry.category} className="rounded-lg border">
                    <div className="px-4 pt-3 pb-1">
                      <h4 className="text-sm font-semibold">{entry.label}</h4>
                    </div>

                    <p className="px-4 text-xs text-muted-foreground">{entry.underspecification}</p>

                    <div className="mt-2 mx-4 rounded-md bg-muted/40 p-3 space-y-1.5 text-xs">
                      <div className="grid grid-cols-[5rem_1fr] gap-x-2">
                        <span className="font-medium text-muted-foreground">Signal</span>
                        <span>{entry.conditioningSignal}</span>
                      </div>
                      <div className="grid grid-cols-[5rem_1fr] gap-x-2">
                        <span className="font-medium text-muted-foreground">Sent to</span>
                        <span>{entry.conditioningTarget}</span>
                      </div>
                    </div>

                    <div className="pb-3" />
                  </div>
                ))}
              </div>
            </ScrollArea>
          </DialogContent>
        </Dialog>
        </div>
      </header>

      {/* Main area */}
      <div className="flex flex-1 flex-col overflow-hidden">
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
            />
          </div>
        </div>
      </div>
    </div>
  );
}
