import { WidgetState } from "@/types/tokens";

export interface TestCase {
  id: string;
  name: string;
  description: string;
  prompt: string;
  widgetState: WidgetState;
  widgetInstructions: { widget: string; instruction: string }[];
  tags: string[]; // e.g. "spatial", "color", "camera", "style", "combined"
}

/**
 * Comprehensive test suite covering every widget individually,
 * and various combinations. Each test case defines exact widget
 * settings and instructions that the Gemini judge should verify.
 */
export const TEST_CASES: TestCase[] = [
  // ===== SPATIAL POSITION TESTS =====
  {
    id: "spatial-left",
    name: "Spatial: Object on Left",
    description: "Single object positioned on the left third of the image",
    prompt: "A red ball on a green field",
    widgetState: {
      spatialRegions: [
        { id: "ball", label: "red ball", x: 0.05, y: 0.3, width: 0.25, height: 0.4, depth: 0.8 },
      ],
    },
    widgetInstructions: [
      { widget: "Spatial Position", instruction: "The red ball should be on the LEFT side of the image (left third)" },
    ],
    tags: ["spatial"],
  },
  {
    id: "spatial-right",
    name: "Spatial: Object on Right",
    description: "Single object positioned on the right third of the image",
    prompt: "A blue vase on a wooden table",
    widgetState: {
      spatialRegions: [
        { id: "vase", label: "blue vase", x: 0.7, y: 0.2, width: 0.25, height: 0.6, depth: 0.7 },
      ],
    },
    widgetInstructions: [
      { widget: "Spatial Position", instruction: "The blue vase should be on the RIGHT side of the image (right third)" },
    ],
    tags: ["spatial"],
  },
  {
    id: "spatial-two-objects",
    name: "Spatial: Two Objects Left & Right",
    description: "Two objects positioned on opposite sides",
    prompt: "A cat and a dog sitting on grass",
    widgetState: {
      spatialRegions: [
        { id: "cat", label: "cat", x: 0.05, y: 0.3, width: 0.3, height: 0.5, depth: 0.7 },
        { id: "dog", label: "dog", x: 0.65, y: 0.3, width: 0.3, height: 0.5, depth: 0.7 },
      ],
    },
    widgetInstructions: [
      { widget: "Spatial Position", instruction: "The cat should be on the LEFT side and the dog on the RIGHT side of the image" },
    ],
    tags: ["spatial"],
  },
  {
    id: "spatial-depth-layers",
    name: "Spatial: Foreground/Background Depth",
    description: "Object in foreground should appear closer, background object further away",
    prompt: "A tree and mountains in a landscape",
    widgetState: {
      spatialRegions: [
        { id: "tree", label: "tree", x: 0.1, y: 0.1, width: 0.3, height: 0.8, depth: 0.9 },
        { id: "mountains", label: "mountains", x: 0.0, y: 0.0, width: 1.0, height: 0.5, depth: 0.1 },
      ],
    },
    widgetInstructions: [
      { widget: "Spatial Position", instruction: "The tree should appear in the FOREGROUND (closer, larger) and mountains in the BACKGROUND (farther away)" },
    ],
    tags: ["spatial"],
  },
  {
    id: "spatial-center-large",
    name: "Spatial: Large Centered Object",
    description: "One large centered object dominating the frame",
    prompt: "A sunflower",
    widgetState: {
      spatialRegions: [
        { id: "sunflower", label: "sunflower", x: 0.15, y: 0.1, width: 0.7, height: 0.8, depth: 0.9 },
      ],
    },
    widgetInstructions: [
      { widget: "Spatial Position", instruction: "The sunflower should be CENTERED and LARGE, filling most of the frame" },
    ],
    tags: ["spatial"],
  },
  {
    id: "spatial-small-corner",
    name: "Spatial: Small Object in Corner",
    description: "Small object positioned in bottom-right corner",
    prompt: "A ladybug on a leaf",
    widgetState: {
      spatialRegions: [
        { id: "ladybug", label: "ladybug", x: 0.7, y: 0.7, width: 0.15, height: 0.15, depth: 0.9 },
      ],
    },
    widgetInstructions: [
      { widget: "Spatial Position", instruction: "The ladybug should be SMALL and in the BOTTOM-RIGHT corner of the image" },
    ],
    tags: ["spatial"],
  },

  // ===== COLOR TESTS =====
  {
    id: "color-red-dress",
    name: "Color: Red Dress",
    description: "Verify specific color assignment to an object",
    prompt: "A woman in a dress standing in a garden",
    widgetState: {
      colorSelections: [{ hex: "#DC143C", name: "Crimson", target: "dress" }],
    },
    widgetInstructions: [
      { widget: "Color", instruction: "The woman's dress should be CRIMSON RED (#DC143C), not any other color" },
    ],
    tags: ["color"],
  },
  {
    id: "color-blue-car",
    name: "Color: Blue Car",
    description: "Verify blue color on a vehicle",
    prompt: "A sports car parked on a street",
    widgetState: {
      colorSelections: [{ hex: "#4169E1", name: "Royal Blue", target: "sports car" }],
    },
    widgetInstructions: [
      { widget: "Color", instruction: "The sports car should be ROYAL BLUE (#4169E1)" },
    ],
    tags: ["color"],
  },
  {
    id: "color-multiple",
    name: "Color: Two Different Colors",
    description: "Two objects with distinct specified colors",
    prompt: "A house with a door and a roof",
    widgetState: {
      colorSelections: [
        { hex: "#228B22", name: "Forest Green", target: "door" },
        { hex: "#DC143C", name: "Crimson", target: "roof" },
      ],
    },
    widgetInstructions: [
      { widget: "Color", instruction: "The door should be FOREST GREEN and the roof should be CRIMSON RED" },
    ],
    tags: ["color"],
  },
  {
    id: "color-golden",
    name: "Color: Golden Tones",
    description: "Warm golden color on a specific element",
    prompt: "A crown on a velvet cushion",
    widgetState: {
      colorSelections: [{ hex: "#FFD700", name: "Gold", target: "crown" }],
    },
    widgetInstructions: [
      { widget: "Color", instruction: "The crown should be GOLD colored (#FFD700)" },
    ],
    tags: ["color"],
  },

  // ===== CAMERA ANGLE TESTS =====
  {
    id: "camera-birds-eye",
    name: "Camera: Bird's Eye View",
    description: "Shot from directly above looking down",
    prompt: "A person sitting at a cafe table with coffee and pastries",
    widgetState: {
      cameraSettings: { elevation: 85, azimuth: 0, focalLength: 24, distance: 1 },
    },
    widgetInstructions: [
      { widget: "Camera Angle", instruction: "Shot should be from DIRECTLY ABOVE (bird's eye view), looking straight down at the table" },
    ],
    tags: ["camera"],
  },
  {
    id: "camera-low-angle",
    name: "Camera: Low Angle",
    description: "Camera positioned low looking upward",
    prompt: "A tall skyscraper reaching into the sky",
    widgetState: {
      cameraSettings: { elevation: -60, azimuth: 0, focalLength: 20, distance: 1 },
    },
    widgetInstructions: [
      { widget: "Camera Angle", instruction: "Shot should be from a VERY LOW ANGLE (worm's eye view), looking UP at the skyscraper with exaggerated perspective" },
    ],
    tags: ["camera"],
  },
  {
    id: "camera-telephoto",
    name: "Camera: Telephoto Compression",
    description: "Telephoto lens with compressed perspective",
    prompt: "A row of colorful houses on a street",
    widgetState: {
      cameraSettings: { elevation: 5, azimuth: 0, focalLength: 150, distance: 2 },
    },
    widgetInstructions: [
      { widget: "Camera Angle", instruction: "Image should show TELEPHOTO COMPRESSION where the houses appear stacked/flattened together, with shallow depth of field" },
    ],
    tags: ["camera"],
  },
  {
    id: "camera-wide-angle",
    name: "Camera: Ultra Wide Angle",
    description: "Ultra wide angle with exaggerated perspective",
    prompt: "A long hallway in an old building",
    widgetState: {
      cameraSettings: { elevation: 0, azimuth: 0, focalLength: 14, distance: 1 },
    },
    widgetInstructions: [
      { widget: "Camera Angle", instruction: "Image should show ULTRA WIDE ANGLE perspective with exaggerated depth and converging lines in the hallway" },
    ],
    tags: ["camera"],
  },
  {
    id: "camera-side-view",
    name: "Camera: Side Profile View",
    description: "Camera positioned at 90 degree azimuth for side shot",
    prompt: "A person walking down the street",
    widgetState: {
      cameraSettings: { elevation: 0, azimuth: 90, focalLength: 85, distance: 1 },
    },
    widgetInstructions: [
      { widget: "Camera Angle", instruction: "The person should be seen from the SIDE (profile view), shot from the RIGHT SIDE" },
    ],
    tags: ["camera"],
  },
  {
    id: "camera-behind",
    name: "Camera: Shot from Behind",
    description: "Camera positioned behind the subject",
    prompt: "A hiker looking at a mountain vista",
    widgetState: {
      cameraSettings: { elevation: 5, azimuth: 180, focalLength: 28, distance: 1.5 },
    },
    widgetInstructions: [
      { widget: "Camera Angle", instruction: "We should see the hiker from BEHIND (rear view), facing away from camera, looking at the mountains" },
    ],
    tags: ["camera"],
  },

  // ===== ART STYLE TESTS =====
  {
    id: "style-watercolor",
    name: "Style: Watercolor",
    description: "Image should look like a watercolor painting",
    prompt: "A garden with flowers and butterflies",
    widgetState: {
      styleSelection: { styleName: "Watercolor", strength: 0.9 },
    },
    widgetInstructions: [
      { widget: "Art Style", instruction: "Image should clearly look like a WATERCOLOR painting with soft, blended, translucent brush strokes and visible paper texture" },
    ],
    tags: ["style"],
  },
  {
    id: "style-anime",
    name: "Style: Anime",
    description: "Image should look like anime/manga art",
    prompt: "A warrior with a sword standing on a cliff",
    widgetState: {
      styleSelection: { styleName: "Anime", strength: 0.9 },
    },
    widgetInstructions: [
      { widget: "Art Style", instruction: "Image should clearly be in ANIME style with characteristic big eyes, cel-shading, and bold outlines" },
    ],
    tags: ["style"],
  },
  {
    id: "style-pixel-art",
    name: "Style: Pixel Art",
    description: "Image should look like pixel art / 8-bit",
    prompt: "A castle on a hill with a dragon flying above",
    widgetState: {
      styleSelection: { styleName: "Pixel Art", strength: 0.9 },
    },
    widgetInstructions: [
      { widget: "Art Style", instruction: "Image should clearly be in PIXEL ART style with visible pixels, limited color palette, retro 8-bit aesthetic" },
    ],
    tags: ["style"],
  },
  {
    id: "style-oil-painting",
    name: "Style: Oil Painting",
    description: "Image should look like classical oil painting",
    prompt: "A still life with fruit, wine glass, and flowers",
    widgetState: {
      styleSelection: { styleName: "Oil Painting", strength: 0.85 },
    },
    widgetInstructions: [
      { widget: "Art Style", instruction: "Image should look like a classical OIL PAINTING with visible brush strokes, rich color depth, and painterly texture" },
    ],
    tags: ["style"],
  },
  {
    id: "style-cinematic",
    name: "Style: Cinematic",
    description: "Image should have cinematic film look",
    prompt: "A detective in a dark alley at night",
    widgetState: {
      styleSelection: { styleName: "Cinematic", strength: 0.85 },
    },
    widgetInstructions: [
      { widget: "Art Style", instruction: "Image should have a CINEMATIC look with dramatic lighting, film grain, color grading, and movie-like composition" },
    ],
    tags: ["style"],
  },

  // ===== COMBINED TESTS =====
  {
    id: "combined-spatial-color",
    name: "Combined: Spatial + Color",
    description: "Position control + specific colors together",
    prompt: "A red ball and a blue cube on a table",
    widgetState: {
      spatialRegions: [
        { id: "ball", label: "red ball", x: 0.05, y: 0.3, width: 0.3, height: 0.4, depth: 0.8 },
        { id: "cube", label: "blue cube", x: 0.65, y: 0.3, width: 0.3, height: 0.4, depth: 0.8 },
      ],
      colorSelections: [
        { hex: "#FF0000", name: "Red", target: "ball" },
        { hex: "#0000FF", name: "Blue", target: "cube" },
      ],
    },
    widgetInstructions: [
      { widget: "Spatial Position", instruction: "Ball on the LEFT, cube on the RIGHT" },
      { widget: "Color", instruction: "Ball is RED and cube is BLUE" },
    ],
    tags: ["combined", "spatial", "color"],
  },
  {
    id: "combined-spatial-camera",
    name: "Combined: Spatial + Camera",
    description: "Position control + camera angle together",
    prompt: "A tower in a cityscape",
    widgetState: {
      spatialRegions: [
        { id: "tower", label: "tower", x: 0.35, y: 0.0, width: 0.3, height: 0.9, depth: 0.9 },
      ],
      cameraSettings: { elevation: -45, azimuth: 0, focalLength: 24, distance: 1 },
    },
    widgetInstructions: [
      { widget: "Spatial Position", instruction: "Tower should be CENTERED and tall, filling most of the vertical frame" },
      { widget: "Camera Angle", instruction: "Shot from LOW ANGLE looking up with wide angle perspective" },
    ],
    tags: ["combined", "spatial", "camera"],
  },
  {
    id: "combined-color-style",
    name: "Combined: Color + Style",
    description: "Specific color + art style together",
    prompt: "A rose in a vase",
    widgetState: {
      colorSelections: [{ hex: "#DC143C", name: "Crimson", target: "rose" }],
      styleSelection: { styleName: "Watercolor", strength: 0.85 },
    },
    widgetInstructions: [
      { widget: "Color", instruction: "The rose should be CRIMSON RED" },
      { widget: "Art Style", instruction: "Image should be in WATERCOLOR style" },
    ],
    tags: ["combined", "color", "style"],
  },
  {
    id: "combined-camera-style",
    name: "Combined: Camera + Style",
    description: "Camera angle + art style together",
    prompt: "A cityscape with tall buildings",
    widgetState: {
      cameraSettings: { elevation: 85, azimuth: 0, focalLength: 24, distance: 1 },
      styleSelection: { styleName: "Pixel Art", strength: 0.9 },
    },
    widgetInstructions: [
      { widget: "Camera Angle", instruction: "Shot should be from BIRD'S EYE VIEW (directly above)" },
      { widget: "Art Style", instruction: "Image should be in PIXEL ART style" },
    ],
    tags: ["combined", "camera", "style"],
  },
  {
    id: "combined-all-four",
    name: "Combined: ALL Four Widgets",
    description: "All four widget types active simultaneously",
    prompt: "A knight and a dragon in a field",
    widgetState: {
      spatialRegions: [
        { id: "knight", label: "knight", x: 0.05, y: 0.2, width: 0.3, height: 0.7, depth: 0.9 },
        { id: "dragon", label: "dragon", x: 0.55, y: 0.0, width: 0.4, height: 0.8, depth: 0.5 },
      ],
      colorSelections: [
        { hex: "#C0C0C0", name: "Silver", target: "knight armor" },
        { hex: "#DC143C", name: "Crimson", target: "dragon" },
      ],
      cameraSettings: { elevation: -20, azimuth: 0, focalLength: 28, distance: 1.5 },
      styleSelection: { styleName: "Fantasy", strength: 0.85 },
    },
    widgetInstructions: [
      { widget: "Spatial Position", instruction: "Knight on the LEFT in foreground, dragon on the RIGHT in mid-ground" },
      { widget: "Color", instruction: "Knight in SILVER armor, dragon is CRIMSON RED" },
      { widget: "Camera Angle", instruction: "Slightly LOW ANGLE with wide angle lens" },
      { widget: "Art Style", instruction: "Image should be in FANTASY illustration style" },
    ],
    tags: ["combined", "spatial", "color", "camera", "style"],
  },
  {
    id: "combined-all-landscape",
    name: "Combined: ALL Four - Landscape",
    description: "All widgets in a landscape scene",
    prompt: "A lighthouse on a cliff overlooking the ocean",
    widgetState: {
      spatialRegions: [
        { id: "lighthouse", label: "lighthouse", x: 0.6, y: 0.0, width: 0.2, height: 0.7, depth: 0.8 },
        { id: "ocean", label: "ocean", x: 0.0, y: 0.5, width: 1.0, height: 0.5, depth: 0.2 },
      ],
      colorSelections: [
        { hex: "#FFFFFF", name: "White", target: "lighthouse" },
        { hex: "#006994", name: "Deep Ocean Blue", target: "ocean" },
      ],
      cameraSettings: { elevation: 15, azimuth: 0, focalLength: 35, distance: 2 },
      styleSelection: { styleName: "Cinematic", strength: 0.8 },
    },
    widgetInstructions: [
      { widget: "Spatial Position", instruction: "Lighthouse on the RIGHT side in foreground, ocean spanning the bottom" },
      { widget: "Color", instruction: "WHITE lighthouse and DEEP BLUE ocean" },
      { widget: "Camera Angle", instruction: "Slightly elevated angle with wide angle framing" },
      { widget: "Art Style", instruction: "CINEMATIC style with dramatic lighting" },
    ],
    tags: ["combined", "spatial", "color", "camera", "style"],
  },
  {
    id: "combined-three-no-spatial",
    name: "Combined: Color + Camera + Style",
    description: "Three text-enrichment widgets without ControlNet",
    prompt: "A vintage car on a mountain road",
    widgetState: {
      colorSelections: [{ hex: "#DC143C", name: "Crimson Red", target: "car" }],
      cameraSettings: { elevation: -10, azimuth: 30, focalLength: 50, distance: 1 },
      styleSelection: { styleName: "Cinematic", strength: 0.85 },
    },
    widgetInstructions: [
      { widget: "Color", instruction: "The car should be CRIMSON RED" },
      { widget: "Camera Angle", instruction: "Slightly LOW ANGLE, shot from slightly to the RIGHT" },
      { widget: "Art Style", instruction: "CINEMATIC style with film-like quality" },
    ],
    tags: ["combined", "color", "camera", "style"],
  },
];

export function getTestsByTag(tag: string): TestCase[] {
  return TEST_CASES.filter(tc => tc.tags.includes(tag));
}
