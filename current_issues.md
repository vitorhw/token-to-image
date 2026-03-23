# Planned Changes

## Change 1: Remove Lighting Widget Entirely — DONE

Lighting had no dedicated ControlNet mode. It was sent as `control_mode: "depth"`, causing geometric distortions and duplicate depth conflicts. Removed the widget and all conditioning plumbing. Text enrichment handles lighting naturally from the user's prompt.

---

## Change 2: Camera Widget — Keep Text Enrichment, Drop Depth Map — DONE

Camera depth maps were too crude (bird's eye = near-uniform gray, eye level = simple gradient). Text enrichment (`"bird's eye view, camera directly above..."`) was already doing the work. Camera UI (elevation, azimuth, focal length sliders) and text enrichment remain; `renderCameraDepthMap` was removed.

---

## Change 3: Style Widget — Gemini-Generated Style Options

Replace the hardcoded 16-style gallery with dynamic, prompt-aware style suggestions from Gemini. When the user clicks a style token, Gemini reads the full prompt to understand the user's intent, then suggests styles — some matching the prompt's mood/subject, some exploratory for creative discovery. The user selects one, and the style name is prepended to the enriched prompt (text enrichment only — no IP-Adapter or ControlNet signal for now).

### New API endpoint

Create `app/api/generate-styles/route.ts`:
- POST with `{ prompt: string, tokenText: string }`
- Calls a new `generateStyleSuggestions` function in `lib/gemini.ts`
- Returns `{ styles: StyleSuggestion[] }`

### New Gemini function

Add `generateStyleSuggestions(prompt: string, tokenText: string)` to `lib/gemini.ts`:

**Prompt design** — Gemini should:
1. Read the ENTIRE user prompt to understand the subject, mood, setting, and intent
2. Consider what the token text hints at (e.g., "watercolor" suggests the user already has a direction; "cinematic" suggests film look)
3. Return ~6-8 style suggestions, split into:
   - **3-4 "intent-matched"** styles that align with the prompt's mood/subject (e.g., a sunset beach scene → "Golden Hour Photography", "Impressionist Landscape", "Tropical Watercolor")
   - **2-3 "exploratory"** styles that offer surprising but valid creative directions (e.g., same beach → "Ukiyo-e Woodblock", "Synthwave Retrowave", "Pencil Sketch")
   - **1 "wild card"** that's genuinely unexpected (e.g., "Isometric Pixel Art Beach")
4. Each suggestion should include:
   - `styleName`: the style label (this gets prepended to the prompt)
   - `description`: 1-sentence explanation of why this style works for this prompt
   - `category`: `"matched"` | `"exploratory"` | `"wildcard"` — so the UI can visually group them
   - `promptModifier`: the actual text to prepend (may differ from display name, e.g., styleName "Golden Hour" → promptModifier "golden hour photography, warm amber light, lens flare, soft shadows")

**Structured JSON schema** — use the same `responseMimeType: "application/json"` + `responseSchema` pattern as `detectTokens` and `generatePoseVariations`.

### Files to modify

| File | What to do |
|------|------------|
| `lib/gemini.ts` | Add `generateStyleSuggestions(prompt, tokenText)` function |
| `app/api/generate-styles/route.ts` | New file — POST endpoint calling `generateStyleSuggestions` |
| `components/widgets/style-gallery.tsx` | Complete redesign: replace `ALL_STYLES` grid with async-loaded Gemini suggestions. Add loading state (similar to pose-editor's "Generate" flow). Show grouped suggestions (matched / exploratory / wildcard). On select, store `styleName` + `promptModifier` |
| `types/tokens.ts` | Update `StyleSelection` interface: add `promptModifier: string` field. Keep `styleName` (display) and `strength` (future use). Remove `exemplarUrl` (dead code, IP-Adapter is broken and being deferred) |
| `lib/pipeline-router.ts` | In `buildEnrichedPrompt`: change `ws.styleSelection?.styleName` (line 33-35) to use `ws.styleSelection?.promptModifier` instead, since the prompt modifier is more descriptive than the display name |
| `lib/fal.ts` | Remove the broken `ip_adapters` block (lines 93-96) entirely — IP-Adapter is not functional and style is text-only for now |

### Considerations

- **Latency**: Gemini style generation will take ~1-2s. The pose editor already has this pattern (click "Generate" → loading → show 4 variations → user picks one). Mirror that UX: show a "Generate style suggestions" button or auto-trigger on popover open, with a spinner while loading.
- **Caching**: If the user closes and reopens the style popover without changing the prompt, should we re-call Gemini? Probably cache the last result keyed by prompt text to avoid redundant API calls. Store in component state or parent state.
- **`promptModifier` vs `styleName`**: The `styleName` is for UI display ("Golden Hour Photography"). The `promptModifier` is what actually gets prepended to the enriched prompt ("golden hour photography, warm amber light, lens flare, soft shadows"). Gemini should generate both. The modifier can be more detailed and include visual keywords that FLUX responds well to.
- **Strength slider**: Remove for now. Text prepending has no "strength" dial. Revisit when/if IP-Adapter or LoRA support is added.
- **`hasConditioningImages` in pipeline-router.ts**: Currently checks `styleSelection?.exemplarUrl`. Since we're removing `exemplarUrl`, and style is now text-only, style selection should NOT trigger the ControlNet pipeline by itself. Remove `styleSelection?.exemplarUrl` from the `hasConditioningImages` check.
- **Removing `exemplarUrl`**: This field was always empty ("") and the IP-Adapter code was broken. Removing it is safe.
- **Fallback**: If Gemini style generation fails, fall back to a small hardcoded list of common styles (Photorealistic, Watercolor, Cinematic, Anime, Oil Painting).

---

## Change 4: Depth Conditioning Tuning — DONE

The depth map from spatial regions was overpowering the generation — producing literal rectangles matching the depth map and ignoring the rest of the prompt. Three compounding issues: scale too high, end percentage too high, blur insufficient.

### What was changed

| Parameter | Before | After | File |
|-----------|--------|-------|------|
| `conditioning_scale` | 0.80 | 0.45 | `lib/fal.ts:77` |
| `end_percentage` | 0.80 | 0.40 | `lib/fal.ts:77` |
| Depth map blur | 3px | 18px | `lib/conditioning.ts:45` |

### Rationale

- **Scale 0.8 → 0.45**: Treats depth as a soft compositional guide rather than a hard constraint. The synthetic rectangular depth maps don't resemble real MiDaS output, so high adherence produces artifacts.
- **End % 0.8 → 0.4**: Frees the model for the last 60% of the denoising process to focus on prompt content and natural detail. At 0.8, the model was locked into rectangular structure with only 20% runway to add texture.
- **Blur 3px → 18px**: Softens sharp rectangle edges into gradients that better approximate MiDaS-style depth maps. ControlNet was trained on smooth depth estimation output, not hard-edged geometric diagrams.

---

## Change 5: Semantic Segmentation Map (ControlNet `segment` mode)

### Problem

The depth map carries zero semantic information. It tells ControlNet "something is at this depth at this location" but not *what* should be there. The labels from spatial regions (e.g., "man", "rock") are only communicated via text enrichment in `buildEnrichedPrompt`, and the model must independently correlate vague positional text ("man placed on the left third, in the foreground") with the corresponding bright rectangle in the depth map. This coupling is weak and unreliable.

### Proposed solution

Add a **color-coded segmentation map** alongside the depth map, using ControlNet Union Pro 2.0's `control_mode: "segment"`. Each spatial region gets painted with the ADE20K color corresponding to its semantic class, giving ControlNet a direct signal: "a *person* goes here, a *rock* goes there."

### Implementation steps

#### 5a. ADE20K class lookup table

Add a lookup table mapping ADE20K class index → RGB color. The ControlNet segmentation encoder was trained on ADE20K's 150-class palette with specific colors per class. Common classes:

| Class | ADE20K Index | Use cases |
|-------|-------------|-----------|
| person | 12 | people, characters, figures |
| tree | 4 | trees, plants, vegetation |
| building | 1 | houses, structures, architecture |
| rock/mountain | 16 | rocks, boulders, cliffs |
| sky | 2 | sky, clouds |
| grass/field | 9 | ground, meadows, lawns |
| water | 21 | rivers, lakes, oceans |
| floor | 3 | indoor ground surfaces |
| wall | 0 | indoor/outdoor walls |
| car | 20 | vehicles |
| chair | 19 | furniture |
| table | 33 | furniture |
| animal | 126 | animals |

File: new constant in `lib/conditioning.ts` or a dedicated `lib/ade20k.ts`

#### 5b. Label → ADE20K class mapping via Gemini

Add a Gemini call that maps user-provided spatial region labels to the nearest ADE20K class. Uses the same `responseMimeType: "application/json"` + `responseSchema` pattern as `detectTokens`.

- Input: `{ labels: ["confident businesswoman", "large rock", "sunset sky"] }`
- Output: `{ mappings: [{ label: "confident businesswoman", ade20kClass: "person" }, { label: "large rock", ade20kClass: "rock" }, { label: "sunset sky", ade20kClass: "sky" }] }`
- Provide the list of available ADE20K classes in the prompt so Gemini picks from a fixed set

Files: `lib/gemini.ts` (new function), `app/api/map-segments/route.ts` (new endpoint) or inline into the generate flow

#### 5c. Render segmentation map

New function `renderSegmentationMap(regions: SpatialRegion[], classMapping: Record<string, string>)` in `lib/conditioning.ts`:

- 1024×1024 canvas (same as depth map)
- Background: fill with a contextual default class color (e.g., sky or grass — could be Gemini-determined or hardcoded)
- For each spatial region: fill rectangle with the ADE20K color for its mapped class
- **No blur** — segmentation maps have hard edges by design (unlike depth maps). ADE20K training data has crisp class boundaries.
- Painter's algorithm: sort by depth, paint far regions first

#### 5d. New WidgetState field

Add `segMapDataUrl?: string` to `WidgetState` in `types/tokens.ts`, mirroring `depthMapDataUrl`.

#### 5e. Wire into generation flow

In `app/page.tsx` `handleGenerate`:
1. If spatial regions exist, call Gemini to map labels → ADE20K classes
2. Call `renderSegmentationMap(regions, classMapping)`
3. Set `widgetStateWithImages.segMapDataUrl`

In `lib/fal.ts` `generateWithControls`:
- Add a third control entry: `{ control_image_url: url, control_mode: "segment", conditioning_scale: TBD, end_percentage: TBD }`

In `lib/pipeline-router.ts`:
- Add `ws.segMapDataUrl` to `hasConditioningImages()` check

#### 5f. Depth + Segmentation interaction

Running both controls simultaneously could reinforce or conflict. The depth map says "something at this brightness here" and the seg map says "a person here." Options:
- **Stack both**: depth for spatial structure, segmentation for semantic binding. Start here — Union Pro supports multiple controls.
- **Drop depth, keep segmentation only**: if segmentation alone provides sufficient spatial guidance (regions are placed at specific positions), depth becomes redundant. Test this.
- **Merge into one**: encode depth as brightness variation *within* the segmentation colors. Non-standard, likely won't work with the trained encoder.

Recommendation: start with both stacked, test with segmentation only as a simplification.

### Key risks

1. **Does `fal-ai/flux-general` with Union Pro 2.0 actually accept `control_mode: "segment"`?** The model card lists it but Flux-based segmentation is less tested than SD versions. Needs a quick validation test before full implementation.
2. **ADE20K palette accuracy**: Using slightly wrong RGB values could map to the wrong class. Need the exact palette spec.
3. **Lossy class mapping**: "confident businesswoman" → "person" works. Unusual subjects (e.g., "mythical dragon") have no good ADE20K class. Fallback behavior needed (skip segmentation for unmappable labels, or use a generic "object" class).
4. **Extra latency**: Gemini class mapping adds ~1s to the generation flow. Can be parallelized with depth map rendering.

### Files to modify

| File | What to do |
|------|------------|
| `lib/conditioning.ts` | Add ADE20K color palette constant, add `renderSegmentationMap()` function |
| `lib/gemini.ts` | Add `mapLabelsToADE20K(labels: string[])` function |
| `lib/fal.ts` | Add `segMapDataUrl` upload + `control_mode: "segment"` control entry in `generateWithControls` |
| `lib/pipeline-router.ts` | Add `segMapDataUrl` to `hasConditioningImages()`. Potentially simplify spatial text enrichment (segmentation map now carries semantic info directly) |
| `types/tokens.ts` | Add `segMapDataUrl?: string` to `WidgetState`. Add `ConditioningImage` type `"segment"` |
| `app/page.tsx` | Add Gemini class mapping call + `renderSegmentationMap` call in `handleGenerate`. Add seg map to debug images |
| `docs/PIPELINE.md` | Update pipeline flow to show segmentation map path |
| `CLAUDE.md` | Add segmentation to conditioning scales table, update ControlNet schema example |

### Prerequisite

Before implementing: send a hardcoded ADE20K-colored test image to `fal-ai/flux-general` with `control_mode: "segment"` via the existing pipeline to confirm the API accepts it and produces semantically guided output.

---

## Implementation Order

1. ~~**Change 1 (Remove lighting)** — DONE~~
2. ~~**Change 2 (Drop camera depth map)** — DONE~~
3. **Change 3 (Style widget redesign)** — new API endpoint + Gemini function + UI redesign
4. ~~**Change 4 (Depth conditioning tuning)** — DONE~~
5. **Change 5 (Semantic segmentation map)** — validate `control_mode: "segment"` first, then implement

Changes 3 and 5 are independent and can be done in either order. Change 5 should start with the API validation test.

---

# Pipeline Conditioning Audit — Current Issues

## Resolved Issues

### ~~1. Lighting map sent as `control_mode: "depth"` — RESOLVED (Change 1)~~

Lighting widget removed entirely. No more semantically wrong depth signals from lighting.

### ~~2. Duplicate `control_mode: "depth"` — RESOLVED (Change 1)~~

Only source of depth maps is now spatial regions. No duplicate depth entries possible.

### ~~5. Spatial depth map silently overrides camera depth map — RESOLVED (Change 2)~~

Camera no longer produces a depth map. Spatial regions have exclusive ownership of the depth signal.

### ~~7. Camera widget generates conditioning at default values — RESOLVED (Change 2)~~

Camera no longer generates any conditioning image. Text enrichment only.

### ~~4 (partial). Depth maps too weak / too strong for ControlNet — RESOLVED (Change 4)~~

Depth scale reduced from 0.8 to 0.45, end percentage from 0.8 to 0.4, blur increased from 3px to 18px. Depth map is now a soft compositional guide. Remaining concern: the map is still synthetic rectangles, which the segmentation map (Change 5) aims to complement with semantic information.

---

## Open Issues

### 3. IP-Adapter configuration is structurally broken (latent bug)

**File:** `lib/fal.ts:93-96`

```javascript
input.ip_adapters = [{
  path: widgetState.styleSelection.exemplarUrl,      // WRONG: should be HuggingFace model path
  ip_adapter_scale: widgetState.styleSelection.strength // WRONG field name: should be "scale"
}];
```

Currently not triggered because `exemplarUrl` is always `""`. Will be removed as part of Change 3 (style widget redesign removes IP-Adapter code entirely).

### 6. No validation of conditioning image upload success

**File:** `lib/fal.ts:31-43`

`uploadDataUrl` logs a warning on HEAD check failure but does not throw. If upload fails or returns an invalid URL, the ControlNet request proceeds with a broken `control_image_url`. Low priority — hasn't caused observed issues.

### 8. Dead `enrichedPrompt` parameter in PipelineInput

**File:** `app/api/generate/route.ts`

```javascript
const result = await routeGeneration({
  prompt,
  enrichedPrompt: prompt,  // never used — routeGeneration builds its own
  ...
});
```

The `PipelineInput.enrichedPrompt` field is set to the raw prompt but never read. Dead code.

### 9. No semantic binding in depth conditioning (NEW)

**File:** `lib/conditioning.ts:31-47`, `lib/pipeline-router.ts:60-65`

The depth map is a grayscale geometric image with no information about *what* each region represents. Labels like "man" and "rock" from `SpatialRegion.label` are only communicated via text enrichment (`"Composition: man placed on the left third..."`). The model must independently correlate vague positional text with depth map rectangles. This is the motivation for Change 5 (semantic segmentation map).

---

## Current Conditioning Scales

| Signal | Scale | End % | File | Notes |
|--------|-------|-------|------|-------|
| Depth (spatial) | 0.45 | 0.40 | `lib/fal.ts:77` | Soft guide, 18px blur on synthetic rectangles |
| Pose | 0.90 | 0.65 | `lib/fal.ts:84` | OpenPose format, colored limbs (10px), white joints |
| Segmentation | TBD | TBD | — | Planned (Change 5) |
