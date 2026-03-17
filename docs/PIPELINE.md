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
│       ├── Lighting Gizmo ──► LightingSettings (lights[])             │
│       └── Mask Painter ──► MaskRegion (dataUrl, editPrompt)          │
│                                                                      │
│  5. User clicks "Generate Image"                                     │
│       │                                                              │
│       ▼                                                              │
│  ┌─────────────────────────────────────────────────────────┐         │
│  │        CLIENT-SIDE CONDITIONING RENDERING               │         │
│  │                                                         │         │
│  │  CameraSettings? ──► renderCameraDepthMap()             │         │
│  │    ├── elevation > 70° ──► bird's eye geometry           │         │
│  │    ├── elevation < -50° ──► worm's eye geometry          │         │
│  │    └── else ──► horizon gradient                        │         │
│  │    Result: depthMapDataUrl (base64 PNG)                 │         │
│  │                                                         │         │
│  │  SpatialRegion[]? ──► renderDepthMap()                  │         │
│  │    Soft ellipses, brighter = nearer, blurred            │         │
│  │    Result: depthMapDataUrl (overrides camera)           │         │
│  │                                                         │         │
│  │  PoseSelection? ──► renderPoseSkeleton()                │         │
│  │    OpenPose format: colored limbs, white joints         │         │
│  │    Result: poseImageDataUrl (base64 PNG)                │         │
│  │                                                         │         │
│  │  LightingSettings? ──► renderLightingMap()              │         │
│  │    Radial gradients per light source                    │         │
│  │    Result: lightingMapDataUrl (base64 PNG)              │         │
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
│  │  (depthMapDataUrl OR poseImageDataUrl       │                     │
│  │   OR lightingMapDataUrl OR styleExemplar)   │                     │
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
│  │           colors + lighting + pose)                               │
│  ├── image_size: "square_hd" (1024x1024)                            │
│  ├── controlnet_unions:                                              │
│  │     path: "Shakker-Labs/FLUX.1-dev-ControlNet-Union-Pro"          │
│  │     controls:                                                     │
│  │       ├── depth map ──── scale 0.45 ── from spatial OR camera     │
│  │       ├── pose skeleton ── scale 0.50 ── from pose editor         │
│  │       └── lighting map ── scale 0.20 ── from lighting gizmo      │
│  └── ip_adapters: (if style exemplar URL provided)                   │
│        └── scale: user-defined (0.1-1.0)                             │
│                                                                      │
│  Image upload: base64 PNG → fal.storage.upload(File) → public URL    │
│  Model: FLUX.1 [dev] with ControlNet Union Pro adapter               │
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
│  │     ├── Conditioning image thumbnails (depth, pose, lighting)     │
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
│ (drag regions) │ │ Soft ellipses, │ │ Union Pro │
│ │ │ brighter=nearer │ │ mode: "depth" │
└─────────────────┘ └──────────────────────┘ │ scale: 0.45 │
└─────────────────┘
┌─────────────────┐ ┌──────────────────────┐ ┌─────────────────┐
│ Camera Controls │────►│ renderCameraDepthMap()│────►│ ControlNet │
│ (elev/azimuth) │ │ Bird's eye: uniform │ │ Union Pro │
│ │ │ Worm's eye: sky-heavy │ │ mode: "depth" │
└─────────────────┘ │ Eye level: horizon │ │ scale: 0.45 │
└──────────────────────┘ └─────────────────┘

┌─────────────────┐ ┌──────────────────────┐ ┌─────────────────┐
│ Pose Editor │────►│ renderPoseSkeleton() │────►│ ControlNet │
│ (Gemini 4x var) │ │ OpenPose format: │ │ Union Pro │
│ │ │ colored limbs, 10px │ │ mode: "pose" │
└─────────────────┘ │ white joints 16/9px │ │ scale: 0.50 │
└──────────────────────┘ └─────────────────┘

┌─────────────────┐ ┌──────────────────────┐ ┌─────────────────┐
│ Lighting Gizmo │────►│ renderLightingMap() │────►│ ControlNet │
│ (drag lights) │ │ Radial gradients, │ │ Union Pro │
│ │ │ color temp → RGB │ │ mode: "depth" │
└─────────────────┘ └──────────────────────┘ │ scale: 0.20 │
└─────────────────┘
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
[6] Lighting: {lighting description}.
[7] Subject pose: {pose name}.

```

## Priority / Override Rules

- Spatial depth map **overrides** camera depth map (spatial is more specific)
- Camera depth map used **only when no spatial regions exist**
- ControlNet controls are **stacked** in one Union model call (depth + pose + lighting)
- Text enrichment **always happens** regardless of ControlNet path
- Gemini image gen **always falls back** to fal.ai Flux General on failure
```
