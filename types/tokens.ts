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
  segMapDataUrl?: string;
  cannyMapDataUrl?: string;
  styleReferenceDataUrl?: string;
  regionMasks?: Array<{
    regionId: string;
    maskDataUrl: string;
    prompt: string;
  }>;
}

export interface ConditioningImage {
  label: string;
  url: string;
  type: "depth" | "segmentation" | "canny" | "mask" | "style_reference";
}

export interface GenerationResult {
  imageUrl: string;
  provider: "gemini" | "fal" | "modal";
  pipeline: string;
  timestamp: number;
  enrichedPrompt?: string;
  conditioningImages?: ConditioningImage[];
  seed?: number;
}

// Modal backend types
export interface ModalRegion {
  mask: string;    // base64 PNG (no data: prefix)
  prompt: string;  // per-region focused text
}

export interface ModalConditioningRequest {
  depth_map?: string;
  canny_map?: string;
  regions?: ModalRegion[];
  base_ratio?: number;
  style_reference?: string;
  style_strength?: number;
  controlnet_scales?: {
    depth?: number;
    canny?: number;
  };
}

export interface ModalGenerateRequest {
  prompt: string;
  conditioning: ModalConditioningRequest;
  enable_controlnet?: boolean;
  enable_regional?: boolean;
  enable_ip_adapter?: boolean;
  seed?: number;
  num_inference_steps?: number;
  guidance_scale?: number;
  width?: number;
  height?: number;
}

export interface ModalGenerateResponse {
  image_base64: string;
  seed: number;
  pipeline_info: string;
  generation_time_ms: number;
  conditioning_used?: Array<{ label: string; type: string }>;
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
