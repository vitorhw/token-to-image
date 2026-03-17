export type TokenCategory =
  | "spatial_position"
  | "spatial_size"
  | "spatial_depth"
  | "color"
  | "camera_angle"
  | "style"
  | "pose"
  | "lighting"
  | "masking";

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

export interface PoseKeypoint {
  name: string;
  x: number;
  y: number;
  confidence: number;
}

export interface PoseSelection {
  keypoints: PoseKeypoint[];
  sourceName: string;
}

export interface StyleSelection {
  exemplarUrl: string;
  styleName: string;
  strength: number;
}

export interface LightSource {
  id: string;
  x: number;
  y: number;
  intensity: number;
  colorTemp: number;
  type: "key" | "fill" | "rim" | "ambient";
}

export interface LightingSettings {
  lights: LightSource[];
  description: string;
}

export interface MaskRegion {
  dataUrl: string;
  editPrompt: string;
}

export interface WidgetState {
  spatialRegions?: SpatialRegion[];
  colorSelections?: ColorSelection[];
  cameraSettings?: CameraSettings;
  poseSelection?: PoseSelection;
  styleSelection?: StyleSelection;
  lightingSettings?: LightingSettings;
  maskRegion?: MaskRegion;
  depthMapDataUrl?: string;
  poseImageDataUrl?: string;
  lightingMapDataUrl?: string;
}

export interface ConditioningImage {
  label: string;
  url: string; // fal storage URL or data URL
  type: "depth" | "pose" | "style" | "mask";
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
