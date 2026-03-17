import { createFalClient } from "@fal-ai/client";
import { WidgetState, ConditioningImage } from "@/types/tokens";

const fal = createFalClient({ credentials: process.env.FAL_KEY! });

async function uploadDataUrl(dataUrl: string): Promise<string> {
  const [header, base64] = dataUrl.split(",");
  const mime = header.match(/:(.*?);/)?.[1] ?? "image/png";
  const buffer = Buffer.from(base64, "base64");
  const blob = new Blob([buffer], { type: mime });
  const file = new File([blob], "conditioning.png", { type: mime });
  const url = await fal.storage.upload(file);
  return url;
}

export async function generateWithFlux(prompt: string) {
  console.log("[fal] Text-only generation");
  const result = await fal.subscribe("fal-ai/flux-general", {
    input: { prompt, image_size: "square_hd", num_images: 1, enable_safety_checker: false },
  } as any);
  return { imageUrl: (result.data as any).images[0].url as string, conditioningImages: [] as ConditioningImage[] };
}

export async function generateWithControls(options: {
  prompt: string;
  widgetState: WidgetState;
}): Promise<{ imageUrl: string; conditioningImages: ConditioningImage[] }> {
  const { prompt, widgetState } = options;
  const input: Record<string, any> = {
    prompt, num_images: 1, enable_safety_checker: false, image_size: "square_hd",
  };

  const controls: any[] = [];
  const conditioningImages: ConditioningImage[] = [];

  if (widgetState.depthMapDataUrl) {
    const url = await uploadDataUrl(widgetState.depthMapDataUrl);
    controls.push({ control_image_url: url, control_mode: "depth", conditioning_scale: 0.45 });
    conditioningImages.push({ label: "Depth / Camera Map", url, type: "depth" });
    console.log("[fal] ControlNet DEPTH (scale: 0.45)");
  }

  if (widgetState.poseImageDataUrl) {
    const url = await uploadDataUrl(widgetState.poseImageDataUrl);
    controls.push({ control_image_url: url, control_mode: "pose", conditioning_scale: 0.5 });
    conditioningImages.push({ label: "Pose Skeleton (ControlNet)", url, type: "pose" });
    console.log("[fal] ControlNet POSE (scale: 0.5)");
  }

  // Lighting map as ControlNet conditioning (using depth mode for light/shadow guidance)
  if (widgetState.lightingMapDataUrl) {
    const url = await uploadDataUrl(widgetState.lightingMapDataUrl);
    // Use low scale — lighting is a subtle guide, not hard constraint
    controls.push({ control_image_url: url, control_mode: "depth", conditioning_scale: 0.2 });
    conditioningImages.push({ label: "Lighting Map (ControlNet)", url, type: "depth" });
    console.log("[fal] ControlNet LIGHTING (scale: 0.2)");
  }

  if (controls.length > 0) {
    input.controlnet_unions = [{ path: "Shakker-Labs/FLUX.1-dev-ControlNet-Union-Pro", controls }];
  }

  if (widgetState.styleSelection?.exemplarUrl) {
    input.ip_adapters = [{ path: widgetState.styleSelection.exemplarUrl, ip_adapter_scale: widgetState.styleSelection.strength }];
    conditioningImages.push({ label: "Style Reference (IP-Adapter)", url: widgetState.styleSelection.exemplarUrl, type: "style" });
  }

  console.log("[fal] generateWithControls:", { controls: controls.length });

  try {
    const result = await fal.subscribe("fal-ai/flux-general", { input } as any);
    return { imageUrl: (result.data as any).images[0].url as string, conditioningImages };
  } catch (err: any) {
    console.error("[fal] Error:", JSON.stringify(err.body ?? err.message));
    throw err;
  }
}

export async function inpaintWithFlux(imageUrl: string, maskUrl: string, prompt: string) {
  const finalMaskUrl = maskUrl.startsWith("data:") ? await uploadDataUrl(maskUrl) : maskUrl;
  const result = await fal.subscribe("fal-ai/flux-general/inpainting", {
    input: { image_url: imageUrl, mask_url: finalMaskUrl, prompt, num_images: 1 },
  } as any);
  return { imageUrl: (result.data as any).images[0].url as string, conditioningImages: [{ label: "Inpainting Mask", url: finalMaskUrl, type: "mask" as const }] };
}
