import { TokenCategory } from "@/types/tokens";

export interface TaxonomyEntry {
  category: TokenCategory;
  label: string;
  color: string; // tailwind color class for the accent
  widget: string;
  promptExample: string;
  conditioning: string | null;
  conditioningDetail: string | null;
  pipeline: string;
  source: string;
}

export const TAXONOMY: TaxonomyEntry[] = [
  {
    category: "spatial_position",
    label: "Spatial",
    color: "bg-blue-500",
    widget: "Draggable canvas with depth sliders",
    promptExample: '"Composition: cat on the left third, in the foreground"',
    conditioning: "Depth map",
    conditioningDetail: "Gemini-generated MiDaS silhouettes → ControlNet depth @ 0.95",
    pipeline: "Flux + ControlNet",
    source: "WorldSmith (UIST '23), GLIGEN (CVPR '23)",
  },
  {
    category: "color",
    label: "Color",
    color: "bg-rose-500",
    widget: "Color picker with context-aware palettes",
    promptExample: '"Colors: dress: Crimson (#DC143C)"',
    conditioning: null,
    conditioningDetail: null,
    pipeline: "Text-only",
    source: "Color Portraits (CHI '15)",
  },
  {
    category: "style",
    label: "Style",
    color: "bg-amber-500",
    widget: "Gallery (16 styles) + one reference concept",
    promptExample: '"Watercolor style, evoking misty landscape"',
    conditioning: "Reference image",
    conditioningDetail: "Single uploaded style exemplar → reference-image guidance",
    pipeline: "Flux + Reference Image",
    source: "PromptMagician (TVCG '24), DreamSheets (CHI '24)",
  },
  {
    category: "pose",
    label: "Pose",
    color: "bg-green-500",
    widget: "4 Gemini skeleton variations, draggable joints",
    promptExample: '"Subject pose: striding forward with chest out"',
    conditioning: "Pose skeleton",
    conditioningDetail: "OpenPose 1024px → ControlNet pose @ 0.9",
    pipeline: "Flux + ControlNet",
    source: "Block & Detail (UIST '24), TaleBrush (CHI '22)",
  },
];

export function getCategoryLabel(category: TokenCategory): string {
  const entry = TAXONOMY.find((t) => t.category === category);
  return entry?.label ?? category;
}
