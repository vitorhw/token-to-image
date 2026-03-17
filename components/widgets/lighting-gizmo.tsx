"use client";

import { useState, useCallback, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Label } from "@/components/ui/label";
import { Plus, Trash2 } from "lucide-react";
import { LightSource, LightingSettings } from "@/types/tokens";
import { cn } from "@/lib/utils";

interface LightingGizmoProps {
  value: LightingSettings;
  onChange: (settings: LightingSettings) => void;
  tokenText?: string;
}

// Context-aware lighting presets based on the token
function getSuggestedSetups(tokenText?: string): { name: string; lights: LightSource[] }[] {
  const t = (tokenText || "").toLowerCase();
  const setups: { name: string; lights: LightSource[] }[] = [];

  if (t.includes("dramatic") || t.includes("moody")) {
    setups.push({
      name: "Dramatic Side",
      lights: [
        { id: "k", x: -0.8, y: -0.3, intensity: 0.9, colorTemp: 4500, type: "key" },
        { id: "f", x: 0.5, y: 0.2, intensity: 0.2, colorTemp: 6000, type: "fill" },
      ],
    });
  }
  if (t.includes("side")) {
    setups.push({
      name: "Side Light",
      lights: [
        { id: "k", x: -0.9, y: 0, intensity: 0.85, colorTemp: 5000, type: "key" },
      ],
    });
  }
  if (t.includes("golden hour") || t.includes("sunset") || t.includes("warm")) {
    setups.push({
      name: "Golden Hour",
      lights: [
        { id: "k", x: -0.6, y: -0.4, intensity: 0.8, colorTemp: 2800, type: "key" },
        { id: "a", x: 0.3, y: 0.3, intensity: 0.3, colorTemp: 3200, type: "ambient" },
      ],
    });
  }
  if (t.includes("studio") || t.includes("professional")) {
    setups.push({
      name: "Three-Point Studio",
      lights: [
        { id: "k", x: -0.6, y: -0.4, intensity: 0.8, colorTemp: 5500, type: "key" },
        { id: "f", x: 0.5, y: -0.1, intensity: 0.4, colorTemp: 5500, type: "fill" },
        { id: "r", x: 0.2, y: 0.7, intensity: 0.5, colorTemp: 6500, type: "rim" },
      ],
    });
  }
  if (t.includes("backlit") || t.includes("rim")) {
    setups.push({
      name: "Backlit / Rim",
      lights: [
        { id: "r", x: 0, y: 0.9, intensity: 0.9, colorTemp: 5500, type: "rim" },
        { id: "f", x: -0.4, y: -0.3, intensity: 0.3, colorTemp: 5000, type: "fill" },
      ],
    });
  }
  if (t.includes("soft") || t.includes("diffused")) {
    setups.push({
      name: "Soft Diffused",
      lights: [
        { id: "k", x: -0.3, y: -0.5, intensity: 0.6, colorTemp: 5500, type: "key" },
        { id: "f", x: 0.3, y: -0.3, intensity: 0.5, colorTemp: 5500, type: "fill" },
        { id: "a", x: 0, y: 0.5, intensity: 0.4, colorTemp: 5000, type: "ambient" },
      ],
    });
  }

  // Always add a generic option
  if (setups.length === 0) {
    setups.push(
      { name: "Key + Fill", lights: [
        { id: "k", x: -0.6, y: -0.4, intensity: 0.8, colorTemp: 5000, type: "key" },
        { id: "f", x: 0.4, y: -0.1, intensity: 0.4, colorTemp: 5500, type: "fill" },
      ]},
      { name: "Single Dramatic", lights: [
        { id: "k", x: -0.8, y: -0.3, intensity: 0.9, colorTemp: 4500, type: "key" },
      ]},
    );
  }

  return setups;
}

function tempToColor(kelvin: number): string {
  if (kelvin < 3500) return "#FF9329";
  if (kelvin < 5000) return "#FFD6AA";
  if (kelvin < 6500) return "#FFFFFF";
  return "#C9D8FF";
}

function generateDescription(lights: LightSource[]): string {
  if (lights.length === 0) return "No lighting specified";
  return lights
    .map((l) => {
      const side = l.x < -0.3 ? "left" : l.x > 0.3 ? "right" : "center";
      const height = l.y < -0.3 ? "above" : l.y > 0.3 ? "below" : "level";
      const warmth = l.colorTemp < 4000 ? "warm" : l.colorTemp > 6000 ? "cool" : "neutral";
      return `${l.type} light from ${height}-${side}, ${warmth} (${l.colorTemp}K), ${Math.round(l.intensity * 100)}% intensity`;
    })
    .join(". ");
}

