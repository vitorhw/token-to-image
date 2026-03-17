"use client";

import { useState, useRef, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Loader2, Wand2, Pencil, RotateCcw } from "lucide-react";
import { PoseSelection, PoseKeypoint } from "@/types/tokens";
import { cn } from "@/lib/utils";

interface PoseEditorProps {
  value: PoseSelection | null;
  onChange: (pose: PoseSelection) => void;
  poseDescription?: string;
  fullPrompt?: string;
}

interface PoseVariation {
  poseName: string;
  reasoning: string;
  keypoints: PoseKeypoint[];
}

const LIMB_CONNECTIONS = [
  ["head", "neck"], ["neck", "left_shoulder"], ["neck", "right_shoulder"],
  ["left_shoulder", "left_elbow"], ["left_elbow", "left_wrist"],
  ["right_shoulder", "right_elbow"], ["right_elbow", "right_wrist"],
  ["neck", "hip"], ["hip", "left_knee"], ["left_knee", "left_ankle"],
  ["hip", "right_knee"], ["right_knee", "right_ankle"],
];

function StickFigure({
  keypoints, size = 120, interactive = false, onKeypointDrag,
}: {
  keypoints: PoseKeypoint[]; size?: number; interactive?: boolean;
  onKeypointDrag?: (name: string, x: number, y: number) => void;
}) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [dragging, setDragging] = useState<string | null>(null);
  const kpMap = new Map(keypoints.map((k) => [k.name, k]));

  const handleMouseMove = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    if (!dragging || !onKeypointDrag || !svgRef.current) return;
    const rect = svgRef.current.getBoundingClientRect();
    onKeypointDrag(dragging,
      Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width)),
      Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height)),
    );
  }, [dragging, onKeypointDrag]);

  return (
    <svg ref={svgRef} width={size} height={size} viewBox="0 0 1 1"
      className={cn("overflow-visible", interactive && "cursor-crosshair")}
      onMouseMove={handleMouseMove}
      onMouseUp={() => setDragging(null)}
      onMouseLeave={() => setDragging(null)}
    >
      {LIMB_CONNECTIONS.map(([from, to]) => {
        const a = kpMap.get(from), b = kpMap.get(to);
        if (!a || !b) return null;
        return <line key={`${from}-${to}`} x1={a.x} y1={a.y} x2={b.x} y2={b.y}
          stroke="currentColor" strokeWidth={0.02} strokeLinecap="round" />;
      })}
      {keypoints.map((kp) => (
        <circle key={kp.name} cx={kp.x} cy={kp.y}
          r={kp.name === "head" ? 0.035 : 0.018}
          fill={dragging === kp.name ? "hsl(var(--primary))" : "currentColor"}
          className={interactive ? "cursor-grab active:cursor-grabbing" : ""}
          onMouseDown={interactive ? (e) => { e.preventDefault(); setDragging(kp.name); } : undefined}
        />
      ))}
    </svg>
  );
}

function SketchCanvas({ onStrokesChange }: { onStrokesChange: (dataUrl: string) => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [hasStrokes, setHasStrokes] = useState(false);

  const draw = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isDrawing) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const rect = canvas.getBoundingClientRect();
    ctx.lineTo((e.clientX - rect.left) * (canvas.width / rect.width), (e.clientY - rect.top) * (canvas.height / rect.height));
    ctx.strokeStyle = "#3b82f6"; ctx.lineWidth = 3; ctx.lineCap = "round"; ctx.stroke();
  }, [isDrawing]);

  const startDrawing = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const rect = canvas.getBoundingClientRect();
    ctx.beginPath();
    ctx.moveTo((e.clientX - rect.left) * (canvas.width / rect.width), (e.clientY - rect.top) * (canvas.height / rect.height));
    setIsDrawing(true);
  }, []);

  const stopDrawing = useCallback(() => {
    setIsDrawing(false);
    if (canvasRef.current) { setHasStrokes(true); onStrokesChange(canvasRef.current.toDataURL()); }
  }, [onStrokesChange]);

  const clear = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.getContext("2d")?.clearRect(0, 0, canvas.width, canvas.height);
    setHasStrokes(false); onStrokesChange("");
  }, [onStrokesChange]);

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between">
        <Label className="flex items-center gap-1 text-xs"><Pencil className="h-3 w-3" />Sketch</Label>
        {hasStrokes && <button className="text-xs text-muted-foreground hover:text-foreground" onClick={clear}><RotateCcw className="inline h-3 w-3" /> Clear</button>}
      </div>
      <canvas ref={canvasRef} width={140} height={140}
        className="h-[140px] w-[140px] cursor-crosshair rounded border border-dashed bg-muted/10"
        onMouseDown={startDrawing} onMouseMove={draw} onMouseUp={stopDrawing} onMouseLeave={stopDrawing}
      />
    </div>
  );
}

