"use client";

import { useRef, useState, useCallback, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Eraser, RotateCcw } from "lucide-react";
import { MaskRegion } from "@/types/tokens";

interface MaskPainterProps {
  imageUrl: string;
  value: MaskRegion | null;
  onChange: (mask: MaskRegion) => void;
}

export function MaskPainter({ imageUrl, value, onChange }: MaskPainterProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [brushSize, setBrushSize] = useState(30);
  const [editPrompt, setEditPrompt] = useState(value?.editPrompt ?? "");

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    canvas.width = 512;
    canvas.height = 512;
    ctx.clearRect(0, 0, 512, 512);
  }, [imageUrl]);

  const draw = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      if (!isDrawing) return;
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      const rect = canvas.getBoundingClientRect();
      const scaleX = canvas.width / rect.width;
      const scaleY = canvas.height / rect.height;
      const x = (e.clientX - rect.left) * scaleX;
      const y = (e.clientY - rect.top) * scaleY;

      ctx.globalAlpha = 0.5;
      ctx.fillStyle = "#FF0000";
      ctx.beginPath();
      ctx.arc(x, y, brushSize * scaleX, 0, Math.PI * 2);
      ctx.fill();
    },
    [isDrawing, brushSize]
  );

  const stopDrawing = useCallback(() => {
    setIsDrawing(false);
    const canvas = canvasRef.current;
    if (!canvas) return;

    // Generate black-and-white mask
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const maskCanvas = document.createElement("canvas");
    maskCanvas.width = canvas.width;
    maskCanvas.height = canvas.height;
    const maskCtx = maskCanvas.getContext("2d")!;
    const maskData = maskCtx.createImageData(canvas.width, canvas.height);

    for (let i = 0; i < imageData.data.length; i += 4) {
      const hasColor = imageData.data[i] > 0 || imageData.data[i + 1] > 0 || imageData.data[i + 2] > 0;
      maskData.data[i] = hasColor ? 255 : 0;
      maskData.data[i + 1] = hasColor ? 255 : 0;
      maskData.data[i + 2] = hasColor ? 255 : 0;
      maskData.data[i + 3] = 255;
    }
    maskCtx.putImageData(maskData, 0, 0);

    onChange({
      dataUrl: maskCanvas.toDataURL("image/png"),
      editPrompt,
    });
  }, [editPrompt, onChange]);

  const clearMask = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    onChange({ dataUrl: "", editPrompt });
  }, [editPrompt, onChange]);

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">
        Paint over the areas you want to change. Only painted regions will be regenerated.
      </p>

      {/* Canvas over image */}
      <div className="relative overflow-hidden rounded-lg border">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={imageUrl}
          alt="Image to edit"
          className="block w-full"
          style={{ maxHeight: 400 }}
        />
        <canvas
          ref={canvasRef}
          className="absolute inset-0 h-full w-full cursor-crosshair"
          onMouseDown={() => setIsDrawing(true)}
          onMouseMove={draw}
          onMouseUp={stopDrawing}
          onMouseLeave={stopDrawing}
        />
      </div>

      {/* Brush controls */}
      <div className="flex items-center gap-4">
        <div className="flex-1 space-y-1">
          <Label className="text-xs">Brush Size: {brushSize}px</Label>
          <Slider
            value={[brushSize]}
            onValueChange={(val) => setBrushSize(Array.isArray(val) ? val[0] : val)}
            min={5}
            max={80}
            step={5}
          />
        </div>
        <Button size="sm" variant="outline" onClick={clearMask}>
          <RotateCcw className="mr-1 h-3 w-3" />
          Clear
        </Button>
      </div>

      {/* Edit prompt */}
      <div className="space-y-1">
        <Label className="text-xs">What should change in the masked area?</Label>
        <Input
          value={editPrompt}
          onChange={(e) => {
            setEditPrompt(e.target.value);
            if (value?.dataUrl) {
              onChange({ ...value, editPrompt: e.target.value });
            }
          }}
          placeholder="e.g., replace with a blue sky"
          className="text-sm"
        />
      </div>
    </div>
  );
}
