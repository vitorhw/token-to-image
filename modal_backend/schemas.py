"""Pydantic request/response models for the Modal backend API."""

from pydantic import BaseModel, Field
from typing import Optional


class SpatialRegion(BaseModel):
    id: str
    label: str
    x: float = Field(ge=0, le=1)
    y: float = Field(ge=0, le=1)
    width: float = Field(gt=0, le=1)
    height: float = Field(gt=0, le=1)
    depth: float = Field(ge=0, le=1)


class ModalRegion(BaseModel):
    mask: str       # base64 PNG binary mask
    prompt: str     # per-region focused text


class ControlNetScales(BaseModel):
    depth: float = 0.45
    canny: float = 0.3


class ConditioningRequest(BaseModel):
    depth_map: Optional[str] = None       # base64 PNG
    canny_map: Optional[str] = None       # base64 PNG
    regions: Optional[list[ModalRegion]] = None
    base_ratio: float = 0.2
    style_reference: Optional[str] = None  # base64 PNG
    style_strength: float = 0.6
    controlnet_scales: ControlNetScales = ControlNetScales()


class GenerateRequest(BaseModel):
    prompt: str
    conditioning: ConditioningRequest = ConditioningRequest()

    # Ablation flags
    enable_controlnet: bool = True
    enable_regional: bool = True
    enable_ip_adapter: bool = False

    # Generation parameters
    seed: Optional[int] = None
    num_inference_steps: int = 28
    guidance_scale: float = 3.5
    width: int = 1024
    height: int = 1024


class ConditioningImageInfo(BaseModel):
    label: str
    type: str  # "depth", "canny", "regional_mask", "style_ref"


class GenerateResponse(BaseModel):
    image_base64: str
    seed: int
    enriched_prompt: str
    pipeline_info: str
    generation_time_ms: int
    conditioning_used: list[ConditioningImageInfo]
    ablation: dict
