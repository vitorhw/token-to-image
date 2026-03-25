# Development Guide

## Stack

Next.js 16 (App Router) · React 19 · TypeScript · Shadcn/ui (base-nova, blue theme) · Tailwind v4 · Gemini 2.5 Flash · fal.ai Flux General

## Environment

```
GEMINI_API_KEY=   # Token detection, image gen (fallback), test judging
FAL_KEY=          # Flux General, ControlNet Union Pro
```

## Commands

```bash
npm run dev      # localhost:3000
npm run build    # Production build
```

## Architecture

**Pipeline flow**: `prompt → Gemini token detection → widget popovers → client-side conditioning rendering → pipeline router → fal.ai / Gemini → result`

### 4 Supported Widgets

| Widget           | Conditioning Signal                    | Pipeline Target                          |
| ---------------- | -------------------------------------- | ---------------------------------------- |
| Spatial Position | Depth map (region brightness = depth)  | ControlNet depth mode (scale 0.8)        |
| Camera Angle     | Perspective depth map + concise text   | ControlNet depth mode + prompt prefix    |
| Color            | Concise text enrichment                | Prompt (descriptive names, no hex codes) |
| Art Style        | Concise text enrichment                | Prompt prefix (style name)               |

### Conditioning details

**Spatial Position**: Each region rendered as a grayscale rectangle (brightness = depth). Sent via ControlNet depth. Position/size are in the rectangle geometry; depth value encodes foreground/background.

**Camera Angle**: Perspective-projected depth map using proper camera optics (ray-ground plane intersection with hyperbolic 1/distance falloff). Matches Depth Anything V2 output format that ControlNet was trained on.

When Spatial + Camera are both active, depth maps merge (camera perspective base + spatial regions overlaid).

**IMPORTANT constraints:**
- CLIP has a 77-token limit. Enriched prompts must be concise (~60 words max).
- `easycontrols` is incompatible with `controlnet_unions` (tensor dimension mismatch in fal.ai). Do not combine them.
- Color hex codes get fragmented by tokenizers — use descriptive names only (NumColor, arXiv:2603.13547).

### Key files

| File                          | Role                                                          |
| ----------------------------- | ------------------------------------------------------------- |
| `lib/pipeline-router.ts`      | Routing, concise prompt enrichment (respects 77-token limit)  |
| `lib/fal.ts`                  | Uploads depth maps to fal storage, calls Flux + ControlNet    |
| `lib/conditioning.ts`         | Client-side: perspective depth maps, spatial depth maps       |
| `lib/conditioning-server.ts`  | Server-side mirror (for tests, no DOM)                        |
| `lib/gemini.ts`               | Token detection, image generation, test image judging         |
| `lib/test-cases.ts`           | 27 test cases covering all widgets individually and combined  |

### fal.ai API schema

```json
{
  "controlnet_unions": [{
    "path": "Shakker-Labs/FLUX.1-dev-ControlNet-Union-Pro-2.0",
    "controls": [{
      "control_image_url": "<fal storage URL>",
      "control_mode": "depth",
      "conditioning_scale": 0.8,
      "end_percentage": 0.8
    }]
  }]
}
```

### Pipeline routing

1. If spatial regions OR camera settings exist → depth map rendered → ControlNet path
2. Otherwise → text-only path (Gemini Flash, fallback to Flux General)
3. Color and Style enrich text prompt only

### Gotchas

- CLIP 77-token limit: enriched prompts MUST be concise. Long prompts get truncated, losing end content.
- `easycontrols` + `controlnet_unions` = crash. Never combine them on the same request.
- `fal.storage.upload(File)` required — data URLs rejected as `control_image_url`
- `path` must be HuggingFace model ID (`Shakker-Labs/...`), not preset strings
- `control_mode` not `controlnet_mode` — Union model field name
- Depth convention: 0=far (black), 255=near (white) — inverse depth matching Depth Anything V2
- Color hex codes get fragmented by tokenizers — use descriptive names only
- Gemini image gen model: `gemini-2.5-flash-preview-image-generation` (frequently changes)
- `Math.random()` in SSR causes hydration mismatch — use `useState` initializer
