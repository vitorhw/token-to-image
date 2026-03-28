export type TokenCategory =
  | "spatial_position"
  | "spatial_size"
  | "spatial_depth"
  | "color"
  | "style"
  | "pose"
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
  rotation: number; // degrees, 0-360
}

export interface ColorSelection {
  hex: string;
  name: string;
  target: string;
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
  exemplarUrls: string[];
  styleName: string;
  strength: number;
  selectedReferences: string[]; // concept names chosen by user
}

export interface MaskRegion {
  dataUrl: string;
  editPrompt: string;
}

export interface WidgetState {
  spatialRegions?: SpatialRegion[];
  colorSelections?: ColorSelection[];
  poseSelection?: PoseSelection;
  styleSelection?: StyleSelection;
  maskRegion?: MaskRegion;
  depthMapDataUrl?: string;
  poseImageDataUrl?: string;
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
