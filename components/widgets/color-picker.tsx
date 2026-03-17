"use client";

import { useState, useMemo } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";
import { ColorSelection } from "@/types/tokens";
import { cn } from "@/lib/utils";

// Context-aware: map detected color tokens to relevant preset palettes
const ALL_PRESETS: Record<string, { hex: string; name: string }[]> = {
  red: [
    { hex: "#DC143C", name: "Crimson" }, { hex: "#FF2400", name: "Scarlet" },
    { hex: "#800020", name: "Burgundy" }, { hex: "#FF0000", name: "Pure Red" },
    { hex: "#CC5500", name: "Burnt Orange" }, { hex: "#E34234", name: "Vermilion" },
    { hex: "#B22222", name: "Firebrick" }, { hex: "#8B0000", name: "Dark Red" },
  ],
  blue: [
    { hex: "#000080", name: "Navy" }, { hex: "#4169E1", name: "Royal Blue" },
    { hex: "#87CEEB", name: "Sky Blue" }, { hex: "#008080", name: "Teal" },
    { hex: "#00CED1", name: "Turquoise" }, { hex: "#4682B4", name: "Steel Blue" },
    { hex: "#191970", name: "Midnight Blue" }, { hex: "#6495ED", name: "Cornflower" },
  ],
  green: [
    { hex: "#228B22", name: "Forest Green" }, { hex: "#32CD32", name: "Lime" },
    { hex: "#006400", name: "Dark Green" }, { hex: "#98FB98", name: "Pale Green" },
    { hex: "#808000", name: "Olive" }, { hex: "#50C878", name: "Emerald" },
    { hex: "#2E8B57", name: "Sea Green" }, { hex: "#00FF7F", name: "Spring Green" },
  ],
  yellow: [
    { hex: "#FFD700", name: "Gold" }, { hex: "#FFFF00", name: "Pure Yellow" },
    { hex: "#F0E68C", name: "Khaki" }, { hex: "#BDB76B", name: "Dark Khaki" },
    { hex: "#DAA520", name: "Goldenrod" }, { hex: "#FFA500", name: "Orange" },
  ],
  purple: [
    { hex: "#800080", name: "Purple" }, { hex: "#4B0082", name: "Indigo" },
    { hex: "#9370DB", name: "Medium Purple" }, { hex: "#8A2BE2", name: "Blue Violet" },
    { hex: "#DDA0DD", name: "Plum" }, { hex: "#EE82EE", name: "Violet" },
  ],
  pink: [
    { hex: "#FFC0CB", name: "Pink" }, { hex: "#FF69B4", name: "Hot Pink" },
    { hex: "#FF1493", name: "Deep Pink" }, { hex: "#DB7093", name: "Pale Violet Red" },
    { hex: "#FFB6C1", name: "Light Pink" }, { hex: "#C71585", name: "Medium Violet Red" },
  ],
  earthy: [
    { hex: "#8B4513", name: "Saddle Brown" }, { hex: "#D2B48C", name: "Tan" },
    { hex: "#A0522D", name: "Sienna" }, { hex: "#DEB887", name: "Burlywood" },
    { hex: "#808000", name: "Olive" }, { hex: "#556B2F", name: "Dark Olive" },
    { hex: "#BC8F8F", name: "Rosy Brown" }, { hex: "#F5DEB3", name: "Wheat" },
  ],
  neutral: [
    { hex: "#FFFFF0", name: "Ivory" }, { hex: "#FFFDD0", name: "Cream" },
    { hex: "#C0C0C0", name: "Silver" }, { hex: "#808080", name: "Gray" },
    { hex: "#2F4F4F", name: "Dark Slate" }, { hex: "#FAEBD7", name: "Antique White" },
  ],
};

