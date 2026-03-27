"""FLUX pipeline wrapper with ControlNet + Regional Prompting + IP-Adapter.

Encapsulates model loading and inference with ablation flag support.
"""

import torch
import time
import base64
import io
import logging
from PIL import Image
from pathlib import Path
from typing import Optional

from config import (
    FLUX_MODEL_ID, CONTROLNET_MODEL_ID, IP_ADAPTER_MODEL_ID,
    CONTROLNET_MODE_CANNY, CONTROLNET_MODE_DEPTH,
    DEFAULT_DEPTH_SCALE, DEFAULT_CANNY_SCALE, DEFAULT_IP_ADAPTER_SCALE,
    DEFAULT_BASE_RATIO, DEFAULT_MASK_INJECT_STEPS,
    DEFAULT_NUM_STEPS, DEFAULT_GUIDANCE_SCALE,
    MODELS_DIR,
)
from conditioning import (
    render_depth_map, render_canny_map,
    render_region_mask, render_background_mask,
)

logger = logging.getLogger(__name__)


def decode_base64_image(b64: str) -> Image.Image:
    """Decode a base64 string (with or without data: prefix) to PIL Image."""
    if "," in b64:
        b64 = b64.split(",", 1)[1]
    return Image.open(io.BytesIO(base64.b64decode(b64))).convert("RGB")


def decode_base64_mask(b64: str) -> Image.Image:
    """Decode a base64 string to a grayscale PIL Image (mask)."""
    if "," in b64:
        b64 = b64.split(",", 1)[1]
    return Image.open(io.BytesIO(base64.b64decode(b64))).convert("L")


def encode_image_base64(img: Image.Image, format: str = "PNG") -> str:
    """Encode a PIL Image to base64 string."""
    buf = io.BytesIO()
    img.save(buf, format=format)
    return base64.b64encode(buf.getvalue()).decode("utf-8")


