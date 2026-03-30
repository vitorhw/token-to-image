# Pipeline Audit — Combined & Fact-Checked

**Date**: 2026-03-29
**Scope**: Generation pipeline end-to-end — from client-side conditioning through API routes, pipeline router, Gemini calls, and fal.ai calls. Claims from both `claude_audit.md` and `codex_audit.md` are verified against the actual codebase and current API documentation.

**Sources verified**:
- All pipeline source files read line-by-line
- Installed SDK types: `@fal-ai/client` 1.9.4 (`node_modules/@fal-ai/client/src/types/endpoints.d.ts`)
- Installed SDK types: `@google/genai` 1.45.0
- fal.ai public API docs: `fal.ai/models/fal-ai/flux-general/api`, `fal.ai/models/fal-ai/flux-general/inpainting/api`
- Gemini API docs: `ai.google.dev/gemini-api/docs/image-generation`, `ai.google.dev/gemini-api/docs/models`

---

## Table of Contents

1. [Pipeline Architecture (Verified)](#1-pipeline-architecture)
2. [Issue 1: Style Conditioning Should Switch To Reference-Only Mode](#issue-1)
3. [Issue 2: Gemini Depth Map Fidelity — Unverified Hypothesis](#issue-2)
4. [Issue 3: Stale Cached Depth Maps After Edits](#issue-3)
5. [Issue 4: Clearing Inpainting Mask Leaves Router in Invalid State](#issue-4)
6. [Issue 5: `/api/inpaint` Response Shape Mismatch](#issue-5)
7. [Issue 6: Stale Closure — `poseKeypoints` Missing from Dependency Array](#issue-6)
8. [Issue 7: Token Offset Recomputation via `indexOf`](#issue-7)
9. [Issue 8: All Conditioned Generations Mislabeled "Flux + ControlNet"](#issue-8)
10. [Issue 9: Style Gallery Preview Never Renders](#issue-9)
11. [Issue 10: Short Prompts Retain Stale Detected Tokens](#issue-10)
12. [Issue 11: Large Base64 Payloads](#issue-11)
13. [Dead Code](#dead-code)
14. [API Contract Verification](#api-contracts)
15. [CLAUDE.md Accuracy](#claude-md-accuracy)
16. [Discrepancies Between the Two Audits](#discrepancies)
17. [Prioritized Action Items](#action-items)

---

<a id="1-pipeline-architecture"></a>
## 1. Pipeline Architecture (Verified)

**Confirmed by tracing all code paths:**

```
User types prompt
  → Debounced 800ms (prompt-input.tsx:193-205)
  → POST /api/detect-tokens → Gemini gemini-2.5-flash structured JSON (gemini.ts:11-65)
  → Client receives DetectedToken[] with categories, shows annotated token spans
  → User opens popover widgets to configure spatial/color/style/pose
  → User clicks "Generate Image"
  → Client renders conditioning images on Canvas (conditioning.ts):
      - Depth map: 1024x1024 black canvas, gray rectangles (brightness=depth), 18px blur
      - Pose skeleton: 1024x1024 black canvas, colored OpenPose limbs, white joint circles
  → POST /api/generate with { prompt, widgetState (includes data URLs), previousImageUrl }
  → pipeline-router.ts: routeGeneration()
      1. buildEnrichedPrompt() — style → spatial → prompt → color → pose
      2. Route decision:
         a. maskRegion + previousImageUrl → inpaintWithFlux() → fal-ai/flux-general/inpainting
         b. depthMapDataUrl || poseImageDataUrl || exemplarUrls.length → generateWithControls() → fal-ai/flux-general + ControlNet/Reference Image
         c. else → generateWithGemini() → gemini-2.5-flash-image (fallback: generateWithFlux() → fal-ai/flux-general)
  → Result { imageUrl, provider, pipeline, timestamp, enrichedPrompt, conditioningImages }
  → Client stores in generation history with snapshot { prompt, widgetState, detectedTokens }
```

**Stack confirmed from `package.json`**: Next.js 16.1.6, React 19.2.3, `@google/genai` ^1.45.0, `@fal-ai/client` ^1.9.4, `@base-ui/react` ^1.3.0.

**Gemini model IDs confirmed against current API docs**:
- `gemini-2.5-flash` — text/structured output (token detection, pose generation). Valid and current.
- `gemini-2.5-flash-image` — image generation (depth maps, style references, text-only fallback). Valid and current. Newer models exist (`gemini-3.1-flash-image-preview`, `gemini-3-pro-image-preview`) but `gemini-2.5-flash-image` is still supported.

**Prompt enrichment order** (pipeline-router.ts:29-64):
1. Style instruction (line 33)
2. Spatial composition (line 43)
3. Original user prompt (line 51)
4. Color specifications (line 54)
5. Pose description (line 60)

Both audits say this order is "correct for model attention." That is a reasonable design judgment (models tend to weight early tokens more), but it is not a verifiable fact — no empirical comparison against other orderings was performed.

**Depth + Pose balancing** (fal.ts:75-84): When both depth and pose conditioning are present, depth scale drops from 0.95 → 0.65 and end percentage from 0.85 → 0.60 to prevent depth from overpowering pose. Pose stays at scale 0.9, end 0.65. This is a reasonable heuristic.

---

<a id="issue-1"></a>
## Issue 1: Style Conditioning Switched To Reference-Only Mode, Pending Live Verification

**Severity**: MEDIUM — the riskier IP-Adapter path has been removed from the primary style flow, but the new reference-image path still needs an end-to-end smoke test against the live Fal endpoint.

**Status update (2026-03-30)**:

- The widget-state wiring remains fixed: generated Gemini style refs populate `widgetState.styleSelection.exemplarUrls`.
- The Style Gallery now enforces a single selected style reference in the UI.
- The Fal style payload now uses top-level `reference_image_url` / `reference_strength` instead of `ip_adapters`.
- Pipeline labels, summaries, and docs now describe style conditioning as `Reference Image`, not `IP-Adapter`.
- The existing array-shaped style state was kept for compatibility, but the app now caps style refs to one active item and uses only index `0` on the server.

### Why this change was made

A real style-only generation previously failed live with `422 Unprocessable Entity` when the app sent an IP-Adapter payload. The endpoint complained that `image_url` and `image_encoder_path` were missing from `ip_adapters[0]`, which showed that the live server contract did not match the request shape the app was sending.

The same `flux-general` endpoint also exposes top-level `reference_image_url` / `reference_strength` fields. That path is simpler, aligns better with the product need of "pick one good style reference image," and avoids adapter-specific schema ambiguity.

### What was implemented

1. **Single-reference style selection**
   - The widget now behaves as single-select.
   - Clicking a new style reference replaces the old one.
   - Clicking the selected reference again clears it.
   - Older multi-reference state is normalized safely rather than assumed away.

2. **Reference-only Fal payload**
   - The style branch in `generateWithControls()` no longer sends `ip_adapters`.
   - The selected Gemini-generated style image is still uploaded first.
   - The uploaded URL is now sent as `reference_image_url`.
   - The style slider is now sent as `reference_strength`.

3. **Compatibility safeguards**
   - `StyleSelection.exemplarUrls` and `selectedReferences` remain arrays to avoid breaking snapshots, history replay, and existing state merges.
   - The server only consumes the first style exemplar, so older snapshots with multiple entries degrade safely.

4. **User-facing naming updates**
   - Style-conditioned runs are now labeled `Flux + Reference Image`.
   - Mixed runs are labeled with combinations like `Flux + Depth ControlNet + Reference Image`.
   - Supporting docs and token taxonomy language were updated to match the new mechanism.

### Current behavior

- If the user selects a style but never generates a style reference image, style still affects prompt enrichment only.
- If the user generates and selects one style reference image, the request now routes through Fal reference-image guidance instead of the old IP-Adapter path.
- Depth and pose conditioning continue to share the same conditioned generation branch, and style now layers onto that branch through the simpler top-level reference-image fields.

### Remaining work

1. Run a style-only smoke test against the live Fal endpoint.
2. Run a mixed depth+style smoke test to confirm `reference_image_url` coexists correctly with ControlNet inputs.
3. Verify whether the current `reference_strength` mapping feels qualitatively right in practice or needs tuning.

---

<a id="issue-2"></a>
## Issue 2: Gemini Depth Map Fidelity — Unverified Hypothesis

**Severity**: UNKNOWN — Reasonable concern, but not a code-proven bug.

**Source**: Identified by the claude audit as ISSUE-1 (HIGH severity). The codex audit correctly downgraded this to "unverified hypothesis."

**The pipeline as it works** (verified line-by-line):

1. User arranges rectangles on a 2D canvas with depth sliders and rotation (spatial-canvas.tsx)
2. `handleGenerateMap` (spatial-canvas.tsx:38-68) renders a client-side reference depth map via `conditioning.renderDepthMap(value)` — filled gray rectangles on black 1024x1024 canvas with 18px Gaussian blur (conditioning.ts:31-54)
3. POSTs to `/api/generate-spatial-map` with: regions, prompt, the reference map as `referenceMapDataUrl`, and any pose keypoints
4. Server sends the reference image to `gemini-2.5-flash-image` with `responseModalities: ["IMAGE"]` and a prompt saying "REFINE this layout into a proper depth map" — keep positions/sizes/depths but replace rectangles with silhouettes (gemini.ts:152-233)
5. Gemini returns a new image which becomes `depthMapDataUrl`
6. At generation time (page.tsx:175-177), the Gemini map takes priority over client-side rectangles. It's uploaded to fal storage and sent as ControlNet depth conditioning

**The concern**: Gemini is a generative model, not a pixel-precise editor. It may:
- Drift object positions from where the user placed them
- Change sizes or depth values
- Ignore precise rotation angles
- Generate its own scene interpretation rather than faithfully refining the layout

**Verdict**: The concern is architecturally sound — generative image models are not designed for geometric precision. However, neither audit produced empirical evidence (sample outputs, A/B comparisons) to confirm the extent of the problem. The claude audit stated the failure modes as established facts ("Positions drift", "Sizes change") when they are predictions.

**The client-side fallback exists** (page.tsx:178-180): If no Gemini depth map is stored, the pipeline renders rectangles directly via `conditioning.renderDepthMap()`. ControlNet depth models were trained on MiDaS/ZoeDepth output which produces blob-like shapes — blurred rectangles may be adequate.

**Recommendation**: A/B test both paths empirically before making architectural changes. Consider making the Gemini step optional (UI toggle between "Use layout as-is" and "Refine with AI").

---

<a id="issue-3"></a>
## Issue 3: Stale Cached Depth Maps After Edits

**Severity**: MEDIUM — Conditioning image silently drifts from what the UI shows.

**Source**: Identified by the codex audit. Confirmed.

**The problem**:

Once Gemini returns a depth map, it's stored in `widgetState.depthMapDataUrl`. At generation time (page.tsx:175-177), this cached map takes priority over current regions. But no code invalidates it when the user subsequently edits:

- `prompt-input.tsx:141` — spatial `onChange` calls `onWidgetStateChange({ spatialRegions: regions })`. Only updates regions.
- `prompt-input.tsx:153` — pose `onChange` calls `onWidgetStateChange({ poseSelection: pose })`. Only updates pose.
- `page.tsx:74` — `UPDATE_WIDGET_STATE` does a shallow merge: `{ ...state.widgetState, ...action.state }`. No invalidation logic.

**Result**: If the user generates a depth map, then moves an object or adjusts pose, the old depth map is still sent to ControlNet. The canvas layout no longer matches the actual conditioning image.

**Additionally**: `poseKeypoints` is missing from the `handleGenerateMap` dependency array (spatial-canvas.tsx:68: `[value, prompt, onDepthMapGenerated]`), causing a stale closure when poseKeypoints change after the spatial widget mounts.

**Fix**:
1. Clear `depthMapDataUrl` in the `UPDATE_WIDGET_STATE` reducer whenever `spatialRegions` or `poseSelection` changes
2. Add `poseKeypoints` to the `handleGenerateMap` dependency array
3. Optionally show a "stale" indicator in the UI

---

<a id="issue-4"></a>
## Issue 4: Clearing Inpainting Mask Leaves Router in Invalid State

**Severity**: MEDIUM (mitigated by UI guard)

**Source**: Identified by the codex audit. Confirmed.

**The problem**:

`clearMask` in mask-painter.tsx:86-93 writes:
```ts
onChange({ dataUrl: "", editPrompt });
```

This sets `maskRegion` to `{ dataUrl: "", editPrompt: "..." }` rather than `undefined`. The pipeline router at pipeline-router.ts:102 checks:
```ts
if (ws.maskRegion && previousImageUrl) {
```

`{ dataUrl: "" }` is truthy, so the router would attempt inpainting with an empty mask data URL.

**Mitigating factor**: The "Apply & Regenerate" button is disabled when `!state.widgetState.maskRegion?.dataUrl` (page.tsx:363), so the primary UI path is protected. But the main "Generate Image" button in prompt-input.tsx:337 does NOT have this guard — if a user clears the mask without closing the dialog and then hits the main Generate button, the router could attempt inpainting with an empty mask.

**Fix**: Either set `maskRegion` to `undefined` on clear, or add a content check to the router: `if (ws.maskRegion?.dataUrl && previousImageUrl)`.

---

<a id="issue-5"></a>
## Issue 5: `/api/inpaint` Response Shape Mismatch

**Severity**: LOW (latent — route is not called by the main app flow)

**Source**: Identified by both audits. Confirmed.

`inpaintWithFlux()` in fal.ts:131-137 returns `{ imageUrl: string, conditioningImages: ConditioningImage[] }`. But the route (app/api/inpaint/route.ts:12-13):
```ts
const resultUrl = await inpaintWithFlux(imageUrl, maskUrl, prompt);
return NextResponse.json({ imageUrl: resultUrl });
```

Produces `{ imageUrl: { imageUrl: "...", conditioningImages: [...] } }` — a nested object.

**Why latent**: The main inpainting path goes through `/api/generate` → `routeGeneration()` → `inpaintWithFlux()` directly. The `/api/inpaint` route is never called by the frontend.

**Fix**: Destructure the return: `return NextResponse.json({ imageUrl: resultUrl.imageUrl })`, or remove the unused route.

---

<a id="issue-6"></a>
## Issue 6: Stale Closure — `poseKeypoints` Missing from Dependency Array

**Severity**: LOW-MEDIUM

**Source**: Identified by the claude audit. Confirmed.

`handleGenerateMap` in spatial-canvas.tsx:38-68:
```ts
const handleGenerateMap = useCallback(async () => {
  // ...uses poseKeypoints on line 54...
  body: JSON.stringify({ ..., poseKeypoints: poseKeypoints?.length ? poseKeypoints : undefined }),
}, [value, prompt, onDepthMapGenerated]); // poseKeypoints missing
```

If the user configures a pose skeleton AFTER opening the spatial widget, the callback captures the stale value of `poseKeypoints` (likely `undefined`).

**Nuance from codex audit**: The practical impact may be narrower than stated because popover widgets often remount when closed and reopened, resetting the closure. But the bug is real for the case where pose is configured while the spatial popover stays open.

**Fix**: Add `poseKeypoints` to the dependency array.

---

<a id="issue-7"></a>
## Issue 7: Token Offset Recomputation via `indexOf`

**Severity**: LOW-MEDIUM

**Source**: Identified only by the codex audit. Confirmed. This was missing from the claude audit.

`prompt-input.tsx:229-238` replaces Gemini's returned `startIndex`/`endIndex` with `indexOf`-computed positions:
```ts
const fixedTokens = detectedTokens.map((token) => {
  const idx = prompt.indexOf(token.text);
  if (idx >= 0) {
    return { ...token, startIndex: idx, endIndex: idx + token.text.length };
  }
  // ...lowercase fallback...
});
```

**Problem**: If the same substring appears more than once in the prompt (e.g., "a cat watching a cat"), `indexOf` always finds the first occurrence. The UI could annotate the wrong one, and the non-overlap filter (lines 241-248) could then suppress other valid tokens.

**Nuance**: Gemini's token offsets may also be unreliable (LLMs don't always compute exact character positions correctly). The `indexOf` approach may have been a defensive measure. But for duplicate substrings, it introduces a new class of error.

**Fix**: Use model-provided offsets when they match the text at the specified position; fall back to `indexOf` only when they don't.

---

<a id="issue-8"></a>
## Issue 8: All Conditioned Generations Mislabeled "Flux + ControlNet"

**Severity**: RESOLVED IN CODE (2026-03-30)

**Source**: Identified by the codex audit, confirmed by the claude audit.

The conditioned branch now derives its label from the active conditioning signals. Style-only generations now show `Flux + Reference Image`, and mixed runs should show combinations such as `Flux + Depth ControlNet + Reference Image`.

---

<a id="issue-9"></a>
## Issue 9: Style Gallery Preview Never Renders

**Severity**: RESOLVED IN CODE (2026-03-30)

**Source**: Identified by the claude audit. Confirmed.

The preview block has been moved outside `<WidgetWizard>`, so it now renders and also reports whether Fal will receive attached exemplar images.

---

<a id="issue-10"></a>
## Issue 10: Short Prompts Retain Stale Detected Tokens

**Severity**: LOW

**Source**: Identified only by the codex audit. Confirmed. Missing from the claude audit.

In prompt-input.tsx:193-205, when the prompt is empty or shorter than 10 characters, the detection effect stops scheduling new detection but does NOT clear `detectedTokens`. Stale annotations persist in the UI until the prompt grows long enough to trigger a new detection.

**Fix**: Dispatch `SET_TOKENS` with `[]` when the prompt is too short to detect.

---

<a id="issue-11"></a>
## Issue 11: Large Base64 Payloads

**Severity**: LOW (deployment-dependent)

**Source**: Both audits. Partially correct.

`handleGenerate()` in page.tsx:216-221 sends `widgetStateWithImages` as JSON, including `depthMapDataUrl` and `poseImageDataUrl` as base64 data URLs. A 1024x1024 PNG can be 500KB-2MB as base64.

**Corrections**:
- Next.js Route Handlers do NOT have a framework-imposed body size limit. The 1MB default applies only to Server Actions. The claude audit initially overstated this; it was corrected in its cross-audit notes.
- Deployment platforms impose limits: Vercel serverless functions have a 4.5MB request body limit. Default nginx is 1MB.
- For local `npm run dev`, this is a non-issue.

**Recommendation**: Measure actual payload sizes before treating this as a production issue.

---

<a id="dead-code"></a>
## Dead Code

All items confirmed by reading every file:

| Item | File:Line | Verification |
|---|---|---|
| `sv()` utility | lib/utils.ts:8-10 | Defined, zero call sites. All sliders use inline `Array.isArray` checks. |
| `Eraser` import | components/widgets/mask-painter.tsx:8 | Imported from lucide-react, never used. Only `RotateCcw` is used (line 133). |
| `MaskPainter` import in prompt-input | components/prompt-input.tsx:10 | Rendered for `token.category === "masking"` (line 131), but `"masking"` is not in `TOKEN_CATEGORIES` (gemini.ts:6-9). Gemini never returns a masking token. The inpainting feature is accessed via the Dialog in page.tsx:336-369. |
| `enrichedPrompt` on `PipelineInput` | pipeline-router.ts:7 | Required on the interface. Set to `prompt` at api/generate/route.ts:21. Never read — `routeGeneration()` computes its own via `buildEnrichedPrompt()` (line 97). |
| `konva` / `react-konva` deps | package.json:17,22 | Listed as dependencies, imported nowhere. Leftover from previous spatial canvas implementation. |
| Sidebar CSS variables | app/globals.css:12-19,75-82,109-116 | `--sidebar-*` variables defined for both themes. No sidebar component exists. Standard shadcn scaffold — low priority. |

---

<a id="api-contracts"></a>
## API Contract Verification

### Gemini API

| Usage | Model | SDK Method | Status |
|---|---|---|---|
| Token detection | `gemini-2.5-flash` | `ai.models.generateContent()` with `responseMimeType: "application/json"` and `responseSchema` | **Correct**. Model is current and supports structured output per docs. |
| Pose generation | `gemini-2.5-flash` | Same structured output approach | **Correct**. |
| Depth map generation | `gemini-2.5-flash-image` | `responseModalities: ["IMAGE"]` with inline image input | **Correct**. Model is current. `["IMAGE"]` is valid per docs. |
| Style reference generation | `gemini-2.5-flash-image` | `responseModalities: ["IMAGE"]` | **Correct**. |
| Text-only image generation | `gemini-2.5-flash-image` | `responseModalities: ["TEXT", "IMAGE"]` | **Correct**. `["TEXT", "IMAGE"]` is the standard configuration per docs. |

### fal.ai ControlNet Union

| Field | Code (fal.ts:82,89,95) | SDK Types | Public API Docs | Status |
|---|---|---|---|---|
| `control_image_url` | ✓ | ✓ | ✓ | **Correct** |
| `control_mode` | `"depth"`, `"pose"` | ✓ (enum) | ✓ | **Correct** |
| `conditioning_scale` | 0.95/0.65 (depth), 0.9 (pose) | ✓ | ✓ | **Correct** |
| `end_percentage` | 0.85/0.6 (depth), 0.65 (pose) | ✓ | ✓ | **Correct** |
| `path` | `"Shakker-Labs/FLUX.1-dev-ControlNet-Union-Pro-2.0"` | ✓ (string) | ✓ (HF model ID) | **Correct** |

### fal.ai IP-Adapter (historical failure mode)

| Field | Previous code | SDK Types | Public API Docs | Status |
|---|---|---|---|---|
| Reference image | `ip_adapter_image_url: uploadedStyleUrls` | `ip_adapter_image_url` | `image_url` | **Mismatch against live validation** |
| Adapter weights | `path: FLUX_IP_ADAPTER_PATH` | `path` (required) | `path` (required) | **Present** |
| Strength | `scale: styleStrength` | `scale` | `scale` | **Present** |
| Image encoder | omitted | not in type | `image_encoder_path` (required) | **Missing for live server validation** |

**Important discrepancy**: The installed SDK types (`@fal-ai/client` 1.9.4) define the reference image field as `ip_adapter_image_url`, while the public API docs use `image_url`. The observed 422 error indicated the live server validation was aligned with the public docs shape, not the SDK type.

**Verdict**: This is now a historical failure mode, not the current primary implementation. It explains why the codebase switched style conditioning to the simpler reference-only path.

### fal.ai Reference-Only Mode (recommended implementation path)

| Field | Proposed code | SDK Types | Status |
|---|---|---|---|
| Reference image | `reference_image_url: uploadedStyleUrl` | `reference_image_url` | **Directly supported** |
| Strength | `reference_strength: styleStrength` | `reference_strength` | **Directly supported** |
| Timing | optional `reference_start` / `reference_end` | supported | **Optional; can defer** |
| Adapter weights | none | not needed | **No extra config required** |
| Image encoder | none | not needed | **No extra config required** |

**Recommendation**: For this codebase, reference-only mode is the better primary implementation because it aligns with the actual user interaction model of "pick one good style reference image and bias the result toward it" without requiring adapter-specific infrastructure.

### fal.ai File Input Handling

**CLAUDE.md claims**: "`fal.storage.upload(File)` required — data URLs rejected as `control_image_url`"

**Codex audit claims**: "fal's current docs explicitly allow Base64 data URIs and hosted URLs."

**Verified**: The fal.ai public documentation confirms three accepted input formats:
1. fal CDN URLs (uploaded via `fal.storage.upload()`) — recommended
2. External public URLs
3. Base64 data URIs — technically accepted but explicitly **discouraged** by docs: "Data URIs embed the entire file in the request payload. This inflates the request size significantly, slows down transmission, and is not recommended for files larger than a few KB."

**Verdict**: The CLAUDE.md claim is too strong ("required" / "rejected") — data URIs are accepted. The codex audit is technically correct but understates the practical concern — for 1024x1024 PNG conditioning images, data URIs would add hundreds of KB to MB to the request. The codebase's approach of uploading via `fal.storage.upload()` is the **correct practical choice** regardless of whether data URIs technically work. The CLAUDE.md should say "strongly recommended" rather than "required."

### fal.ai Inpainting

The code at fal.ts:131-137 uses `fal-ai/flux-general/inpainting` with `{ image_url, mask_url, prompt, num_images: 1 }`. This matches the API docs. The endpoint also accepts optional `strength` (default 0.85), `guidance_scale` (default 3.5), and ControlNet/IP-Adapter fields, none of which are used. This is correct for basic inpainting.

---

<a id="claude-md-accuracy"></a>
## CLAUDE.md Accuracy (Pipeline-Related Claims)

### Accurate

| Claim | Verification |
|---|---|
| Gemini text model: `gemini-2.5-flash` | gemini.ts:13,81. Current per API docs. |
| Gemini image model: `gemini-2.5-flash-image` | gemini.ts:220,237,254. Current per API docs. |
| `control_mode` not `controlnet_mode` | fal.ts:82,89. Matches SDK types and API docs. |
| ControlNet Union Pro 2.0 path | fal.ts:95. `Shakker-Labs/FLUX.1-dev-ControlNet-Union-Pro-2.0`. |
| Depth conditioning scale 0.95, end 0.85 | fal.ts:80-81 (solo depth case). |
| Pose conditioning scale 0.9, end 0.65 | fal.ts:89. |
| Pose detection is human-only | gemini.ts:27 — prompt explicitly excludes animals. |
| `Math.random()` SSR guard via `useState` initializer | prompt-suggestions.tsx:26-27. |
| Pipeline: `prompt → detection → widgets → conditioning → router → fal/Gemini → result` | Confirmed by tracing all code paths. |

### Inaccurate or Misleading

| Claim | Reality |
|---|---|
| "`fal.storage.upload(File)` required — data URLs rejected as `control_image_url`" | **Overstated**. fal docs accept data URIs but discourage them. Upload is the correct practical choice but not strictly required. |
| "`path` must be HuggingFace model ID" | **Too strong**. Current docs describe `path` as "URL or the path to the model weights." The repo's chosen path happens to be a HF model ID, but raw URLs are also valid. |
| "Each widget uses `WidgetWizard` for paginated step-by-step navigation (Back/Next)" | **False**. Only `StyleGallery` uses `WidgetWizard`. `ColorPicker`, `SpatialCanvas`, `PoseEditor`, and `MaskPainter` have custom flows. There is no "Back" button — only navigation dots (clickable to go back) and "Continue"/"Done". |
| Style pipeline: "IP-Adapter (when exemplars available)" | **Outdated after the implementation change**. Style now uses top-level `reference_image_url` guidance with a single selected exemplar. |
| Widget table lists `Flux + IP-Adapter` pipeline for Style | **Outdated after the implementation change**. The current user-facing wording should describe a reference-image-guided style pipeline. |
| Key Files table: `widget-step.tsx` as "Shared WidgetWizard + WidgetStep" | **Overstated**. Only used by StyleGallery. Not a shared system across widgets. |

---

<a id="discrepancies"></a>
## Discrepancies Between the Two Audits

### Where the claude audit was more accurate

1. **WidgetWizard documentation drift** — Correctly identified that only StyleGallery uses it, and there's no Back button. Codex audit didn't flag this.
2. **Style Gallery preview block** — Correctly identified it was silently discarded by WidgetWizard at audit time. Fixed in code on 2026-03-30 by moving it outside `WidgetWizard`.
3. **Dead code inventory** — More comprehensive: `sv()`, `Eraser` import, `MaskPainter` unreachable path, `enrichedPrompt` dead field, `konva`/`react-konva` unused deps.
4. **Line number precision** — 16 of 17 line references verified exactly correct (one was off by 1 on `fal.storage.upload` reference).

### Where the codex audit was more accurate

1. **IP-Adapter payload errors** — Correctly identified all three field name errors and the missing adapter weights path. The later live validation failure directly motivated the switch to the simpler reference-only style path.
2. **Stale depth maps** — Identified as a standalone issue with clear code path tracing. The original claude audit folded this into ISSUE-1 tangentially.
3. **Mask clearing bug** — Identified the `{ dataUrl: "" }` truthiness problem. Missing from the original claude audit.
4. **Token offset recomputation** — Unique finding: `indexOf` replacing model-provided offsets. Not in claude audit at all.
5. **Stale detected tokens** — Unique finding: tokens persist when prompt becomes short/empty. Not in claude audit.
6. **fal data URL claim** — Correctly identified that data URIs are technically accepted (per current docs), challenging the CLAUDE.md claim. The claude audit accepted the CLAUDE.md claim without verification.
7. **Gemini depth map severity** — Correctly downgraded from "HIGH bug" to "unverified hypothesis." The claude audit stated model behavior predictions as established facts.

### Where the codex audit was wrong or overstated

1. **"Image encoder path is not mentioned"** — Actually, the codex audit missed this too. The fal public docs show `image_encoder_path` as a required IP-Adapter field. Neither audit caught this, which is part of why the simpler reference-only path now looks preferable.
2. **MaskPainter "works correctly"** — The codex audit flagged the mask clearing bug separately but then the claude audit's widget section said "MaskPainter works correctly" which the codex audit correctly caught as inconsistent.

### Genuinely uncertain items

1. **Reference-only quality vs IP-Adapter quality** — The simpler `reference_image_url` path is now implemented because it is easier to validate and better aligned with the UI, but the exact qualitative tradeoff versus IP-Adapter has still not been empirically measured in this repo.
2. **Gemini depth map quality** — Both audits agree the concern is plausible. Neither has empirical evidence. The claude audit overstates certainty; the codex audit correctly labels it a hypothesis.
3. **Whether `fal.storage.upload` is truly required in practice** — The docs say data URIs work but are discouraged. The CLAUDE.md says they're rejected. This may reflect an actual server-side rejection for large images that the docs don't cover, or it may be outdated. The upload approach is correct regardless.

---

<a id="action-items"></a>
## Prioritized Action Items

### Must Fix (pipeline correctness)

1. **Verify the new reference-only style path live (Issue 1)**
   - Run a style-only smoke test against the Fal endpoint
   - Run a mixed depth+style smoke test to confirm coexistence with ControlNet inputs
   - Tune `reference_strength` if the current slider mapping feels too weak or too strong

2. **Invalidate cached depth maps (Issue 3)**
   - Clear `depthMapDataUrl` when `spatialRegions` change
   - Clear `depthMapDataUrl` when `poseSelection` changes (if map was generated with pose awareness)
   - Add `poseKeypoints` to `handleGenerateMap` dependency array (Issue 6)

3. **Harden inpainting routing (Issue 4)**
   - Change router check to `if (ws.maskRegion?.dataUrl && previousImageUrl)`, or clear `maskRegion` to `undefined` on mask clear

### Should Fix

4. **Fix `/api/inpaint` route response (Issue 5)** — destructure return or remove unused route
5. **Fix token offset recomputation (Issue 7)** — use model offsets when they match the text; fall back to `indexOf` only when they don't
6. **Clear stale detected tokens (Issue 10)** — clear tokens when prompt is too short
7. **Update CLAUDE.md** — correct claims about WidgetWizard, style conditioning mechanism, fal.storage.upload, and `path`

### Nice to Have

8. **Remove dead code** — `sv()`, `Eraser` import, unreachable `MaskPainter` import, dead `enrichedPrompt` field
9. **Remove unused dependencies** — `konva`, `react-konva`
10. **A/B test Gemini vs client-side depth maps (Issue 2)** — empirical comparison needed
11. **Measure actual base64 payload sizes (Issue 11)** — verify whether this is a real deployment concern

---

## API Routes Summary

| Route | File | Status | Notes |
|---|---|---|---|
| `POST /api/detect-tokens` | `app/api/detect-tokens/route.ts` | **OK** | Validates prompt, calls `detectTokens()`, returns `{ tokens }` |
| `POST /api/generate` | `app/api/generate/route.ts` | **OK** | `maxDuration=120`, routes through `routeGeneration()` |
| `POST /api/generate-pose` | `app/api/generate-pose/route.ts` | **OK** | Validates description, calls `generatePoseVariations()` |
| `POST /api/generate-spatial-map` | `app/api/generate-spatial-map/route.ts` | **OK** | Validates regions, calls `generateSpatialMap()` |
| `POST /api/generate-style-refs` | `app/api/generate-style-refs/route.ts` | **OK** | Validates inputs, parallel `Promise.allSettled`, returns `{ images }` |
| `POST /api/inpaint` | `app/api/inpaint/route.ts` | **BUG** | Response shape mismatch (Issue 5). Not called by frontend. |

---

## Conditioning Pipeline Summary

| Token Type | Widget | Conditioning Signal | Pipeline Used | Status |
|---|---|---|---|---|
| Spatial | Draggable rectangles + depth/rotation sliders | Gemini-refined depth map (priority) OR client-side rectangle depth map (fallback) → ControlNet depth | Flux + ControlNet | **Working** (stale cache issue, Issue 3) |
| Color | Preset palettes + custom hex picker | None (prompt enrichment only) | Text-only enrichment | **Working** |
| Style | Gallery (16 styles) + one selected reference concept + strength slider | Generated Gemini exemplar image → Fal upload → `reference_image_url` guidance (plus prompt enrichment) | Flux + Reference Image, or combined with other conditioning | **Implemented in code; live verification pending** (Issue 1) |
| Pose | Gemini 4x skeleton variations + draggable SVG joints | OpenPose skeleton 1024px → ControlNet pose | Flux + ControlNet | **Working** |
| Masking | Canvas painter over existing image | Binary B&W mask → Flux inpainting | Flux Inpainting | **Working** (router guard issue, Issue 4) |
