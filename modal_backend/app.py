"""Modal.com app for the Tokens-to-Image GPU backend.

Deploys FLUX.1-dev with ControlNet Union + Regional Prompting + IP-Adapter
as a serverless GPU endpoint.

Deploy: modal deploy modal_backend/app.py
Test:   modal serve modal_backend/app.py  (local dev with hot reload)
"""

import modal
import logging

from config import MODELS_DIR, MODELS_VOLUME_NAME, CONTAINER_IDLE_TIMEOUT

logger = logging.getLogger(__name__)

# Modal infrastructure
volume = modal.Volume.from_name(MODELS_VOLUME_NAME, create_if_missing=True)

image = (
    modal.Image.debian_slim(python_version="3.11")
    .pip_install(
        "torch==2.6.0",
        "diffusers==0.33.1",
        "transformers==4.48.0",
        "accelerate==0.34.2",
        "safetensors>=0.4.4",
        "sentencepiece>=0.2.0",
        "protobuf>=5.28.0",
        "fastapi>=0.115.0",
        "pydantic>=2.9.0",
        "Pillow>=10.4.0",
        "numpy>=1.26.0",
        "huggingface_hub>=0.25.0",
    )
    .add_local_file("modal_backend/config.py", "/root/config.py", copy=True)
    .add_local_file("modal_backend/schemas.py", "/root/schemas.py", copy=True)
    .add_local_file("modal_backend/conditioning.py", "/root/conditioning.py", copy=True)
    .add_local_file("modal_backend/pipeline.py", "/root/pipeline.py", copy=True)
)

app = modal.App("tokens-image-backend", image=image)


@app.cls(
    gpu="A100-40GB",
    volumes={MODELS_DIR: volume},
    secrets=[modal.Secret.from_name("huggingface")],
    timeout=300,
    scaledown_window=CONTAINER_IDLE_TIMEOUT,
)
class FluxGenerator:
    """Serverless FLUX generator with multi-signal conditioning."""

    @modal.enter()
    def startup(self):
        """Load all models once per container start."""
        from pipeline import FluxPipeline
        self.pipeline = FluxPipeline()
        self.pipeline.load()
        volume.commit()  # Persist any newly downloaded models
        logger.info("FluxGenerator ready")

    @modal.method()
    def generate(self, request_dict: dict) -> dict:
        """Process a generation request and return results."""
        from schemas import GenerateRequest, GenerateResponse, ConditioningImageInfo
        from pipeline import (
            decode_base64_image, decode_base64_mask, encode_image_base64,
        )
        from conditioning import (
            render_depth_map, render_canny_map,
            render_region_mask, render_background_mask,
        )

        request = GenerateRequest(**request_dict)
        cond = request.conditioning

        # Log what conditioning we received
        print(f"[app] Conditioning fields: depth_map={'yes' if cond.depth_map else 'no'} ({len(cond.depth_map) if cond.depth_map else 0} chars), "
              f"canny_map={'yes' if cond.canny_map else 'no'}, "
              f"regions={len(cond.regions) if cond.regions else 0}, "
              f"scales=depth:{cond.controlnet_scales.depth}/canny:{cond.controlnet_scales.canny}", flush=True)

        # Decode or render conditioning images
        depth_map = None
        canny_map = None
        region_masks = None
        region_prompts = None
        style_ref = None

        if cond.depth_map:
            depth_map = decode_base64_image(cond.depth_map)
            print(f"[app] Decoded depth map: {depth_map.size}, mode={depth_map.mode}", flush=True)

        if cond.canny_map:
            canny_map = decode_base64_image(cond.canny_map)
            print(f"[app] Decoded canny map: {canny_map.size}, mode={canny_map.mode}", flush=True)

        # Regional prompting: decode masks and extract prompts
        if cond.regions and len(cond.regions) > 0:
            region_masks = [decode_base64_mask(r.mask) for r in cond.regions]
            region_prompts = [r.prompt for r in cond.regions]

        # Style reference
        if cond.style_reference:
            style_ref = decode_base64_image(cond.style_reference)

        # Run pipeline
        result = self.pipeline.generate(
            prompt=request.prompt,
            depth_map=depth_map,
            canny_map=canny_map,
            region_masks=region_masks,
            region_prompts=region_prompts,
            style_reference=style_ref,
            depth_scale=cond.controlnet_scales.depth,
            canny_scale=cond.controlnet_scales.canny,
            base_ratio=cond.base_ratio,
            style_strength=cond.style_strength,
            enable_controlnet=request.enable_controlnet,
            enable_regional=request.enable_regional,
            enable_ip_adapter=request.enable_ip_adapter,
            num_inference_steps=request.num_inference_steps,
            guidance_scale=request.guidance_scale,
            width=request.width,
            height=request.height,
            seed=request.seed,
        )

        # Encode output image
        image_b64 = encode_image_base64(result["image"])

        return GenerateResponse(
            image_base64=image_b64,
            seed=result["seed"],
            enriched_prompt=request.prompt,
            pipeline_info=result["pipeline_info"],
            generation_time_ms=result["generation_time_ms"],
            conditioning_used=[
                ConditioningImageInfo(**c) for c in result["conditioning_used"]
            ],
            ablation={
                "enable_controlnet": request.enable_controlnet,
                "enable_regional": request.enable_regional,
                "enable_ip_adapter": request.enable_ip_adapter,
            },
        ).model_dump()

    @modal.asgi_app()
    def api(self):
        from fastapi import FastAPI, HTTPException
        from schemas import GenerateRequest

        web_app = FastAPI(title="Tokens-to-Image Backend")

        @web_app.get("/health")
        async def health():
            return {"status": "ok", "pipeline_loaded": self.pipeline.pipe is not None}

        @web_app.post("/generate")
        async def generate(request: GenerateRequest):
            try:
                result = self.generate.local(request.model_dump())
                return result
            except Exception as e:
                logger.error(f"Generation failed: {e}", exc_info=True)
                raise HTTPException(status_code=500, detail=str(e))

        return web_app


@app.local_entrypoint()
def main():
    """Quick test: generate a simple image."""
    print("Testing FluxGenerator...")
    generator = FluxGenerator()
    result = generator.generate.remote({
        "prompt": "a red ball on a green field",
        "conditioning": {},
        "width": 512,
        "height": 512,
        "num_inference_steps": 4,
    })
    print(f"Generated in {result['generation_time_ms']}ms via {result['pipeline_info']}")
    print(f"Seed: {result['seed']}")
    print(f"Image base64 length: {len(result['image_base64'])}")