class FluxPipeline:
    """Wrapper around FLUX.1-dev with multi-signal conditioning."""

    def __init__(self):
        self.pipe = None
        self.ip_adapter_loaded = False

    def load(self):
        """Load all models. Call once during @modal.enter()."""
        import os
        from huggingface_hub import login
        from diffusers import FluxControlNetPipeline, FluxControlNetModel

        # Authenticate with HuggingFace for gated model access
        hf_token = os.environ.get("HF_TOKEN")
        if hf_token:
            login(token=hf_token)
            logger.info("Authenticated with HuggingFace")

        logger.info("Loading ControlNet Union Pro 2.0...")
        controlnet = FluxControlNetModel.from_pretrained(
            CONTROLNET_MODEL_ID,
            torch_dtype=torch.bfloat16,
            cache_dir=MODELS_DIR,
        )

        logger.info("Loading FLUX.1-dev base model...")
        self.pipe = FluxControlNetPipeline.from_pretrained(
            FLUX_MODEL_ID,
            controlnet=controlnet,
            torch_dtype=torch.bfloat16,
            cache_dir=MODELS_DIR,
        )
        self.pipe.to("cuda")

        # Try to enable regional prompting via InstantX attention processor
        try:
            self._enable_regional_prompting()
            self.regional_available = True
            logger.info("Regional prompting enabled")
        except Exception as e:
            self.regional_available = False
            logger.warning(f"Regional prompting not available: {e}")

        logger.info("Pipeline loaded successfully")

    def _enable_regional_prompting(self):
        """Attempt to load InstantX RegionalFluxAttnProcessor2_0.

        This replaces default attention processors with region-aware ones.
        Falls back gracefully if the custom processor isn't available.
        """
        try:
            # Try importing from the InstantX regional prompting package
            from regional_flux import RegionalFluxAttnProcessor2_0
            # Replace attention processors
            attn_procs = {}
            for name in self.pipe.transformer.attn_processors.keys():
                attn_procs[name] = RegionalFluxAttnProcessor2_0()
            self.pipe.transformer.set_attn_processor(attn_procs)
        except ImportError:
            # Fallback: regional prompting will be handled via manual
            # attention mask injection during inference
            logger.info("InstantX regional processor not found, using mask-based fallback")
            raise

    def generate(
        self,
        prompt: str,
        # Conditioning images (pre-rendered or will be rendered from structured data)
        depth_map: Optional[Image.Image] = None,
        canny_map: Optional[Image.Image] = None,
        region_masks: Optional[list[Image.Image]] = None,
        region_prompts: Optional[list[str]] = None,
        style_reference: Optional[Image.Image] = None,
        # Scales
        depth_scale: float = DEFAULT_DEPTH_SCALE,
        canny_scale: float = DEFAULT_CANNY_SCALE,
        base_ratio: float = DEFAULT_BASE_RATIO,
        style_strength: float = DEFAULT_IP_ADAPTER_SCALE,
        # Ablation flags
        enable_controlnet: bool = True,
        enable_regional: bool = True,
        enable_ip_adapter: bool = False,
        # Generation params
        num_inference_steps: int = DEFAULT_NUM_STEPS,
        guidance_scale: float = DEFAULT_GUIDANCE_SCALE,
        width: int = 1024,
        height: int = 1024,
        seed: Optional[int] = None,
    ) -> dict:
        """Run the full pipeline with all conditioning signals.

        Returns dict with image, seed, timing, and pipeline info.
        """
        start_time = time.time()
        generator = torch.Generator("cuda")
        if seed is not None:
            generator.manual_seed(seed)
        else:
            seed = generator.seed()

        # Build kwargs for the pipeline call
        kwargs = {
            "prompt": prompt,
            "num_inference_steps": num_inference_steps,
            "guidance_scale": guidance_scale,
            "width": width,
            "height": height,
            "generator": generator,
        }

        pipeline_parts = ["FLUX.1-dev"]
        conditioning_used = []

        # ControlNet conditioning
        # FluxControlNetPipeline ALWAYS requires a control_image.
        if enable_controlnet and depth_map:
            control_img = depth_map.resize((width, height), Image.LANCZOS)
            # Log depth map stats to verify it's not blank
            import numpy as np
            arr = np.array(control_img)
            print(f"[ControlNet] Depth map: size={control_img.size}, min={arr.min()}, max={arr.max()}, mean={arr.mean():.1f}, scale={depth_scale}", flush=True)
            kwargs["control_image"] = control_img
            kwargs["control_mode"] = CONTROLNET_MODE_DEPTH
            kwargs["controlnet_conditioning_scale"] = depth_scale
            conditioning_used.append({"label": "Depth Map", "type": "depth"})
            pipeline_parts.append(f"ControlNet(depth, scale={depth_scale})")
        elif enable_controlnet and canny_map:
            control_img = canny_map.resize((width, height), Image.LANCZOS)
            kwargs["control_image"] = control_img
            kwargs["control_mode"] = CONTROLNET_MODE_CANNY
            kwargs["controlnet_conditioning_scale"] = canny_scale
            conditioning_used.append({"label": "Canny Edges", "type": "canny"})
            pipeline_parts.append(f"ControlNet(canny, scale={canny_scale})")
        else:
            # No conditioning — use neutral gray with zero scale
            neutral = Image.new("RGB", (width, height), (128, 128, 128))
            kwargs["control_image"] = neutral
            kwargs["control_mode"] = CONTROLNET_MODE_DEPTH
            kwargs["controlnet_conditioning_scale"] = 0.0
            print("[ControlNet] No control image — using neutral placeholder (scale=0)", flush=True)

        # Regional prompting — enrich the global prompt with per-region descriptions
        # (Full attention-based regional prompting requires InstantX custom pipeline,
        # which will be added in Phase 2. For now, inject region info into text prompt.)
        if enable_regional and region_prompts:
            region_desc = "; ".join(region_prompts)
            kwargs["prompt"] = f"{prompt}. Scene layout: {region_desc}"
            pipeline_parts.append(f"Regional-text({len(region_prompts)} regions)")
            for rp in region_prompts:
                label = rp[:30] + "..." if len(rp) > 30 else rp
                conditioning_used.append({"label": f"Region: {label}", "type": "regional_mask"})

        # IP-Adapter (Phase 2)
        if enable_ip_adapter and style_reference and self.ip_adapter_loaded:
            kwargs["ip_adapter_image"] = style_reference
            kwargs["ip_adapter_scale"] = style_strength
            pipeline_parts.append("IP-Adapter")
            conditioning_used.append({"label": "Style Reference", "type": "style_ref"})

        # Run inference
        logger.info(f"Generating: {' + '.join(pipeline_parts)}")
        result = self.pipe(**kwargs)
        image = result.images[0]

        elapsed_ms = int((time.time() - start_time) * 1000)
        pipeline_info = " + ".join(pipeline_parts)

        logger.info(f"Generated in {elapsed_ms}ms via {pipeline_info}")

        return {
            "image": image,
            "seed": seed,
            "pipeline_info": pipeline_info,
            "generation_time_ms": elapsed_ms,
            "conditioning_used": conditioning_used,
        }
