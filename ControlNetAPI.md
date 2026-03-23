# fal-ai/flux-general API Documentation

## FLUX.1 [dev] with ControlNets and LoRAs — Text to Image

**Endpoint:** `fal-ai/flux-general`
**Base model:** FLUX.1 [dev] (12 billion parameter flow transformer)
**Pricing:** $0.075 per megapixel (images billed by rounding up to the nearest megapixel)
**Description:** A unified text-to-image endpoint that combines the FLUX.1 [dev] base model with LoRA, ControlNet, IP-Adapter, EasyControl, and reference-image guidance — all accessible in a single API call.

---

## Table of Contents

1. [Quick Start](#1-quick-start)
2. [Authentication](#2-authentication)
3. [Input Reference — All Capabilities](#3-input-reference--all-capabilities)
   - 3.1 [Prompt (required)](#31-prompt)
   - 3.2 [Negative Prompt & NAG System](#32-negative-prompt--nag-system)
   - 3.3 [Image Size](#33-image-size)
   - 3.4 [LoRA Weights](#34-lora-weights)
   - 3.5 [Control LoRAs](#35-control-loras)
   - 3.6 [ControlNet](#36-controlnet)
   - 3.7 [ControlNet Union](#37-controlnet-union)
   - 3.8 [IP-Adapter](#38-ip-adapter)
   - 3.9 [EasyControl](#39-easycontrol)
   - 3.10 [Reference Image (Reference-Only)](#310-reference-image-reference-only)
   - 3.11 [Fill Image (Inpainting / Outpainting)](#311-fill-image-inpainting--outpainting)
   - 3.12 [Sampling & Scheduler Controls](#312-sampling--scheduler-controls)
   - 3.13 [Output & Miscellaneous Controls](#313-output--miscellaneous-controls)
4. [Output Schema](#4-output-schema)
5. [Queue & Async Workflow](#5-queue--async-workflow)
6. [File Handling](#6-file-handling)
7. [Combining Multiple Controls](#7-combining-multiple-controls)
8. [Full Default Input Example](#8-full-default-input-example)

---

## 1. Quick Start

### Install the client

```bash
npm install --save @fal-ai/client
```

### Set your API key

```bash
export FAL_KEY="YOUR_API_KEY"
```

### Submit a request

```javascript
import { fal } from "@fal-ai/client";

const result = await fal.subscribe("fal-ai/flux-general", {
  input: {
    prompt: "A tiger's eye in extreme close-up, direct frontal view"
  },
  logs: true,
  onQueueUpdate: (update) => {
    if (update.status === "IN_PROGRESS") {
      update.logs.map((log) => log.message).forEach(console.log);
    }
  },
});

console.log(result.data);
console.log(result.requestId);
```

---

## 2. Authentication

Set `FAL_KEY` as an environment variable, or configure it in code:

```javascript
import { fal } from "@fal-ai/client";

fal.config({
  credentials: "YOUR_FAL_KEY"
});
```

> **Security:** When running client-side code (browser, mobile, GUI), never expose your `FAL_KEY`. Use a server-side proxy instead. See: https://docs.fal.ai/model-endpoints/server-side

---

## 3. Input Reference — All Capabilities

### 3.1 Prompt

**Field:** `prompt` (string, **required**)

The text description of the image you want to generate.

```json
{
  "prompt": "A cat sitting on a rooftop at sunset, cinematic lighting"
}
```

---

### 3.2 Negative Prompt & NAG System

Steers generation away from unwanted features using Normalized Attention Guidance (NAG).

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `negative_prompt` | string | `""` | What to avoid (e.g., `"blurry, watermark, low quality"`) |
| `nag_scale` | float | `3` | How strongly to push away from the negative prompt. Higher = stronger avoidance. |
| `nag_tau` | float | `2.5` | Controls normalization aggressiveness of the hidden state. Higher = less aggressive. **Not recommended to change.** |
| `nag_alpha` | float | `0.25` | Weighting factor for steering normalized guidance toward the positive prompt. Lower = positive prompt has more influence. |
| `nag_end` | float | `0.25` | Proportion of denoising steps during which NAG is active. After this fraction, remaining steps use original attention processors. |

```json
{
  "negative_prompt": "blurry, watermark, extra fingers",
  "nag_scale": 3,
  "nag_tau": 2.5,
  "nag_alpha": 0.25,
  "nag_end": 0.25
}
```

---

### 3.3 Image Size

**Field:** `image_size` (enum string or object)

**Preset values (exactly 6):**

| Preset | Aspect Ratio |
|--------|-------------|
| `square_hd` | 1:1 (high definition) |
| `square` | 1:1 |
| `portrait_4_3` | 3:4 |
| `portrait_16_9` | 9:16 |
| `landscape_4_3` | 4:3 |
| `landscape_16_9` | 16:9 |

**Custom dimensions (object form):**

| Field | Type | Default |
|-------|------|---------|
| `width` | integer | `512` |
| `height` | integer | `512` |

```json
"image_size": "landscape_16_9"
```

```json
"image_size": {
  "width": 1280,
  "height": 720
}
```

---

### 3.4 LoRA Weights

**Field:** `loras` (list of `LoraWeight`)

Blends fine-tuned style or concept weights on top of the base FLUX model. You can stack **any number** of LoRAs; they are merged together.

#### LoraWeight Object

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `path` | string | **Yes** | — | URL or HuggingFace path to the `.safetensors` LoRA file |
| `scale` | float or object | No | `1` | Influence strength. A single float applies uniformly. A dictionary like `{"layer_name": 0.5}` applies per-layer. Layers without an explicit scale default to `1.0`. |

```json
{
  "loras": [
    {
      "path": "https://huggingface.co/user/my-style-lora/resolve/main/lora.safetensors",
      "scale": 0.8
    },
    {
      "path": "https://huggingface.co/user/another-lora/resolve/main/weights.safetensors",
      "scale": { "double_blocks.0.img_attn.proj": 0.5 }
    }
  ]
}
```

---

### 3.5 Control LoRAs

**Field:** `control_loras` (list of `ControlLoraWeight`)

LoRAs that additionally accept a **control image** for spatial guidance. You can stack any number. Supports optional built-in preprocessing.

#### ControlLoraWeight Object

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `path` | string | **Yes** | — | URL or path to the LoRA weights |
| `scale` | float or object | No | `1` | Same as regular LoRA scale (single float or per-layer dictionary) |
| `control_image_url` | string | **Yes** | — | URL of the control image |
| `preprocess` | enum | No | `"None"` | Preprocessing applied to the control image before use |

**`preprocess` values (exactly 3):**

| Value | Description |
|-------|-------------|
| `"None"` | No preprocessing; use the image as-is |
| `"canny"` | Automatically extract Canny edges from the image |
| `"depth"` | Automatically extract a depth map from the image |

```json
{
  "control_loras": [
    {
      "path": "https://example.com/control-lora.safetensors",
      "scale": 1.0,
      "control_image_url": "https://example.com/photo.png",
      "preprocess": "canny"
    }
  ]
}
```

---

### 3.6 ControlNet

**Field:** `controlnets` (list of `ControlNet`)

Provides strong spatial/structural conditioning from a control image. **Only one ControlNet is supported per request.**

#### ControlNet Object

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `path` | string | **Yes** | — | URL or HuggingFace path to the ControlNet weights |
| `control_image_url` | string | **Yes** | — | URL of the control image |
| `config_url` | string | No | — | URL to a `config.json` file for the ControlNet |
| `variant` | string | No | — | HuggingFace variant (if using a repo key) |
| `conditioning_scale` | float | No | `1` | How strongly the ControlNet influences the output |
| `start_percentage` | float | No | `0` | Fraction of total denoising steps at which ControlNet begins (0.0 = from the start) |
| `end_percentage` | float | No | `1` | Fraction of total denoising steps at which ControlNet stops (1.0 = until the end) |
| `mask_image_url` | string | No | — | URL of a mask image to restrict ControlNet influence to specific regions |
| `mask_threshold` | float | No | `0.5` | Threshold for binarizing the mask |

#### Available Standalone ControlNet Models for FLUX.1-dev

**From InstantX:**

| Model Path | Control Type |
|------------|-------------|
| `InstantX/FLUX.1-dev-Controlnet-Canny` | Canny edge maps |
| `InstantX/FLUX.1-dev-Controlnet-Union` | Union (multi-mode, see §3.7) |

**From Shakker-Labs (joint with InstantX):**

| Model Path | Control Type |
|------------|-------------|
| `Shakker-Labs/FLUX.1-dev-ControlNet-Union-Pro` | Union Pro (improved, more training) |
| `Shakker-Labs/FLUX.1-dev-ControlNet-Union-Pro-2.0` | Union Pro 2.0 (smaller model, improved canny/pose, added soft edge, removed tile) |
| `Shakker-Labs/FLUX.1-dev-Controlnet-Depth` | Depth maps (Depth-Anything-V2) |

**From XLabs-AI:**

| Model Path | Control Type |
|------------|-------------|
| `XLabs-AI/flux-controlnet-canny-v3` | Canny edges (v3, trained at 1024×1024) |
| `XLabs-AI/flux-controlnet-depth-v3` | Depth (Midas) |
| `XLabs-AI/flux-controlnet-hed-v3` | HED soft edges (Holistically-Nested Edge Detection) |

**From Jasper AI:**

| Model Path | Control Type |
|------------|-------------|
| Jasper AI Flux ControlNet Upscaler | Image upscaling |
| Jasper AI Flux ControlNet Surface-Normals | Surface normal maps |
| Jasper AI Flux ControlNet Depth | Depth maps |

```json
{
  "controlnets": [
    {
      "path": "XLabs-AI/flux-controlnet-canny-v3",
      "control_image_url": "https://example.com/canny-edges.png",
      "conditioning_scale": 0.7,
      "start_percentage": 0.0,
      "end_percentage": 0.8
    }
  ]
}
```

---

### 3.7 ControlNet Union

**Field:** `controlnet_unions` (list of `ControlNetUnion`)

A single ControlNet model that bundles **7 different control modes** into one. **Only one ControlNet Union is supported per request.** However, you can pass **multiple control inputs** (each with a different mode) to that single union model.

#### ControlNetUnion Object

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `path` | string | **Yes** | — | URL or path to the union model |
| `config_url` | string | No | — | URL to config.json |
| `variant` | string | No | — | HuggingFace variant |
| `controls` | list of `ControlNetUnionInput` | **Yes** | — | One or more control inputs, each with its own image and mode |

#### ControlNetUnionInput Object

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `control_image_url` | string | **Yes** | URL of the control image |
| `control_mode` | integer | **Yes** | Which of the 7 modes to use (see below) |

#### The 7 Control Modes (Exhaustive)

| Mode | Name | What You Feed It | What It Does | Recommended Settings |
|------|------|-----------------|-------------|---------------------|
| `0` | **Canny** | A Canny edge-detected image (white edges on black background) | Preserves edge structure and outlines. The model follows the lines and boundaries of the control image. | `conditioning_scale`: 0.7 |
| `1` | **Tile** | A regular image or a tile/crop of a larger image | Generates an image that closely matches the structure and overall style of the reference tile. Useful for upscaling, maintaining local consistency, or style-faithful regeneration. | `conditioning_scale`: 0.3–0.8 |
| `2` | **Depth** | A depth map (grayscale image where brighter = closer), extracted via Depth-Anything-V2, Midas, or Zoe-Depth | Preserves the spatial depth and 3D arrangement of a scene — foreground vs. background, object layering, relative distances. | `conditioning_scale`: 0.8 |
| `3` | **Blur** | A blurred/out-of-focus image | Deblurs and enhances the image. The model reconstructs sharpness and detail from the blurry input. | `conditioning_scale`: 0.3–0.8 |
| `4` | **Pose** | An OpenPose skeleton image (stick figures with joint keypoints), extracted via DWPose or OpenPose | Preserves the body pose, stance, facial position, and gesture of human figures. Works best with realistic or semi-realistic human images. | `conditioning_scale`: 0.9, `control_guidance_end`: 0.65 |
| `5` | **Gray** | A grayscale (black-and-white) image, converted via `cv2.cvtColor` or any standard grayscale conversion | **Colorizes the grayscale image.** Adds plausible color to a black-and-white photo while preserving the luminance, structure, contours, and edges. The text prompt guides which colors are applied (e.g., prompting "woman in a red dress in a green garden" influences colorization). **Note:** This mode has the lowest validity/effectiveness score of all 7 modes — results can be inconsistent. | `conditioning_scale`: 0.9, `control_guidance_end`: 0.8 |
| `6` | **Low Quality (lq)** | A low-quality, compressed, noisy, or artifact-heavy image | Enhances and upscales low-quality input. The model reconstructs detail, removes compression artifacts, and improves overall image quality. | `conditioning_scale`: 0.3–0.8 |

#### Single-mode example

```json
{
  "controlnet_unions": [
    {
      "path": "Shakker-Labs/FLUX.1-dev-ControlNet-Union-Pro",
      "controls": [
        {
          "control_image_url": "https://example.com/grayscale-photo.png",
          "control_mode": 5
        }
      ]
    }
  ]
}
```

#### Multi-mode example (canny + depth simultaneously)

```json
{
  "controlnet_unions": [
    {
      "path": "Shakker-Labs/FLUX.1-dev-ControlNet-Union-Pro",
      "controls": [
        {
          "control_image_url": "https://example.com/canny.png",
          "control_mode": 0
        },
        {
          "control_image_url": "https://example.com/depth.png",
          "control_mode": 2
        }
      ]
    }
  ]
}
```

---

### 3.8 IP-Adapter

**Field:** `ip_adapters` (list of `IPAdapter`)

Conditions generation on a **reference image's visual appearance** — effectively using an image as a prompt. Requires pointing to IP-Adapter weights, an image encoder model, and the reference image.

#### IPAdapter Object

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `path` | string | **Yes** | — | HuggingFace path to the IP-Adapter (e.g., `"XLabs-AI/flux-ip-adapter"`) |
| `subfolder` | string | **Yes** | — | Subfolder within the repo where weights live (use `""` if at root) |
| `weight_name` | string | **Yes** | — | Filename of the safetensors file (e.g., `"flux-ip-adapter.safetensors"`) |
| `image_encoder_path` | string | **Yes** | — | Path to the image encoder model (e.g., `"openai/clip-vit-large-patch14"`) |
| `image_encoder_subfolder` | string | No | — | Subfolder for the image encoder weights |
| `image_encoder_weight_name` | string | No | — | Specific weight filename for the image encoder |
| `image_url` | string | **Yes** | — | URL of the reference image to condition on |
| `scale` | float | **Yes** | — | How strongly the reference image influences the output |
| `mask_image_url` | string | No | — | URL of a mask to restrict IP-Adapter influence to specific regions |
| `mask_threshold` | float | No | `0.5` | Threshold for binarizing the mask |

> **Note:** Using XLabs IP-Adapter v1 automatically forces `use_real_cfg` to `true`, which increases generation time and cost.

```json
{
  "ip_adapters": [
    {
      "path": "XLabs-AI/flux-ip-adapter",
      "subfolder": "",
      "weight_name": "flux-ip-adapter.safetensors",
      "image_encoder_path": "openai/clip-vit-large-patch14",
      "image_url": "https://example.com/style-reference.jpg",
      "scale": 0.6
    }
  ]
}
```

---

### 3.9 EasyControl

**Field:** `easycontrols` (list of `EasyControlWeight`)

A lightweight, plug-and-play conditioning framework supporting both spatial control (structure) and subject control (identity/appearance preservation). Supports multi-condition generation and maintains compatibility with custom LoRA-finetuned models.

#### EasyControlWeight Object

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `control_method_url` | string | **Yes** | — | URL to custom safetensor weights, or one of the 8 preset shorthand strings (see below) |
| `image_url` | string | **Yes** | — | URL of the control/reference image |
| `image_control_type` | enum | **Yes** | — | Either `"spatial"` or `"subject"` (see below) |
| `scale` | float | No | `1` | How strongly this control influences the output |

#### `control_method_url` Preset Shorthand Values (Exactly 8)

| Value | Control Category | Description |
|-------|-----------------|-------------|
| `"canny"` | Spatial | Canny edge detection — preserves edge structure and outlines |
| `"depth"` | Spatial | Depth estimation — preserves spatial depth and 3D arrangement |
| `"hedsketch"` | Spatial | HED soft edge / sketch extraction — preserves soft edges and sketch-like contours |
| `"inpainting"` | Spatial | Inpainting mask-based control — regenerates masked regions |
| `"pose"` | Spatial | Human pose / skeleton detection — preserves body pose, stance, and gesture |
| `"seg"` | Spatial | Semantic segmentation map — preserves region-level semantic labels |
| `"subject"` | Subject | Subject identity preservation — maintains the identity and appearance of a person or object from the reference image |
| `"ghibli"` | Subject | Studio Ghibli style transfer — applies Ghibli animation aesthetic to the generation |

Alternatively, you can pass a direct URL to any custom `.safetensors` weights file.

#### `image_control_type` Values (Exactly 2)

| Value | Description |
|-------|-------------|
| `"spatial"` | The image provides structural/spatial guidance (edges, depth, pose, segmentation, inpainting mask) |
| `"subject"` | The image provides identity/appearance information (face, character, object, style) |

```json
{
  "easycontrols": [
    {
      "control_method_url": "canny",
      "image_url": "https://example.com/photo.png",
      "image_control_type": "spatial",
      "scale": 1.0
    },
    {
      "control_method_url": "subject",
      "image_url": "https://example.com/person.png",
      "image_control_type": "subject",
      "scale": 0.8
    }
  ]
}
```

---

### 3.10 Reference Image (Reference-Only)

A lightweight form of image conditioning requiring no adapter weights. The model loosely follows the visual style and composition of a provided image.

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `reference_image_url` | string | No | — | URL of the reference image |
| `reference_strength` | float | No | `0.65` | How strongly the reference influences the output (0 = no influence, 1 = maximum) |
| `reference_start` | float | No | `0` | Fraction of total denoising timesteps at which reference guidance begins (0.0 = from the start) |
| `reference_end` | float | No | `1` | Fraction of total denoising timesteps at which reference guidance ends (1.0 = until the end) |

```json
{
  "reference_image_url": "https://example.com/ref.jpg",
  "reference_strength": 0.65,
  "reference_start": 0.0,
  "reference_end": 1.0
}
```

---

### 3.11 Fill Image (Inpainting / Outpainting)

**Field:** `fill_image` (object of type `ImageFillInput`)

Used for masked region generation — filling in or replacing specific areas of an existing image based on the prompt.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `image_url` | string | Yes | URL of the source image |
| `mask_url` | string | Yes | URL of the mask image (white = regions to regenerate, black = regions to preserve) |

```json
{
  "fill_image": {
    "image_url": "https://example.com/source.png",
    "mask_url": "https://example.com/mask.png"
  }
}
```

---

### 3.12 Sampling & Scheduler Controls

These control the diffusion process mechanics.

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `num_inference_steps` | integer | `28` | Total denoising steps. More = higher quality, slower generation. |
| `guidance_scale` | float | `3.5` | Classifier Free Guidance scale. Higher = model follows the prompt more strictly. |
| `seed` | integer | random | For reproducibility. Same seed + same prompt + same settings = same output. |
| `scheduler` | enum | `"euler"` | Denoising scheduler algorithm. Options: `"euler"`, `"dpmpp_2m"` |
| `real_cfg_scale` | float | `3.5` | Classical CFG scale. Only used when `use_real_cfg` is `true`. |
| `use_real_cfg` | boolean | `false` | Enables classical CFG (as in SD1.5/SDXL). **Increases generation time and cost.** Automatically turned on when using XLabs IP-Adapter v1. |
| `use_cfg_zero` | boolean | `false` | Enables CFG-zero init sampling (per https://arxiv.org/abs/2503.18886). |
| `use_beta_schedule` | boolean | `false` | Whether to use beta sigmas for the noise schedule. |
| `sigma_schedule` | string | — | Custom sigmas schedule for the denoising process. |
| `base_shift` | float | `0.5` | Base shift for the scheduled timesteps. |
| `max_shift` | float | `1.15` | Max shift for the scheduled timesteps. |

---

### 3.13 Output & Miscellaneous Controls

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `num_images` | integer | `1` | How many images to generate. Forced to `1` when using streaming. |
| `output_format` | enum | `"png"` | Output format. Options: `"png"`, `"jpeg"` |
| `enable_safety_checker` | boolean | `true` | Whether to run the NSFW safety checker on the output. |
| `sync_mode` | boolean | `false` | If `true`, returns the image as a data URI inline and the output won't appear in request history. |

---

## 4. Output Schema

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `images` | list of `Image` | **Yes** | The generated image files. |
| `timings` | Timings | **Yes** | Performance timing data. |
| `seed` | integer | **Yes** | The seed used. Same as the input seed if one was provided; otherwise the randomly generated one. |
| `has_nsfw_concepts` | list of boolean | **Yes** | Whether each generated image contains NSFW concepts. |
| `prompt` | string | **Yes** | The prompt used for generation. |

#### Image Object

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `url` | string | **Yes** | — | URL of the generated image |
| `width` | integer | **Yes** | — | Width in pixels |
| `height` | integer | **Yes** | — | Height in pixels |
| `content_type` | string | No | `"image/jpeg"` | MIME type of the image |

#### Example Output

```json
{
  "images": [
    {
      "url": "https://fal.media/files/example/generated.png",
      "width": 1024,
      "height": 768,
      "content_type": "image/png"
    }
  ],
  "timings": {},
  "seed": 42,
  "has_nsfw_concepts": [false],
  "prompt": "A cat sitting on a rooftop at sunset"
}
```

---

## 5. Queue & Async Workflow

For long-running requests, use the queue-based workflow instead of blocking.

### Submit a request

```javascript
import { fal } from "@fal-ai/client";

const { request_id } = await fal.queue.submit("fal-ai/flux-general", {
  input: {
    prompt: "A tiger's eye in extreme close-up"
  },
  webhookUrl: "https://optional.webhook.url/for/results",
});
```

### Check request status

```javascript
const status = await fal.queue.status("fal-ai/flux-general", {
  requestId: "764cabcf-b745-4b3e-ae38-1200304cf45b",
  logs: true,
});
```

### Get the result

```javascript
const result = await fal.queue.result("fal-ai/flux-general", {
  requestId: "764cabcf-b745-4b3e-ae38-1200304cf45b"
});
console.log(result.data);
console.log(result.requestId);
```

---

## 6. File Handling

Any field that accepts a file URL supports three input methods:

### Base64 Data URI

Pass the file as a Base64-encoded data URI inline. Convenient but can impact performance for large files.

```json
{
  "control_image_url": "data:image/png;base64,iVBORw0KGgo..."
}
```

### Hosted URL

Pass any publicly accessible URL. Be aware that some hosts may block cross-site requests or rate-limit.

```json
{
  "control_image_url": "https://example.com/my-image.png"
}
```

### Upload via fal storage

Upload files using the client API and use the returned URL.

```javascript
import { fal } from "@fal-ai/client";

const file = new File([buffer], "control.png", { type: "image/png" });
const url = await fal.storage.upload(file);
// Use `url` in any image URL field
```

> **Auto-upload:** The client auto-uploads binary objects (e.g., `File`, `Data`) if passed directly.

---

## 7. Combining Multiple Controls

A key strength of this endpoint is that **many controls can be combined in a single request**. For example:

```json
{
  "prompt": "A woman in a red dress walking through a sunlit garden",
  "loras": [
    { "path": "https://example.com/cinematic-style.safetensors", "scale": 0.7 }
  ],
  "controlnets": [
    {
      "path": "XLabs-AI/flux-controlnet-canny-v3",
      "control_image_url": "https://example.com/canny-edges.png",
      "conditioning_scale": 0.6,
      "end_percentage": 0.7
    }
  ],
  "ip_adapters": [
    {
      "path": "XLabs-AI/flux-ip-adapter",
      "subfolder": "",
      "weight_name": "flux-ip-adapter.safetensors",
      "image_encoder_path": "openai/clip-vit-large-patch14",
      "image_url": "https://example.com/style-reference.jpg",
      "scale": 0.5
    }
  ],
  "reference_image_url": "https://example.com/composition-ref.jpg",
  "reference_strength": 0.4,
  "negative_prompt": "blurry, low quality, watermark",
  "image_size": "landscape_16_9",
  "num_inference_steps": 28,
  "guidance_scale": 3.5,
  "seed": 42
}
```

This request simultaneously uses: a LoRA for cinematic style, a ControlNet for edge structure, an IP-Adapter for visual reference, a reference image for loose composition guidance, and a negative prompt.

---

## 8. Full Default Input Example

This shows every field with its default value:

```json
{
  "prompt": "Your prompt here",
  "num_inference_steps": 28,
  "controlnets": [],
  "controlnet_unions": [],
  "ip_adapters": [],
  "easycontrols": [],
  "guidance_scale": 3.5,
  "real_cfg_scale": 3.5,
  "num_images": 1,
  "enable_safety_checker": true,
  "reference_strength": 0.65,
  "reference_end": 1,
  "base_shift": 0.5,
  "max_shift": 1.15,
  "output_format": "png",
  "scheduler": "euler",
  "negative_prompt": "",
  "nag_scale": 3,
  "nag_tau": 2.5,
  "nag_alpha": 0.25,
  "nag_end": 0.25
}
```