# Development Guide

## Stack

Next.js 16 (App Router) · React 19 · TypeScript · Shadcn/ui (base-nova, blue theme) · Tailwind v4 · Gemini 2.5 Flash · fal.ai Flux General

## Environment

```
GEMINI_API_KEY=   # Token detection, pose generation, image gen (fallback)
FAL_KEY=          # Flux General, ControlNet Union Pro, inpainting
```

## Commands

```bash
npm run dev      # localhost:3000
npm run build    # Production build
```

## Architecture

**Pipeline flow**: `prompt → Gemini token detection → widget popovers → client-side conditioning rendering → pipeline router → fal.ai / Gemini → result`

**Every widget produces a real conditioning signal**, not just text. See `docs/PIPELINE.md` for the full technical flowchart.

### Key files

| File                          | Role                                                                                        |
| ----------------------------- | ------------------------------------------------------------------------------------------- |
| `lib/pipeline-router.ts`      | Decides which pipeline to use, builds enriched prompt, collects conditioning info           |
| `lib/fal.ts`                  | Uploads conditioning images to fal storage, calls Flux General with ControlNet Union        |
| `lib/conditioning.ts`         | Client-side Canvas rendering: depth maps, pose skeletons                                    |
| `lib/gemini.ts`               | Token detection (structured JSON), pose variations (4x), image generation                   |
| `components/prompt-input.tsx` | Inline token annotations, popover widgets, debounced detection                              |

### ControlNet schema (fal.ai flux-general)

```json
{
  "controlnet_unions": [
    {
      "path": "Shakker-Labs/FLUX.1-dev-ControlNet-Union-Pro-2.0",
      "controls": [
        {
          "control_image_url": "<fal storage URL>",
          "control_mode": "depth",
          "conditioning_scale": 0.45,
          "end_percentage": 0.4
        },
        {
          "control_image_url": "<fal storage URL>",
          "control_mode": "pose",
          "conditioning_scale": 0.9,
          "end_percentage": 0.65
        }
      ]
    }
  ]
}
```

### Conditioning scales (per Union Pro 2.0 recommended values)

| Signal           | Scale | End % | Notes                                                          |
| ---------------- | ----- | ----- | -------------------------------------------------------------- |
| Depth (spatial)  | 0.45  | 0.40  | Blurred rectangles, black bg, full 0-255 range                |
| Pose             | 0.90  | 0.65  | OpenPose format, thicker limbs (10px) for better detection     |

### Gotchas

- `fal.storage.upload(File)` required — data URLs rejected as `control_image_url`
- `path` must be HuggingFace model ID (`Shakker-Labs/...`), not preset strings like `"depth"`
- `control_mode` not `controlnet_mode` — the Union model requires the field name `control_mode`
- Shadcn v4 base-nova: no `asChild`, Slider returns `number | readonly number[]`, PopoverTrigger wraps `<span>` not `<button>`
- Gemini image gen model: `gemini-2.5-flash-preview-image-generation` (frequently changes, fallback to fal.ai is robust)
- `Math.random()` in SSR components causes hydration mismatch — use `useState` initializer
