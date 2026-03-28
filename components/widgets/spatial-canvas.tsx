"use client";

import { useState, useCallback, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";
import { Label } from "@/components/ui/label";
import { Plus, Trash2, GripVertical, Loader2, Wand2, RefreshCw } from "lucide-react";
import { SpatialRegion } from "@/types/tokens";
import { cn } from "@/lib/utils";

interface SpatialCanvasProps {
  value: SpatialRegion[];
  onChange: (regions: SpatialRegion[]) => void;
  subjects?: string[];
  prompt?: string;
  onDepthMapGenerated?: (dataUrl: string) => void;
  generatedMapUrl?: string;
  onDone?: () => void;
  poseKeypoints?: { name: string; x: number; y: number }[];
}

const DEPTH_COLORS = [
  "rgba(59, 130, 246, 0.15)", "rgba(59, 130, 246, 0.25)",
  "rgba(59, 130, 246, 0.35)", "rgba(59, 130, 246, 0.45)",
  "rgba(59, 130, 246, 0.6)",
];

function depthToColor(depth: number): string {
  const idx = Math.min(Math.floor(depth * DEPTH_COLORS.length), DEPTH_COLORS.length - 1);
  return DEPTH_COLORS[idx];
}

export function SpatialCanvas({ value, onChange, subjects, prompt, onDepthMapGenerated, generatedMapUrl, onDone, poseKeypoints }: SpatialCanvasProps) {
  const [generating, setGenerating] = useState(false);
  const [mapError, setMapError] = useState<string | null>(null);

  const handleGenerateMap = useCallback(async () => {
    if (value.length === 0) return;
    setGenerating(true);
    setMapError(null);
    try {
      // Render client-side reference depth map to send as guide
      const conditioning = await import("@/lib/conditioning");
      const referenceMapDataUrl = conditioning.renderDepthMap(value);

      const res = await fetch("/api/generate-spatial-map", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          regions: value,
          prompt: prompt || "",
          referenceMapDataUrl,
          poseKeypoints: poseKeypoints?.length ? poseKeypoints : undefined,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || "Failed to generate depth map");
      }
      const { mapDataUrl } = await res.json();
      onDepthMapGenerated?.(mapDataUrl);
    } catch (err) {
      setMapError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setGenerating(false);
    }
  }, [value, prompt, onDepthMapGenerated]);

  const initialized = useRef(false);
  if (!initialized.current && subjects?.length && value.length === 0) {
    initialized.current = true;
    const autoRegions: SpatialRegion[] = subjects.map((s, i) => ({
      id: `auto-${i}`, label: s,
      x: 0.1 + (i * 0.3) % 0.7, y: 0.15,
      width: 0.25, height: 0.6, depth: 0.7 - i * 0.2, rotation: 0,
    }));
    setTimeout(() => onChange(autoRegions), 0);
  }

  const containerRef = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState<{ id: string; offsetX: number; offsetY: number } | null>(null);
  const [selected, setSelected] = useState<string | null>(null);

  const addRegion = useCallback(() => {
    const newRegion: SpatialRegion = {
      id: `region-${Date.now()}`, label: `Object ${value.length + 1}`,
      x: 0.2 + Math.random() * 0.3, y: 0.2 + Math.random() * 0.3,
      width: 0.25, height: 0.25, depth: 0.5, rotation: 0,
    };
    onChange([...value, newRegion]);
    setSelected(newRegion.id);
  }, [value, onChange]);

  const removeRegion = useCallback((id: string) => {
    onChange(value.filter((r) => r.id !== id));
    if (selected === id) setSelected(null);
  }, [value, onChange, selected]);

  const updateRegion = useCallback((id: string, updates: Partial<SpatialRegion>) => {
    onChange(value.map((r) => (r.id === id ? { ...r, ...updates } : r)));
  }, [value, onChange]);

  const handleMouseDown = useCallback((e: React.MouseEvent, id: string) => {
    e.preventDefault();
    const container = containerRef.current;
    if (!container) return;
    const rect = container.getBoundingClientRect();
    const region = value.find((r) => r.id === id);
    if (!region) return;
    const mouseX = (e.clientX - rect.left) / rect.width;
    const mouseY = (e.clientY - rect.top) / rect.height;
    setDragging({ id, offsetX: mouseX - region.x, offsetY: mouseY - region.y });
    setSelected(id);
  }, [value]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!dragging || !containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const x = Math.max(0, Math.min(0.75, (e.clientX - rect.left) / rect.width - dragging.offsetX));
    const y = Math.max(0, Math.min(0.75, (e.clientY - rect.top) / rect.height - dragging.offsetY));
    updateRegion(dragging.id, { x, y });
  }, [dragging, updateRegion]);

  const selectedRegion = value.find((r) => r.id === selected);

  return (
    <div className="space-y-3">
      {/* Canvas */}
      <div
        ref={containerRef}
        className="relative h-52 w-full rounded-lg border-2 border-dashed border-muted-foreground/20 bg-muted/10"
        onMouseMove={handleMouseMove}
        onMouseUp={() => setDragging(null)}
        onMouseLeave={() => setDragging(null)}
      >
        <div className="absolute inset-0 grid grid-cols-3 grid-rows-3">
          {Array.from({ length: 9 }).map((_, i) => (
            <div key={i} className="border border-muted-foreground/5" />
          ))}
        </div>
        {value.map((region) => (
          <div
            key={region.id}
            className={cn(
              "absolute flex cursor-grab items-start justify-between rounded border-2 p-1 transition-shadow active:cursor-grabbing",
              selected === region.id ? "border-primary shadow-md" : "border-blue-400/50 hover:border-blue-400"
            )}
            style={{
              left: `${region.x * 100}%`, top: `${region.y * 100}%`,
              width: `${region.width * 100}%`, height: `${region.height * 100}%`,
              backgroundColor: depthToColor(region.depth),
              transform: `rotate(${region.rotation ?? 0}deg)`,
              transformOrigin: "center center",
            }}
            onMouseDown={(e) => handleMouseDown(e, region.id)}
          >
            <span className="rounded bg-black/50 px-1 text-[10px] font-medium text-white">{region.label}</span>
            <GripVertical className="h-3 w-3 text-white/60" />
          </div>
        ))}
        {value.length === 0 && (
          <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
            Click &quot;Add Object&quot; to start
          </div>
        )}
      </div>
      <div className="flex items-center gap-2">
        <Button size="sm" variant="outline" onClick={addRegion}>
          <Plus className="mr-1 h-3 w-3" /> Add Object
        </Button>
        {selected && (
          <Button size="sm" variant="ghost" className="text-destructive" onClick={() => removeRegion(selected)}>
            <Trash2 className="mr-1 h-3 w-3" /> Remove
          </Button>
        )}
      </div>

      {/* Selected region controls */}
      {selectedRegion && (
        <div className="space-y-3 rounded-lg border p-3">
          <div className="space-y-1">
            <Label className="text-xs">Label</Label>
            <Input
              value={selectedRegion.label}
              onChange={(e) => updateRegion(selectedRegion.id, { label: e.target.value })}
              className="h-8 text-sm"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">Width: {Math.round(selectedRegion.width * 100)}%</Label>
              <Slider value={[selectedRegion.width * 100]}
                onValueChange={(val) => updateRegion(selectedRegion.id, { width: (Array.isArray(val) ? val[0] : val) / 100 })}
                min={5} max={100} step={5} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Height: {Math.round(selectedRegion.height * 100)}%</Label>
              <Slider value={[selectedRegion.height * 100]}
                onValueChange={(val) => updateRegion(selectedRegion.id, { height: (Array.isArray(val) ? val[0] : val) / 100 })}
                min={5} max={100} step={5} />
            </div>
          </div>
          <div className="space-y-1">
            <div className="flex justify-between">
              <Label className="text-xs">Depth</Label>
              <span className="text-[10px] text-muted-foreground">
                {selectedRegion.depth < 0.3 ? "Background" : selectedRegion.depth > 0.7 ? "Foreground" : "Middle"}
              </span>
            </div>
            <Slider value={[selectedRegion.depth * 100]}
              onValueChange={(val) => updateRegion(selectedRegion.id, { depth: (Array.isArray(val) ? val[0] : val) / 100 })}
              min={0} max={100} step={10} />
            <div className="flex justify-between text-[10px] text-muted-foreground">
              <span>Far</span><span>Near</span>
            </div>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Rotation: {selectedRegion.rotation ?? 0}°</Label>
            <Slider value={[selectedRegion.rotation ?? 0]}
              onValueChange={(val) => updateRegion(selectedRegion.id, { rotation: Array.isArray(val) ? val[0] : val })}
              min={0} max={360} step={5} />
          </div>
        </div>
      )}

      {/* Generated depth map preview */}
      {generatedMapUrl && (
        <div className="space-y-1">
          <div className="overflow-hidden rounded-lg border-2 border-primary/30">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={generatedMapUrl} alt="Generated depth map" className="h-auto w-full" />
          </div>
          <Button size="sm" variant="ghost" className="w-full text-xs" onClick={handleGenerateMap} disabled={generating}>
            {generating ? (
              <><Loader2 className="mr-1 h-3 w-3 animate-spin" />Regenerating...</>
            ) : (
              <><RefreshCw className="mr-1 h-3 w-3" />Regenerate Depth Map</>
            )}
          </Button>
        </div>
      )}

      {mapError && <p className="text-xs text-destructive">{mapError}</p>}

      {/* Primary CTA: Generate Depth Map → Done */}
      {generatedMapUrl ? (
        <Button className="w-full h-10" onClick={onDone}>
          Done
        </Button>
      ) : (
        <Button
          className="w-full h-10"
          onClick={handleGenerateMap}
          disabled={generating || value.length === 0}
        >
          {generating ? (
            <><Loader2 className="mr-1.5 h-4 w-4 animate-spin" />Generating Depth Map...</>
          ) : (
            <><Wand2 className="mr-1.5 h-4 w-4" />Generate Depth Map</>
          )}
        </Button>
      )}
    </div>
  );
}
