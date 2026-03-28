# Tokens to Image

Resolve ambiguous text-to-image tokens with interactive visual widgets backed by real generation pipelines (ControlNet, IP-Adapter, inpainting).

**CMPT 863** — Simon Fraser University

## Problem

Users struggle to communicate visual intent through text alone. Our user studies (n=12) showed:

- 5-8 iterations average before giving up
- Spatial positioning and pose were "nearly impossible" to describe
- Selective edits caused the "Rubik's Cube" problem: fixing one thing ruins others

## Solution

The system detects ambiguous tokens in real-time and surfaces context-aware visual widgets. Each widget produces a **real conditioning signal** — not just prompt text.

| Widget         | Signal                                                     | Pipeline            |
| -------------- | ---------------------------------------------------------- | ------------------- |
| Spatial Canvas | Gemini-generated MiDaS depth map (or client-side fallback) | ControlNet Depth    |
| Pose Editor    | OpenPose skeleton (Gemini 4x variations, draggable joints) | ControlNet Pose     |
| Color Picker   | Context-aware palettes with custom hex                     | Prompt enrichment   |
| Style Gallery  | Style name + reference concepts + IP-Adapter exemplars     | Prompt + IP-Adapter |
| Mask Painter   | Binary mask overlay                                        | Flux Inpainting     |

Widgets use a paginated step-by-step interface (WidgetWizard) with Back/Next navigation.

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
- Shadcn/ui (base-nova) · Tailwind CSS v4
- Gemini 2.5 Flash (token detection, pose generation, depth maps, style references)
- fal.ai Flux General + ControlNet Union Pro 2.0 (image generation)

## Research Foundation

| Widget         | Literature                                         |
| -------------- | -------------------------------------------------- |
| Spatial canvas | WorldSmith (UIST 2023), GLIGEN (CVPR 2023)         |
| Pose editor    | Block and Detail (UIST 2024), TaleBrush (CHI 2022) |
| Color picker   | Color Portraits (CHI 2015)                         |
| Style gallery  | PromptMagician (TVCG 2024), DreamSheets (CHI 2024) |
| Depth layers   | ControlNet (Zhang & Agrawala 2023)                 |
| Inpainting     | Flux Fill                                          |

## Documentation

- `CLAUDE.md` — Development guide, schemas, gotchas

## Contributors

Vitor Hugo · Alex · Hasti