export function PoseEditor({ value, onChange, poseDescription, fullPrompt }: PoseEditorProps) {
  const [variations, setVariations] = useState<PoseVariation[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [selectedIdx, setSelectedIdx] = useState<number | null>(null);
  const [, setSketchDataUrl] = useState("");
  const hasGenerated = useRef(false);

  const generateVariations = useCallback(async () => {
    if (!poseDescription) return;
    setIsGenerating(true);
    try {
      const res = await fetch("/api/generate-pose", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ description: poseDescription, fullPrompt: fullPrompt || poseDescription }),
      });
      const data = await res.json();
      if (data.variations?.length > 0) {
        setVariations(data.variations);
        hasGenerated.current = true;
      }
    } catch (err) {
      console.error("Pose generation failed:", err);
    } finally {
      setIsGenerating(false);
    }
  }, [poseDescription, fullPrompt]);

  const selectVariation = useCallback((idx: number) => {
    const v = variations[idx];
    if (!v) return;
    setSelectedIdx(idx);
    onChange({ keypoints: v.keypoints, sourceName: v.poseName });
  }, [variations, onChange]);

  const handleKeypointDrag = useCallback((name: string, x: number, y: number) => {
    if (!value) return;
    onChange({ ...value, keypoints: value.keypoints.map((kp) => kp.name === name ? { ...kp, x, y } : kp) });
  }, [value, onChange]);

  return (
    <div className="space-y-3">
      {/* Generate button */}
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground">
          &quot;{poseDescription}&quot;
        </p>
        <Button size="sm" variant="outline" onClick={generateVariations} disabled={isGenerating || !poseDescription}>
          {isGenerating ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : <Wand2 className="mr-1 h-3 w-3" />}
          {variations.length > 0 ? "Regenerate" : "Generate Poses"}
        </Button>
      </div>

      {/* Variation grid — pick one */}
      {variations.length > 0 && (
        <div>
          <Label className="text-xs">Choose a pose variation:</Label>
          <div className="mt-1.5 grid grid-cols-4 gap-2">
            {variations.map((v, i) => (
              <button key={i} onClick={() => selectVariation(i)}
                className={cn(
                  "flex flex-col items-center gap-1 rounded-lg border-2 p-2 transition-all hover:bg-accent",
                  selectedIdx === i ? "border-primary bg-primary/5 text-primary" : "border-transparent text-muted-foreground hover:border-border"
                )}
              >
                <StickFigure keypoints={v.keypoints} size={70} />
                <span className="text-[10px] font-medium leading-tight text-center">{v.poseName}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Selected pose — interactive editing */}
      {value?.keypoints.length ? (
        <div className="flex gap-3">
          <div className="space-y-1">
            <Label className="text-xs">Selected (drag joints)</Label>
            <div className="flex items-center justify-center rounded-lg border bg-muted/10 p-1 text-primary">
              <StickFigure keypoints={value.keypoints} size={140} interactive onKeypointDrag={handleKeypointDrag} />
            </div>
            <p className="text-center text-[10px] font-medium">{value.sourceName}</p>
          </div>
          <SketchCanvas onStrokesChange={setSketchDataUrl} />
        </div>
      ) : !isGenerating && variations.length === 0 ? (
        <p className="text-xs text-muted-foreground">
          Click &quot;Generate Poses&quot; to get pose variations from Gemini based on your description.
        </p>
      ) : null}

      {selectedIdx !== null && variations[selectedIdx]?.reasoning && (
        <p className="text-[11px] italic text-muted-foreground">{variations[selectedIdx].reasoning}</p>
      )}
    </div>
  );
}
