import { TokenCategory } from "@/types/tokens";

export interface TaxonomyEntry {
  category: TokenCategory;
  label: string;
  subcategory: string;
  patterns: string[];
  examples: string[];
  underspecification: string;
  widgetDescription: string;
  conditioningSignal: string;
  conditioningTarget: string;
  literatureSource: string;
}

export const TAXONOMY: TaxonomyEntry[] = [
  {
    category: "spatial_position",
    label: "Spatial Position",
    subcategory: "Position, Size & Depth",
    patterns: [
      "left of", "right of", "next to", "beside", "near", "in front of",
      "behind", "above", "below", "between", "in the corner", "center",
      "middle", "edge", "side", "top", "bottom", "foreground", "background",
      "facing", "towards", "away from", "surrounding", "along", "across",
      "large", "small", "tiny", "huge", "massive", "enormous", "big",
      "little", "tall", "short", "wide", "narrow", "miniature", "giant",
      "in the foreground", "in the background", "far away", "close up",
      "distant", "depth", "layers", "overlapping", "receding", "perspective",
    ],
    examples: [
      "A bird in the corner of the image",
      "A large tree in a meadow",
      "A forest with trees in the foreground",
    ],
    underspecification: "Exact position, size proportion, and depth layering",
    widgetDescription: "Spatial canvas with draggable, resizable regions and depth control",
    conditioningSignal: "Segmentation map (position + size) AND depth map (layering)",
    conditioningTarget: "EasyControls seg+spatial (position/size) + ControlNet depth (layering)",
    literatureSource: "WorldSmith (UIST 2023), ControlNet Depth (Zhang & Agrawala 2023)",
  },
  {
    category: "color",
    label: "Color",
    subcategory: "Hue & Palette",
    patterns: [
      "red", "blue", "green", "yellow", "purple", "orange", "pink",
      "brown", "black", "white", "gray", "grey", "golden", "silver",
      "dark", "light", "bright", "pale", "vivid", "muted", "pastel",
      "earthy", "warm", "cool", "tones", "hue", "shade", "tint",
      "crimson", "scarlet", "teal", "turquoise", "cream", "ivory",
      "neon", "metallic", "colorful", "monochrome",
    ],
    examples: ["A woman in a red dress", "A photo with earthy tones"],
    underspecification: "Exact hue, saturation, brightness, which variant",
    widgetDescription: "Color picker with context-aware palette presets",
    conditioningSignal: "Color name + hex code appended to prompt",
    conditioningTarget: "Text prompt enrichment (e.g. 'Colors: dress: Crimson (#DC143C)')",
    literatureSource: "Color Portraits (CHI 2015), Palette Purpose Prototype (CHI 2024)",
  },
  {
    category: "camera_angle",
    label: "Camera Angle",
    subcategory: "Viewpoint & Lens",
    patterns: [
      "bird's eye", "bird eye", "aerial", "top down", "low angle",
      "high angle", "eye level", "worm's eye", "overhead", "isometric",
      "wide angle", "telephoto", "macro", "close-up",
      "panoramic", "fish eye", "tilt", "dutch angle", "camera angle",
      "shot", "view from", "looking down", "looking up", "first person",
      "blurry background", "bokeh", "depth of field", "shallow focus",
      "lens", "focal",
    ],
    examples: ["A bird's eye view of the city", "A portrait with blurry background"],
    underspecification: "Exact elevation angle, azimuth, focal length",
    widgetDescription: "Camera gizmo with elevation, rotation, and focal length controls",
    conditioningSignal: "Perspective depth map (gradient encoding camera viewpoint) + text enrichment",
    conditioningTarget: "ControlNet Union Pro 2.0 — depth mode (scale 0.45, end 40%) + prompt prepend",
    literatureSource: "Canvas3D (2025), Liu & Chilton (CHI 2022)",
  },
  {
    category: "style",
    label: "Art Style",
    subcategory: "Visual Style",
    patterns: [
      "impressionist", "watercolor", "oil painting", "sketch", "cartoon",
      "anime", "pixel art", "photorealistic", "realistic", "abstract",
      "minimalist", "surreal", "pop art", "art deco", "baroque",
      "renaissance", "modern", "vintage", "retro", "futuristic",
      "cyberpunk", "steampunk", "fantasy", "gothic", "noir",
      "illustration", "digital art", "concept art", "doodle",
      "line art", "flat design", "3D render", "cinematic",
      "professional", "artistic", "style", "aesthetic",
    ],
    examples: ["A painting in impressionist style", "A cinematic scene"],
    underspecification: "Specific technique, era, brush style, level of stylization",
    widgetDescription: "Style gallery with 16 presets and strength slider",
    conditioningSignal: "Style name prepended to prompt with strength weighting",
    conditioningTarget: "Text prompt enrichment (e.g. 'Impressionist style.' prepended at start)",
    literatureSource: "PromptMagician (TVCG 2024), DreamSheets (CHI 2024)",
  },
];

export function getCategoryLabel(category: TokenCategory): string {
  const entry = TAXONOMY.find((t) => t.category === category);
  return entry?.label ?? category;
}
