# Tokens to Image

Resolve ambiguous text-to-image tokens with interactive visual widgets backed by real generation pipelines (ControlNet, IP-Adapter, inpainting).

**CMPT 863** — Simon Fraser University

## Problem

Users struggle to communicate visual intent through text alone. Our user studies (n=12) showed:

- 5-8 iterations average before giving up
- Spatial positioning, camera angle, and pose were "nearly impossible" to describe
- Selective edits caused the "Rubik's Cube" problem: fixing one thing ruins others

## Solution

The system detects ambiguous tokens in real-time and surfaces context-aware visual widgets. Each widget produces a **real conditioning signal** — not just prompt text.

| Widget          | Signal                                                      | Pipeline            |
| --------------- | ----------------------------------------------------------- | ------------------- |
| Spatial Canvas  | Depth map (grayscale, soft ellipses)                        | ControlNet Depth    |
| Pose Editor     | OpenPose skeleton (Gemini-generated, 4 variations)          | ControlNet Pose     |
| Camera Controls | Perspective depth map (bird's eye / eye level / worm's eye) | ControlNet Depth    |
| Lighting Gizmo  | Light position map (radial gradients)                       | ControlNet Depth    |
| Color Picker    | Context-aware palettes ("red" → crimson/scarlet/burgundy)   | Prompt enrichment   |
| Style Gallery   | Style name + IP-Adapter reference                           | Prompt + IP-Adapter |
| Mask Painter    | Binary mask overlay                                         | Flux Inpainting     |

All conditioning images are rendered client-side, uploaded to fal.ai storage, and passed as ControlNet Union Pro controls.

## Setup

```bash
npm install
```

Create `.env.local`:

```
GEMINI_API_KEY=your_key
FAL_KEY=your_key
```

```bash
npm run dev
```

## Tech Stack

- Next.js 16 · React 19 · TypeScript
- Shadcn/ui · Tailwind CSS v4
- Gemini 2.5 Flash (token detection, pose generation)
- fal.ai Flux General + ControlNet Union Pro (image generation)

## Research Foundation

| Widget         | Literature                                              |
| -------------- | ------------------------------------------------------- |
| Spatial canvas | WorldSmith (UIST 2023), LayoutDiffusion (2023)          |
| Pose editor    | Block and Detail (UIST 2024), DWPose + ControlNet       |
| Color picker   | Color Portraits (CHI 2015)                              |
| Style gallery  | PromptMagician (TVCG 2024), IP-Adapter                  |
| Lighting       | DiLightNet (SIGGRAPH 2024)                              |
| Camera         | Canvas3D (2025), Liu & Chilton (CHI 2022)               |
| Depth layers   | ControlNet (Zhang & Agrawala 2023), LayeringDiff (2025) |
| Inpainting     | Flux Fill                                               |

Full taxonomy: `docs/taxonomy.csv` · User studies: `docs/briefing.pdf`

## Documentation

- `CLAUDE.md` — Development guide, schemas, gotchas
- `docs/PIPELINE.md` — Technical pipeline flowchart with bifurcations

## Contributors

Vitor Hugo · Alex · Hasti
