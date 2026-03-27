"""Model paths and default configuration for the FLUX pipeline."""

# HuggingFace model identifiers
FLUX_MODEL_ID = "black-forest-labs/FLUX.1-dev"
CONTROLNET_MODEL_ID = "Shakker-Labs/FLUX.1-dev-ControlNet-Union-Pro-2.0"
IP_ADAPTER_MODEL_ID = "InstantX/FLUX.1-dev-IP-Adapter"

# ControlNet Union Pro 2.0 mode indices
# (Shakker-Labs v2.0 infers mode from image content, but InstantX Union uses these)
CONTROLNET_MODE_CANNY = 0
CONTROLNET_MODE_DEPTH = 2

# Default conditioning scales
# 0.8 matches Shakker-Labs recommendation and gives strong spatial control
DEFAULT_DEPTH_SCALE = 0.8
DEFAULT_CANNY_SCALE = 0.4
DEFAULT_IP_ADAPTER_SCALE = 0.6

# Regional prompting defaults
DEFAULT_BASE_RATIO = 0.2
DEFAULT_MASK_INJECT_STEPS = 8

# Generation defaults
DEFAULT_NUM_STEPS = 28
DEFAULT_GUIDANCE_SCALE = 3.5
DEFAULT_WIDTH = 1024
DEFAULT_HEIGHT = 1024

# Modal infrastructure
MODELS_VOLUME_NAME = "flux-models"
MODELS_DIR = "/models"
GPU_TYPE = "A100"  # A100-40GB
CONTAINER_IDLE_TIMEOUT = 180  # seconds