export function LightingGizmo({ value, onChange, tokenText }: LightingGizmoProps) {
  const suggestedSetups = getSuggestedSetups(tokenText);
  const stageRef = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState<string | null>(null);
  const [selectedLight, setSelectedLight] = useState<string | null>(null);

  const addLight = useCallback(() => {
    if (value.lights.length >= 4) return;
    const types: LightSource["type"][] = ["key", "fill", "rim", "ambient"];
    const newLight: LightSource = {
      id: `light-${Date.now()}`,
      x: (Math.random() - 0.5) * 1.4,
      y: (Math.random() - 0.5) * 1.4,
      intensity: 0.8,
      colorTemp: 5000,
      type: types[value.lights.length] ?? "fill",
    };
    const newLights = [...value.lights, newLight];
    onChange({ lights: newLights, description: generateDescription(newLights) });
    setSelectedLight(newLight.id);
  }, [value, onChange]);

  const removeLight = useCallback(
    (id: string) => {
      const newLights = value.lights.filter((l) => l.id !== id);
      onChange({ lights: newLights, description: generateDescription(newLights) });
      if (selectedLight === id) setSelectedLight(null);
    },
    [value, onChange, selectedLight]
  );

  const updateLight = useCallback(
    (id: string, updates: Partial<LightSource>) => {
      const newLights = value.lights.map((l) =>
        l.id === id ? { ...l, ...updates } : l
      );
      onChange({ lights: newLights, description: generateDescription(newLights) });
    },
    [value, onChange]
  );

  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      if (!dragging || !stageRef.current) return;
      const rect = stageRef.current.getBoundingClientRect();
      const x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      const y = ((e.clientY - rect.top) / rect.height) * 2 - 1;
      updateLight(dragging, {
        x: Math.max(-1, Math.min(1, x)),
        y: Math.max(-1, Math.min(1, y)),
      });
    },
    [dragging, updateLight]
  );

  const selectedLightData = value.lights.find((l) => l.id === selectedLight);

  return (
    <div className="space-y-4">
      {/* Context-aware suggested setups */}
      {value.lights.length === 0 && (
        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground">Suggested setups for &quot;{tokenText}&quot;</Label>
          <div className="flex flex-wrap gap-1.5">
            {suggestedSetups.map((setup) => (
              <Button
                key={setup.name}
                size="sm"
                variant="outline"
                className="h-7 text-xs"
                onClick={() => {
                  const newLights = setup.lights;
                  onChange({ lights: newLights, description: generateDescription(newLights) });
                  if (newLights.length > 0) setSelectedLight(newLights[0].id);
                }}
              >
                {setup.name}
              </Button>
            ))}
          </div>
        </div>
      )}

      {/* Stage */}
      <div
        ref={stageRef}
        className="relative mx-auto h-48 w-48 rounded-full border-2 border-dashed border-muted-foreground/30 bg-muted/20"
        onMouseMove={handleMouseMove}
        onMouseUp={() => setDragging(null)}
        onMouseLeave={() => setDragging(null)}
      >
        {/* Subject center */}
        <div className="absolute left-1/2 top-1/2 h-6 w-6 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-muted-foreground/40 bg-muted-foreground/10" />
        <span className="absolute left-1/2 top-1/2 mt-5 -translate-x-1/2 text-[10px] text-muted-foreground">
          subject
        </span>

        {/* Light sources */}
        {value.lights.map((light) => (
          <div
            key={light.id}
            className={cn(
              "absolute flex h-7 w-7 -translate-x-1/2 -translate-y-1/2 cursor-grab items-center justify-center rounded-full border-2 text-[10px] font-bold shadow-lg active:cursor-grabbing",
              selectedLight === light.id ? "border-primary ring-2 ring-primary/30" : "border-white/50"
            )}
            style={{
              left: `${(light.x + 1) * 50}%`,
              top: `${(light.y + 1) * 50}%`,
              backgroundColor: tempToColor(light.colorTemp),
              opacity: 0.4 + light.intensity * 0.6,
            }}
            onMouseDown={(e) => {
              e.preventDefault();
              setDragging(light.id);
              setSelectedLight(light.id);
            }}
            onClick={() => setSelectedLight(light.id)}
          >
            {light.type[0].toUpperCase()}
          </div>
        ))}
      </div>

      {/* Controls */}
      <div className="flex items-center justify-between">
        <Button size="sm" variant="outline" onClick={addLight} disabled={value.lights.length >= 4}>
          <Plus className="mr-1 h-3 w-3" />
          Add Light ({value.lights.length}/4)
        </Button>
        {selectedLight && (
          <Button size="sm" variant="ghost" onClick={() => removeLight(selectedLight)}>
            <Trash2 className="mr-1 h-3 w-3" />
            Remove
          </Button>
        )}
      </div>

      {/* Selected light controls */}
      {selectedLightData && (
        <div className="space-y-3 rounded-lg border p-3">
          <p className="text-xs font-medium capitalize">{selectedLightData.type} Light</p>
          <div className="space-y-1.5">
            <div className="flex justify-between">
              <Label className="text-xs">Intensity</Label>
              <span className="text-xs text-muted-foreground">
                {Math.round(selectedLightData.intensity * 100)}%
              </span>
            </div>
            <Slider
              value={[selectedLightData.intensity * 100]}
              onValueChange={(val) => updateLight(selectedLightData.id, { intensity: (Array.isArray(val) ? val[0] : val) / 100 })}
              min={10}
              max={100}
              step={5}
            />
          </div>
          <div className="space-y-1.5">
            <div className="flex justify-between">
              <Label className="text-xs">Color Temperature</Label>
              <span className="text-xs text-muted-foreground">{selectedLightData.colorTemp}K</span>
            </div>
            <Slider
              value={[selectedLightData.colorTemp]}
              onValueChange={(val) => updateLight(selectedLightData.id, { colorTemp: Array.isArray(val) ? val[0] : val })}
              min={2000}
              max={10000}
              step={100}
            />
            <div className="flex justify-between text-[10px] text-muted-foreground">
              <span>Warm</span>
              <span>Neutral</span>
              <span>Cool</span>
            </div>
          </div>
        </div>
      )}

      {/* Description */}
      {value.lights.length > 0 && (
        <p className="text-xs italic text-muted-foreground">{value.description}</p>
      )}
    </div>
  );
}
