"use client";

import { useMemo } from "react";
import { Slider } from "@/components/ui/slider";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { CameraSettings } from "@/types/tokens";

interface CameraControlsProps {
  value: CameraSettings;
  onChange: (settings: CameraSettings) => void;
  tokenText?: string;
}

function getElevationLabel(deg: number): string {
  if (deg <= -60) return "Worm's Eye";
  if (deg <= -20) return "Low Angle";
  if (deg <= 20) return "Eye Level";
  if (deg <= 60) return "High Angle";
  return "Bird's Eye";
}

function getAzimuthLabel(deg: number): string {
  if (deg <= 45 || deg > 315) return "Front";
  if (deg <= 135) return "Right Side";
  if (deg <= 225) return "Back";
  return "Left Side";
}

function getFocalLabel(mm: number): string {
  if (mm <= 20) return "Ultra Wide";
  if (mm <= 35) return "Wide";
  if (mm <= 60) return "Standard";
  if (mm <= 100) return "Portrait";
  return "Telephoto";
}

// Context-aware camera presets based on the detected token
function getSuggestedPresets(tokenText?: string): { name: string; settings: CameraSettings }[] {
  const t = (tokenText || "").toLowerCase();
  const presets: { name: string; settings: CameraSettings }[] = [];

  if (t.includes("bird") || t.includes("aerial") || t.includes("top") || t.includes("overhead")) {
    presets.push({ name: "Bird's Eye (90°)", settings: { elevation: 85, azimuth: 0, focalLength: 24, distance: 1 } });
    presets.push({ name: "High Angle (60°)", settings: { elevation: 60, azimuth: 0, focalLength: 35, distance: 1 } });
  }
  if (t.includes("low") || t.includes("worm") || t.includes("looking up")) {
    presets.push({ name: "Low Angle (-45°)", settings: { elevation: -45, azimuth: 0, focalLength: 24, distance: 1 } });
    presets.push({ name: "Dramatic Low (-60°)", settings: { elevation: -60, azimuth: 0, focalLength: 20, distance: 1 } });
  }
  if (t.includes("close") || t.includes("macro") || t.includes("detail")) {
    presets.push({ name: "Close-up Portrait", settings: { elevation: 0, azimuth: 0, focalLength: 85, distance: 0.5 } });
    presets.push({ name: "Extreme Close-up", settings: { elevation: 0, azimuth: 0, focalLength: 135, distance: 0.3 } });
  }
  if (t.includes("wide") || t.includes("panoram") || t.includes("landscape")) {
    presets.push({ name: "Wide Landscape", settings: { elevation: 5, azimuth: 0, focalLength: 18, distance: 2 } });
    presets.push({ name: "Panoramic", settings: { elevation: 0, azimuth: 0, focalLength: 14, distance: 2.5 } });
  }
  if (t.includes("bokeh") || t.includes("blur") || t.includes("depth of field") || t.includes("shallow")) {
    presets.push({ name: "Shallow DoF Portrait", settings: { elevation: 0, azimuth: 0, focalLength: 85, distance: 1 } });
    presets.push({ name: "Extreme Bokeh", settings: { elevation: 0, azimuth: 0, focalLength: 200, distance: 1.5 } });
  }
  if (t.includes("dutch") || t.includes("tilt")) {
    presets.push({ name: "Dutch Angle", settings: { elevation: 15, azimuth: 30, focalLength: 35, distance: 1 } });
  }
  if (t.includes("side") || t.includes("profile")) {
    presets.push({ name: "Side Profile", settings: { elevation: 0, azimuth: 90, focalLength: 85, distance: 1 } });
  }

  // Always add generic presets
  if (presets.length === 0) {
    presets.push(
      { name: "Eye Level Standard", settings: { elevation: 0, azimuth: 0, focalLength: 50, distance: 1 } },
      { name: "Cinematic Wide", settings: { elevation: 5, azimuth: 15, focalLength: 28, distance: 1.5 } },
      { name: "Portrait Close-up", settings: { elevation: 5, azimuth: 0, focalLength: 85, distance: 0.8 } },
    );
  }

  return presets;
}

export function CameraControls({ value, onChange, tokenText }: CameraControlsProps) {
  const presets = useMemo(() => getSuggestedPresets(tokenText), [tokenText]);

  return (
    <div className="space-y-4">
      {/* Context-aware presets */}
      <div>
        <Label className="text-xs text-muted-foreground">
          {tokenText ? `Suggestions for "${tokenText}"` : "Presets"}
        </Label>
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          {presets.map((p) => (
            <Button key={p.name} size="sm" variant="outline" className="h-7 text-xs"
              onClick={() => onChange(p.settings)}>
              {p.name}
            </Button>
          ))}
        </div>
      </div>

      {/* Visual preview */}
      <div className="mx-auto flex h-28 w-28 items-center justify-center rounded-full border-2 border-dashed border-muted-foreground/30">
        <div className="relative h-20 w-20">
          <div className="absolute left-1/2 top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-muted-foreground/40" />
          <div className="absolute h-4 w-4 rounded-sm bg-primary transition-all"
            style={{
              left: `${50 + Math.cos((value.azimuth * Math.PI) / 180) * 40}%`,
              top: `${50 - Math.sin((value.azimuth * Math.PI) / 180) * 40}%`,
              transform: "translate(-50%, -50%)",
              opacity: 0.5 + (value.elevation + 90) / 360,
            }} />
          <span className="absolute -bottom-4 left-1/2 -translate-x-1/2 text-[10px] text-muted-foreground">
            {getAzimuthLabel(value.azimuth)}
          </span>
        </div>
      </div>

      {/* Sliders */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <Label className="text-xs">Elevation</Label>
          <span className="text-xs font-medium text-primary">{getElevationLabel(value.elevation)} ({value.elevation}°)</span>
        </div>
        <Slider value={[value.elevation]}
          onValueChange={(val) => { const v = Array.isArray(val) ? val[0] : val; onChange({ ...value, elevation: v }); }}
          min={-90} max={90} step={5} />
      </div>

      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <Label className="text-xs">Rotation</Label>
          <span className="text-xs font-medium text-primary">{getAzimuthLabel(value.azimuth)} ({value.azimuth}°)</span>
        </div>
        <Slider value={[value.azimuth]}
          onValueChange={(val) => { const v = Array.isArray(val) ? val[0] : val; onChange({ ...value, azimuth: v }); }}
          min={0} max={360} step={15} />
      </div>

      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <Label className="text-xs">Focal Length</Label>
          <span className="text-xs font-medium text-primary">{getFocalLabel(value.focalLength)} ({value.focalLength}mm)</span>
        </div>
        <Slider value={[value.focalLength]}
          onValueChange={(val) => { const v = Array.isArray(val) ? val[0] : val; onChange({ ...value, focalLength: v }); }}
          min={14} max={200} step={1} />
      </div>
    </div>
  );
}
