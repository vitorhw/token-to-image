# Development Guide

## Stack

Next.js 16 (App Router) · React 19 · TypeScript · Shadcn/ui (default, neutral theme) · Tailwind v4 · Gemini 2.5 Flash · fal.ai Flux General · Modal.com GPU Backend (FLUX.1-dev)

## Environment

```
GEMINI_API_KEY=   # Token detection, image gen (fallback), test judging
FAL_KEY=          # Flux General, ControlNet Union Pro (fallback)
MODAL_API_URL=    # Custom GPU backend (Modal.com) — multi-signal conditioning
```

## Commands

```bash
npm run dev      # localhost:3000
npm run build    # Production build
```

## Architecture

### Pipeline overview

```
prompt → Gemini token detection → widget popovers →
  client-side conditioning rendering (depth, canny, masks, style ref) →
  pipeline router →
    1. Modal backend (ControlNet + Regional Prompting + IP-Adapter)  [primary]
    2. fal.ai ControlNet (depth only)                                 [fallback]
    3. Gemini Flash / Flux General (text-only)                        [fallback]
  → result
```

### 4 Supported Widgets — Multi-Signal Conditioning

| Widget           | Signal 1 (Latent)                  | Signal 2 (Latent)        | Signal 3 (Attention)                                   | Signal 4 (Text)          |
| ---------------- | ---------------------------------- | ------------------------ | ------------------------------------------------------ | ------------------------ |
| Spatial Position | Depth map → ControlNet depth       | Canny edges → ControlNet | Binary masks + per-region prompts → Regional Prompting | Position hints in prompt |
| Camera Angle     | Perspective depth map → ControlNet | —                        | —                                                      | Camera text prefix       |
| Color            | —                                  | —                        | Color names bound per-region → Regional Prompting      | Color names in prompt    |
| Art Style        | —                                  | —                        | IP-Adapter reference image                             | Style text prefix        |

### Modal backend (primary pipeline)

Custom FLUX.1-dev pipeline on Modal.com (A100-40GB) combining:

- **ControlNet Union Pro 2.0** (Shakker-Labs): depth (scale 0.45) + canny (scale 0.3)
- **Regional Prompting** (InstantX): per-region attention masks + focused prompts
- **IP-Adapter** (InstantX, Phase 2): style reference images

FLUX uses **T5-XXL (512 tokens)**, NOT CLIP (77 tokens). Regional prompts can be rich.

Ablation flags: `enable_controlnet`, `enable_regional`, `enable_ip_adapter` — for the paper.

### Conditioning rendering

Client-side renders all conditioning images (1024x1024 PNG):

- **Depth map**: camera perspective + spatial regions, multi-pass Gaussian blur
- **Canny map**: white edge outlines on black, 3px lines
- **Region masks**: binary mask per region + background, feathered edges
- **Style reference**: curated images in `public/styles/` (512x512 JPEG)

### Key files

| File                            | Role                                                              |
| ------------------------------- | ----------------------------------------------------------------- |
| `modal_backend/app.py`          | Modal.com GPU backend (FLUX + ControlNet + Regional + IP-Adapter) |
| `modal_backend/pipeline.py`     | Pipeline wrapper with ablation flags                              |
| `modal_backend/conditioning.py` | Server-side depth/canny/mask rendering (Python/Pillow)            |
| `modal_backend/schemas.py`      | Pydantic request/response models                                  |
| `lib/pipeline-router.ts`        | Routes to Modal → fal.ai → Gemini, builds per-region prompts      |
| `lib/modal.ts`                  | Modal API client with health check                                |
| `lib/fal.ts`                    | fal.ai fallback (depth-only ControlNet)                           |
| `lib/conditioning.ts`           | Client-side: depth, canny, region masks, segmentation             |
| `lib/conditioning-server.ts`    | Server-side mirror (for tests, no DOM)                            |
| `lib/style-references.ts`       | Style name → reference image path mapping                         |
| `lib/gemini.ts`                 | Token detection, image generation fallback, test judging          |
| `lib/test-cases.ts`             | 27 test cases covering all widgets individually and combined      |

### Pipeline routing

1. If conditioning signals + Modal healthy → **Modal backend** (multi-signal)
2. If Modal fails, depth map present → **fal.ai ControlNet** (depth only, degraded)
3. If no conditioning → **Gemini Flash** (text-only, fallback to Flux General)

### Gotchas

- fal.ai CLIP 77-token limit applies only to the fal.ai fallback path
- Modal/FLUX uses T5-XXL: 512 tokens available for rich per-region prompts
- `easycontrols` + `controlnet_unions` = crash on fal.ai. Never combine them.
- Depth convention: 0=far (black), 255=near (white) — inverse depth matching Depth Anything V2
- Color hex codes get fragmented by tokenizers — use descriptive names only
- Gemini image gen model: `gemini-2.5-flash-preview-image-generation` (frequently changes)
- `Math.random()` in SSR causes hydration mismatch — use `useState` initializer
- Regional Prompting masks must be feathered (4-8px blur) to prevent seam artifacts
- ControlNet Union Pro 2.0 mode indices: canny=0, depth=2
