# Pipeline Flowchart

Technical specification of the generation pipeline from prompt input to final image output.

## Overview

```
┌──────────────────────────────────────────────────────────────────────┐
│                          CLIENT (Browser)                            │
│                                                                      │
│  1. User types prompt                                                │
│       │                                                              │
│       ▼                                                              │
│  2. Debounced token detection (800ms) ──► POST /api/detect-tokens    │
│       │                                         │                    │
│       │                                         ▼                    │
│       │                                   Gemini 2.5 Flash           │
│       │                                   (structured JSON)          │
│       │                                         │                    │
│       ▼                                         ▼                    │
│  3. Inline token annotations ◄──────── DetectedToken[]               │
│       │                                                              │
│       ▼                                                              │
│  4. User opens popover widgets (click token badges)                  │
│       │                                                              │
│       ├── Color Picker ──► ColorSelection[] (hex, name, target)      │
│       ├── Camera Controls ──► CameraSettings (elev, azimuth, focal)  │
│       ├── Spatial Canvas ──► SpatialRegion[] (x, y, w, h, depth)     │
│       ├── Pose Editor ──► PoseSelection (keypoints[])                │
│       │     └── POST /api/generate-pose ──► Gemini ──► 4 variations  │
│       ├── Style Gallery ──► StyleSelection (name, strength)          │
│       └── Mask Painter ──► MaskRegion (dataUrl, editPrompt)          │
│                                                                      │
│  5. User clicks "Generate Image"                                     │
│       │                                                              │
│       ▼                                                              │
│  ┌─────────────────────────────────────────────────────────┐         │
│  │        CLIENT-SIDE CONDITIONING RENDERING               │         │
│  │                                                         │         │
│  │  SpatialRegion[]? ──► renderDepthMap()                  │         │
│  │    Sharp rectangles, black bg, full 0-255 range         │         │
│  │    Result: depthMapDataUrl (base64 PNG)                 │         │
│  │                                                         │         │
│  │  PoseSelection? ──► renderPoseSkeleton()                │         │
│  │    OpenPose format: colored limbs, white joints         │         │
│  │    Result: poseImageDataUrl (base64 PNG)                │         │
│  │                                                         │         │
│  └─────────────────────────────────────────────────────────┘         │
│       │                                                              │
│       ▼                                                              │
│  6. POST /api/generate { prompt, widgetState (with dataUrls) }       │
└──────────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌──────────────────────────────────────────────────────────────────────┐
│                          SERVER (API Route)                          │
│                                                                      │
│  7. Pipeline Router (lib/pipeline-router.ts)                         │
│       │                                                              │
│       ├── buildEnrichedPrompt()                                      │
│       │     Prepends: style, camera angle, spatial layout            │
│       │     Appends: colors, lighting description, pose name         │
│       │                                                              │
│       ▼                                                              │
│  ┌─────────────────────────────────────────────┐                     │
│  │          ROUTING DECISION TREE              │                     │
│  │                                             │                     │
│  │  Has MaskRegion + previousImage?            │                     │
│  │    ├── YES ──► INPAINTING PATH              │                     │
│  │    └── NO ──▼                               │                     │
│  │                                             │                     │
│  │  Has conditioning images?                   │                     │
│  │  (depthMapDataUrl OR poseImageDataUrl        │                     │
│  │   OR styleExemplar)                         │                     │
│  │    ├── YES ──► CONTROLNET PATH              │                     │
│  │    └── NO ──► TEXT-ONLY PATH                │                     │
│  └─────────────────────────────────────────────┘                     │
│                                                                      │
└──────────────────────────────────────────────────────────────────────┘
                              │
            ┌─────────────────┼─────────────────┐
            ▼                 ▼                 ▼
┌───────────────────┐ ┌──────────────┐ ┌───────────────────┐
│  INPAINTING PATH  │ │ CONTROLNET   │ │  TEXT-ONLY PATH   │
│                   │ │ PATH         │ │                   │
│ Upload mask to    │ │              │ │ Try Gemini 2.5    │
│ fal storage       │ │ For each     │ │ Flash image gen   │
│       │           │ │ conditioning │ │       │           │
│       ▼           │ │ image:       │ │       ▼           │
│ fal-ai/flux-      │ │ Upload to    │ │ Success?          │
│ general/inpaint   │ │ fal storage  │ │  ├── YES ──► done │
│       │           │ │       │      │ │  └── NO           │
│       ▼           │ │       ▼      │ │       │           │
│ Result + mask     │ │ Build Union  │ │       ▼           │
│ in conditioning   │ │ controls[]   │ │ Fallback:         │
│ images            │ │       │      │ │ fal-ai/flux-      │
│                   │ │       ▼      │ │ general (text)    │
└───────────────────┘ │ fal-ai/flux- │ │                   │
                      │ general +    │ └───────────────────┘
                      │ controlnet_  │
                      │ unions       │
                      │       │      │
                      │       ▼      │
                      │ Result +     │
                      │ conditioning │
                      │ images[]     │
                      └──────────────┘
                              │
                              ▼
┌──────────────────────────────────────────────────────────────────────┐
│                     CONTROLNET DETAIL                                │
│                                                                      │
│  fal-ai/flux-general                                                 │
│  ├── prompt: enriched text (style + camera + spatial + original +    │
│  │           colors + pose)                                          │
│  ├── image_size: "square_hd" (1024x1024)                            │
│  ├── controlnet_unions:                                              │
│  │     path: "Shakker-Labs/FLUX.1-dev-ControlNet-Union-Pro-2.0"      │
│  │     controls:                                                     │
│  │       ├── depth map ── scale 0.8, end 0.8 ── from spatial regions │
│  │       └── pose skeleton ── scale 0.9, end 0.65 ── from pose editor│
│  └── ip_adapters: (if style exemplar URL provided)                   │
│        └── scale: user-defined (0.1-1.0)                             │
│                                                                      │
│  Image upload: base64 PNG → fal.storage.upload(File) → public URL    │
│  Model: FLUX.1 [dev] with ControlNet Union Pro 2.0 adapter           │
└──────────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌──────────────────────────────────────────────────────────────────────┐
│                          RESPONSE                                    │
│                                                                      │
│  GenerationResult {                                                  │
│    imageUrl: string          // Generated image URL                  │
│    provider: "gemini"|"fal"  // Which provider was used              │
│    pipeline: string          // e.g. "Flux + ControlNet"             │
│    enrichedPrompt: string    // Full prompt + all conditioning info  │
│    conditioningImages: [{    // For XAI pipeline popup               │
│      label: string           // e.g. "Depth / Camera Map"           │
│      url: string             // fal storage URL                     │
│      type: "depth"|"pose"|"style"|"mask"                            │
│    }]                                                                │
│  }                                                                   │
│                                                                      │
│  Displayed in UI:                                                    │
│  ├── Image viewer with pipeline badge                                │
│  ├── Info (i) button ──► XAI popup showing:                          │
│  │     ├── Enriched prompt text                                      │
│  │     ├── Conditioning image thumbnails (depth, pose)               │
│  │     ├── Pipeline/model info                                       │
│  │     └── Collapsible full parameters                               │
│  └── Iteration history thumbnails                                    │
└──────────────────────────────────────────────────────────────────────┘

## Token Detection Detail

```

