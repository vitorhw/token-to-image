import { TokenCategory } from "@/types/tokens";

export interface TaxonomyEntry {
  category: TokenCategory;
  label: string;
  subcategory: string;
  patterns: string[];
  examples: string[];
  underspecification: string;
  widgetDescription: string;
  literatureSource: string;
}

export const TAXONOMY: TaxonomyEntry[] = [
  {
    category: "spatial_position",
    label: "Spatial Position",
    subcategory: "Position",
    patterns: [
      "left of", "right of", "next to", "beside", "near", "in front of",
      "behind", "above", "below", "between", "in the corner", "center",
      "middle", "edge", "side", "top", "bottom", "foreground", "background",
      "facing", "towards", "away from", "surrounding", "along", "across",
    ],
    examples: ["A bird in the corner of the image", "A cat sitting next to the fireplace"],
    underspecification: "Which exact position, distance from edges, orientation",
    widgetDescription: "Spatial canvas with draggable regions",
    literatureSource: "WorldSmith (UIST 2023), LayoutDiffusion (2023)",
  },
  {
    category: "spatial_size",
    label: "Object Size",
    subcategory: "Size",
    patterns: [
      "large", "small", "tiny", "huge", "massive", "enormous", "big",
      "little", "tall", "short", "wide", "narrow", "miniature", "giant",
    ],
    examples: ["A large tree in a meadow"],
    underspecification: "Height in pixels, proportion of frame, relative scale",
    widgetDescription: "Resizable bounding box with scale reference",
    literatureSource: "GLIGEN (CVPR 2023), WorldSmith (UIST 2023)",
  },
  {
    category: "spatial_depth",
    label: "Depth & Layering",
    subcategory: "Depth",
    patterns: [
      "in the foreground", "in the background", "far away", "close up",
      "distant", "depth", "layers", "behind", "in front", "overlapping",
      "receding", "perspective",
    ],
    examples: ["A forest with trees in the foreground"],
    underspecification: "Depth position, overlap handling, atmospheric perspective",
    widgetDescription: "Layer panel with depth map painter",
    literatureSource: "ControlNet Depth (Zhang & Agrawala 2023), LayeringDiff (2025)",
  },
  {
    category: "color",
    label: "Color",
    subcategory: "Hue Selection",
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
    widgetDescription: "Color picker with palette presets and sample-from-reference",
    literatureSource: "Color Portraits (CHI 2015), Palette Purpose Prototype (CHI 2024)",
  },
  {
    category: "camera_angle",
    label: "Camera Angle",
    subcategory: "Viewpoint",
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
    underspecification: "Exact angle, altitude, lens correction, focal length",
    widgetDescription: "Camera angle gizmo with elevation/azimuth dials",
    literatureSource: "Canvas3D (2025), Liu & Chilton (CHI 2022)",
  },
  {
    category: "style",
    label: "Art Style",
    subcategory: "Style",
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
    underspecification: "Specific style details, era, technique, brush style",
    widgetDescription: "Style exemplar gallery with strength slider",
    literatureSource: "PromptMagician (TVCG 2024), DreamSheets (CHI 2024)",
  },
  {
    category: "pose",
    label: "Pose & Gesture",
    subcategory: "Pose",
    patterns: [
      "running", "walking", "sitting", "standing", "jumping", "dancing",
      "waving", "pointing", "reaching", "leaning", "crouching", "lying",
      "kneeling", "bending", "stretching", "arms", "hand", "gesture",
      "pose", "posture", "stance", "confident", "mid-leap", "mid-",
      "expression", "smile", "frown", "mysterious", "angry", "sad",
      "happy", "laughing", "crying",
    ],
    examples: ["A person waving goodbye", "A confident businesswoman"],
    underspecification: "Exact body position, joint angles, gesture phase",
    widgetDescription: "Pose gallery with skeleton overlay editor",
    literatureSource: "Block and Detail (UIST 2024), TaleBrush (CHI 2022)",
  },
];

export function getCategoryLabel(category: TokenCategory): string {
  const entry = TAXONOMY.find((t) => t.category === category);
  return entry?.label ?? category;
}
