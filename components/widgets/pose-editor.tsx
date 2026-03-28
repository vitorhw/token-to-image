"use client";

import { useState, useRef, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Loader2, Wand2 } from "lucide-react";
import { PoseSelection, PoseKeypoint } from "@/types/tokens";
import { cn } from "@/lib/utils";

interface PoseEditorProps {
  value: PoseSelection | null;
  onChange: (pose: PoseSelection) => void;
  poseDescription?: string;
  fullPrompt?: string;
  onDone?: () => void;
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

export function PoseEditor({ value, onChange, poseDescription, fullPrompt, onDone }: PoseEditorProps) {
  const [variations, setVariations] = useState<PoseVariation[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [selectedIdx, setSelectedIdx] = useState<number | null>(null);
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
      {/* Variations grid */}
      {variations.length > 0 && (
        <div>
          <p className="mb-1.5 text-xs font-semibold">Pick a Variation</p>
          <div className="grid grid-cols-4 gap-2">
            {variations.map((v, i) => (
              <button key={i} onClick={() => selectVariation(i)}
                className={cn(
                  "flex flex-col items-center gap-1 rounded-lg border-2 p-2 transition-all hover:bg-accent",
                  selectedIdx === i ? "border-primary bg-primary/5 text-primary" : "border-transparent text-muted-foreground hover:border-border"
                )}
              >
                <StickFigure keypoints={v.keypoints} size={60} />
                <span className="text-[9px] font-medium leading-tight text-center">{v.poseName}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Interactive editor */}
      {value?.keypoints?.length ? (
        <div>
          <p className="mb-1.5 text-xs font-semibold">Refine Joints</p>
          <div className="flex items-center justify-center rounded-lg border bg-muted/10 p-2 text-primary">
            <StickFigure keypoints={value.keypoints} size={160} interactive onKeypointDrag={handleKeypointDrag} />
          </div>
          <p className="mt-1 text-center text-[10px] font-medium text-muted-foreground">{value.sourceName}</p>
        </div>
      ) : null}

      {/* Regenerate link when poses exist */}
      {variations.length > 0 && (
        <Button size="sm" variant="ghost" className="w-full text-xs" onClick={generateVariations} disabled={isGenerating}>
          {isGenerating ? <><Loader2 className="mr-1 h-3 w-3 animate-spin" />Regenerating...</> : <><Wand2 className="mr-1 h-3 w-3" />Regenerate Poses</>}
        </Button>
      )}

      {/* Primary CTA: Generate Poses → Done */}
      {value?.keypoints?.length ? (
        <Button className="w-full h-10" onClick={onDone}>Done</Button>
      ) : (
        <Button className="w-full h-10" onClick={generateVariations} disabled={isGenerating || !poseDescription}>
          {isGenerating ? <><Loader2 className="mr-1.5 h-4 w-4 animate-spin" />Generating Poses...</> : <><Wand2 className="mr-1.5 h-4 w-4" />Generate Poses</>}
        </Button>
      )}
    </div>
  );
}