Prompt: "A confident businesswoman walking towards the sunset"
│
▼
Gemini 2.5 Flash
(structured JSON output,
responseMimeType: "application/json")
│
▼
Merge same-subject tokens:
"confident" + "walking" → single pose token
│
▼
Fix indices: find actual text position
in prompt string (Gemini indices unreliable)
│
▼
Filter: only keep valid categories
Remove overlapping tokens
│
▼
DetectedToken[] rendered inline
with colored badges + popover triggers

```

## Widget → Conditioning Signal Mapping

```

┌─────────────────┐ ┌──────────────────────┐ ┌─────────────────┐
│ Spatial Canvas │────►│ renderDepthMap() │────►│ ControlNet │
│ (drag regions) │ │ Sharp rectangles, │ │ Union Pro │
│ │ │ black bg, 0-255 │ │ mode: "depth" │
└─────────────────┘ └──────────────────────┘ │ scale: 0.45 │
└─────────────────┘
┌─────────────────┐ ┌─────────────────┐
│ Camera Controls │─────────────────────────────────►│ Text enrichment │
│ (elev/azimuth) │ angle description prepended │ (no ControlNet) │
└─────────────────┘ └─────────────────┘

┌─────────────────┐ ┌──────────────────────┐ ┌─────────────────┐
│ Pose Editor │────►│ renderPoseSkeleton() │────►│ ControlNet │
│ (Gemini 4x var) │ │ OpenPose format: │ │ Union Pro │
│ │ │ colored limbs, 10px │ │ mode: "pose" │
└─────────────────┘ │ white joints 16/9px │ │ scale: 0.60 │
└──────────────────────┘ └─────────────────┘
┌─────────────────┐ ┌─────────────────┐
│ Color Picker │─────────────────────────────────►│ Text enrichment │
│ (context-aware) │ hex + name prepended │ (no ControlNet) │
└─────────────────┘ └─────────────────┘

┌─────────────────┐ ┌─────────────────┐
│ Style Gallery │─────────────────────────────────►│ Text enrichment │
│ (sorted by tag) │ style name prepended │ + IP-Adapter │
└─────────────────┘ (IP-Adapter if URL exists) └─────────────────┘

┌─────────────────┐ ┌──────────────────────┐ ┌─────────────────┐
│ Mask Painter │────►│ Binary mask PNG │────►│ flux-general/ │
│ (paint-to-mask) │ │ (uploaded to fal) │ │ inpainting │
└─────────────────┘ └──────────────────────┘ └─────────────────┘

```

## Prompt Enrichment Order

The enriched prompt is constructed with **style and camera PREPENDED** (models weight prompt start more heavily):

```

[1] {style name} style.
[2] {camera angle description}.
[3] Composition: {spatial region descriptions}.
[4] {ORIGINAL USER PROMPT}
[5] Colors: {color selections}.
[6] Subject pose: {pose name}.

```

## Priority / Override Rules

- Camera uses **text enrichment only** (no ControlNet depth map)
- ControlNet controls are **stacked** in one Union model call (depth + pose)
- Text enrichment **always happens** regardless of ControlNet path
- Gemini image gen **always falls back** to fal.ai Flux General on failure
```
