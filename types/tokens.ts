export type TokenCategory =
  | "spatial_position"
  | "spatial_size"
  | "spatial_depth"
  | "color"
  | "camera_angle"
  | "style";

export interface DetectedToken {
  text: string;
  startIndex: number;
  endIndex: number;
  category: TokenCategory;
  subcategory: string;
  underspecification: string;
  suggestedWidget: string;
}

export interface SpatialRegion {
  id: string;
  label: string;
  x: number;
  y: number;
  width: number;
  height: number;
  depth: number;
}

export interface ColorSelection {
  hex: string;
  name: string;
  target: string;
}

export interface CameraSettings {
  elevation: number;
  azimuth: number;
  focalLength: number;
  distance: number;
}

export interface StyleSelection {
  styleName: string;
  strength: number;
}

export interface WidgetState {
  spatialRegions?: SpatialRegion[];
  colorSelections?: ColorSelection[];
  cameraSettings?: CameraSettings;
  styleSelection?: StyleSelection;
  depthMapDataUrl?: string;
  segMapDataUrl?: string; // Color-coded segmentation map for spatial layout (position + size)
}

export interface ConditioningImage {
  label: string;
  url: string; // fal storage URL or data URL
  type: "depth" | "segmentation";
}

export interface GenerationResult {
  imageUrl: string;
  provider: "gemini" | "fal";
  pipeline: string;
  timestamp: number;
  enrichedPrompt?: string;
  conditioningImages?: ConditioningImage[];
}

export interface AppState {
  prompt: string;
  detectedTokens: DetectedToken[];
  widgetState: WidgetState;
  generationHistory: GenerationResult[];
  currentImage: GenerationResult | null;
  isDetecting: boolean;
  isGenerating: boolean;
  activeWidget: TokenCategory | null;
}
