# Development Guide

## Stack

Next.js 16 (App Router) · React 19 · TypeScript · Shadcn/ui (base-nova) · Tailwind v4 · Gemini 2.5 Flash · fal.ai Flux General

## Environment

```
GEMINI_API_KEY=   # Token detection, pose generation, depth maps, style refs, image gen (fallback)
FAL_KEY=          # Flux General, ControlNet Union Pro, inpainting
```

## Commands

```bash
npm run dev      # localhost:3000
npm run build    # Production build
```

## Architecture

**Pipeline**: `prompt → Gemini token detection → paginated widget popovers → conditioning rendering → pipeline router → fal.ai / Gemini → result`

### Layout

Two-panel: **Left** (420px) = prompt input, detected tokens card, generate button, prompt suggestions, inpainting tool. **Right** = iteration thumbnails bar (top), generated image (main). Selecting an iteration restores the prompt + widget state snapshot.

### Key Files

| File | Role |
|---|---|
| `app/page.tsx` | Main layout, state reducer, iteration snapshots, generation orchestration |
| `lib/pipeline-router.ts` | Route to correct pipeline, build enriched prompt, collect conditioning |
| `lib/fal.ts` | Upload conditioning to fal storage, call Flux General with ControlNet Union |
| `lib/conditioning.ts` | Client-side Canvas rendering: depth maps (fallback), pose skeletons |
| `lib/gemini.ts` | Token detection, pose variations, spatial map gen, style refs, image gen |
| `lib/token-taxonomy.ts` | Taxonomy data for the Supported Tokens popup |
| `components/prompt-input.tsx` | Token annotations, popover widgets with WidgetWizard, generate gate |
| `components/widgets/widget-step.tsx` | Shared WidgetWizard + WidgetStep (paginated step navigation) |

### API Routes

| Route | Purpose |
|---|---|
| `/api/detect-tokens` | Gemini token detection from prompt |
| `/api/generate` | Main generation pipeline |
| `/api/generate-pose` | Gemini pose variation generation (4x) |
| `/api/generate-spatial-map` | Gemini depth map from spatial layout |
| `/api/generate-style-refs` | Gemini reference image generation per style concept (legacy fallback) |
| `/api/suggest-styles` | Gemini prompt-aware style suggestions (text, ~1-2s) |
| `/api/generate-style-preview` | Gemini style preview of user's scene in a given style |
| `/api/inpaint` | Flux inpainting with mask |

### Widgets (4 active token types)

| Token | Widget | Conditioning | Pipeline |
|---|---|---|---|
| Spatial | Draggable canvas + depth sliders | Gemini depth map → ControlNet @ 0.95 | Flux + ControlNet |
| Color | Palette picker + custom hex | None (prompt enrichment only) | Text-only |
| Style | Prompt-aware suggestions + strength slider | Gemini-suggested reference image | Flux + Reference Image |
| Pose | Gemini 4x skeletons + joint editor | OpenPose skeleton → ControlNet @ 0.9 | Flux + ControlNet |

Most widgets use `WidgetWizard` for paginated step-by-step navigation. Style uses a single-page layout with eager suggestions.

### ControlNet Schema (fal.ai flux-general)

```json
{
  "controlnet_unions": [{
    "path": "Shakker-Labs/FLUX.1-dev-ControlNet-Union-Pro-2.0",
    "controls": [
      { "control_image_url": "<fal URL>", "control_mode": "depth", "conditioning_scale": 0.95, "end_percentage": 0.85 },
      { "control_image_url": "<fal URL>", "control_mode": "pose", "conditioning_scale": 0.9, "end_percentage": 0.65 }
    ]
  }]
}
```

### Gotchas

- `fal.storage.upload(File)` required — data URLs rejected as `control_image_url`
- `path` must be HuggingFace model ID (`Shakker-Labs/...`), not preset strings
- `control_mode` not `controlnet_mode` — Union model field name
- Shadcn v4 base-nova: no `asChild`, Slider returns `number | readonly number[]`, PopoverTrigger wraps `<span>` not `<button>`
- Gemini image gen model: `gemini-3-pro-image-preview` (Nano Banana Pro, fallback to fal.ai)
- Gemini text model: `gemini-3.1-pro-preview` (token detection, pose gen)
- `Math.random()` in SSR causes hydration mismatch — use `useState` initializer
- Pose detection is human-only — Gemini prompt explicitly excludes animals
- Dialog default max-width is `max-w-lg` in `components/ui/dialog.tsx` — pass larger `className` to override