function getRelevantPresets(tokenText: string): { group: string; colors: { hex: string; name: string }[] }[] {
  const text = tokenText.toLowerCase();

  // Direct color match
  for (const [key, colors] of Object.entries(ALL_PRESETS)) {
    if (text.includes(key)) {
      return [{ group: `${key.charAt(0).toUpperCase() + key.slice(1)} variants`, colors }];
    }
  }

  // Mood-based matches
  if (text.includes("warm") || text.includes("golden")) {
    return [
      { group: "Warm tones", colors: [...ALL_PRESETS.red.slice(0, 3), ...ALL_PRESETS.yellow.slice(0, 3), ...ALL_PRESETS.earthy.slice(0, 2)] },
    ];
  }
  if (text.includes("cool") || text.includes("cold")) {
    return [
      { group: "Cool tones", colors: [...ALL_PRESETS.blue.slice(0, 4), ...ALL_PRESETS.purple.slice(0, 2), ...ALL_PRESETS.green.slice(0, 2)] },
    ];
  }
  if (text.includes("earthy") || text.includes("natural") || text.includes("muted")) {
    return [{ group: "Earthy tones", colors: ALL_PRESETS.earthy }];
  }
  if (text.includes("pastel") || text.includes("soft") || text.includes("pale")) {
    return [{
      group: "Pastel tones",
      colors: [
        { hex: "#FFB6C1", name: "Light Pink" }, { hex: "#ADD8E6", name: "Light Blue" },
        { hex: "#98FB98", name: "Pale Green" }, { hex: "#FFFACD", name: "Lemon Chiffon" },
        { hex: "#E6E6FA", name: "Lavender" }, { hex: "#FFDAB9", name: "Peach Puff" },
      ],
    }];
  }
  if (text.includes("neon") || text.includes("vivid") || text.includes("bright")) {
    return [{
      group: "Vivid / Neon",
      colors: [
        { hex: "#FF0000", name: "Red" }, { hex: "#00FF00", name: "Lime" },
        { hex: "#0000FF", name: "Blue" }, { hex: "#FF00FF", name: "Magenta" },
        { hex: "#FFFF00", name: "Yellow" }, { hex: "#00FFFF", name: "Cyan" },
      ],
    }];
  }

  // Default: show common palettes
  return [
    { group: "Common colors", colors: [
      { hex: "#DC143C", name: "Crimson" }, { hex: "#4169E1", name: "Royal Blue" },
      { hex: "#228B22", name: "Forest Green" }, { hex: "#FFD700", name: "Gold" },
      { hex: "#800080", name: "Purple" }, { hex: "#FF69B4", name: "Hot Pink" },
      { hex: "#8B4513", name: "Brown" }, { hex: "#C0C0C0", name: "Silver" },
    ]},
  ];
}

interface ColorPickerProps {
  targets: string[];
  value: ColorSelection[];
  onChange: (colors: ColorSelection[]) => void;
}

export function ColorPicker({ targets, value, onChange }: ColorPickerProps) {
  const [customHex, setCustomHex] = useState("#FF0000");
  const activeTarget = targets[0] ?? "main subject";
  const currentColor = value.find((c) => c.target === activeTarget);

  // Context-aware presets based on the token text
  const presets = useMemo(() => getRelevantPresets(activeTarget), [activeTarget]);

  function selectColor(hex: string, name: string) {
    const updated = value.filter((c) => c.target !== activeTarget);
    updated.push({ hex, name, target: activeTarget });
    onChange(updated);
  }

  return (
    <div className="space-y-3">
      {/* Current selection */}
      {currentColor && (
        <div className="flex items-center gap-2 rounded-md border p-2">
          <div className="h-6 w-6 rounded border" style={{ backgroundColor: currentColor.hex }} />
          <span className="text-sm font-medium">{currentColor.name}</span>
          <span className="text-xs text-muted-foreground">{currentColor.hex}</span>
        </div>
      )}

      {/* Custom */}
      <div className="flex items-end gap-2">
        <div className="flex flex-1 gap-2">
          <input
            type="color"
            value={customHex}
            onChange={(e) => setCustomHex(e.target.value)}
            className="h-9 w-10 cursor-pointer rounded border p-0.5"
          />
          <Input
            value={customHex}
            onChange={(e) => setCustomHex(e.target.value)}
            placeholder="#FF0000"
            className="h-9 font-mono text-xs"
          />
        </div>
        <Button size="sm" variant="outline" className="h-9" onClick={() => selectColor(customHex, customHex)}>
          <Plus className="mr-1 h-3 w-3" /> Apply
        </Button>
      </div>

      {/* Context-aware presets */}
      {presets.map(({ group, colors }) => (
        <div key={group}>
          <Label className="text-xs text-muted-foreground">{group}</Label>
          <div className="mt-1 flex flex-wrap gap-1.5">
            {colors.map((c) => (
              <button
                key={c.hex}
                onClick={() => selectColor(c.hex, c.name)}
                className={cn(
                  "group relative h-7 w-7 rounded-md border-2 transition-all hover:scale-110",
                  currentColor?.hex === c.hex ? "border-primary ring-2 ring-primary/30" : "border-transparent"
                )}
                style={{ backgroundColor: c.hex }}
                title={`${c.name} (${c.hex})`}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
