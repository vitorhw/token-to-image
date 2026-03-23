import { createFalClient } from "@fal-ai/client";
import { WidgetState, ConditioningImage } from "@/types/tokens";

const fal = createFalClient({ credentials: process.env.FAL_KEY! });

function sanitizeForLog(obj: Record<string, any>): Record<string, any> {
  return JSON.parse(JSON.stringify(obj, (_key, value) => {
    if (typeof value === "string" && value.startsWith("data:")) {
      return `[data URL: ${Math.round(value.length / 1024)}KB]`;
    }
    if (typeof value === "string" && value.length > 200) {
      return value.slice(0, 200) + "...";
    }
    return value;
  }));
}

async function uploadDataUrl(dataUrl: string): Promise<string> {
  const [header, base64] = dataUrl.split(",");
  const mime = header.match(/:(.*?);/)?.[1] ?? "image/png";
  const buffer = Buffer.from(base64, "base64");
  const blob = new Blob([buffer], { type: mime });
  const file = new File([blob], "conditioning.png", { type: mime });

  console.log(`[fal] Uploading conditioning image: ${Math.round(buffer.length / 1024)}KB, mime: ${mime}`);

  const url = await fal.storage.upload(file);

  console.log(`[fal] Upload returned URL: ${url}`);

  // Verify the uploaded URL is accessible
  try {
    const headRes = await fetch(url, { method: "HEAD" });
    if (headRes.ok) {
      console.log(`[fal] Upload verified OK (status: ${headRes.status}, content-type: ${headRes.headers.get("content-type")})`);
    } else {
      console.warn(`[fal] Upload verification FAILED (status: ${headRes.status}) for: ${url}`);
    }
  } catch (err) {
    console.warn(`[fal] Upload verification ERROR: ${err instanceof Error ? err.message : err}`);
  }

  return url;
}

export async function generateWithFlux(prompt: string) {
  console.log("[fal] Text-only generation");
  const result = await fal.subscribe("fal-ai/flux-general", {
    input: { prompt, image_size: "square_hd", num_images: 1, enable_safety_checker: false },
    logs: true,
    onQueueUpdate: (update: any) => {
      console.log(`[fal] Queue status: ${update.status}`);
      if ("logs" in update && update.logs?.length) {
        for (const log of update.logs) {
          console.log(`[fal] Server: ${log.message}`);
        }
      }
    },
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
    controls.push({ control_image_url: url, control_mode: "depth", conditioning_scale: 0.45, end_percentage: 0.4 });
    conditioningImages.push({ label: "Depth / Camera Map", url, type: "depth" });
    console.log("[fal] ControlNet DEPTH (scale: 0.8, end: 0.8)");
  }

  if (widgetState.poseImageDataUrl) {
    const url = await uploadDataUrl(widgetState.poseImageDataUrl);
    controls.push({ control_image_url: url, control_mode: "pose", conditioning_scale: 0.9, end_percentage: 0.65 });
    conditioningImages.push({ label: "Pose Skeleton (ControlNet)", url, type: "pose" });
    console.log("[fal] ControlNet POSE (scale: 0.9, end: 0.65)");
  }

  if (controls.length > 0) {
    input.controlnet_unions = [{ path: "Shakker-Labs/FLUX.1-dev-ControlNet-Union-Pro-2.0", controls }];
  }

  if (widgetState.styleSelection?.exemplarUrl) {
    input.ip_adapters = [{ path: widgetState.styleSelection.exemplarUrl, ip_adapter_scale: widgetState.styleSelection.strength }];
    conditioningImages.push({ label: "Style Reference (IP-Adapter)", url: widgetState.styleSelection.exemplarUrl, type: "style" });
  }

  console.log("[fal] generateWithControls:", { controls: controls.length });
  console.log("[fal] Full input payload:", JSON.stringify(sanitizeForLog(input), null, 2));

  try {
    const result = await fal.subscribe("fal-ai/flux-general", {
      input,
      logs: true,
      onQueueUpdate: (update: any) => {
        console.log(`[fal] Queue status: ${update.status}`);
        if ("logs" in update && update.logs?.length) {
          for (const log of update.logs) {
            console.log(`[fal] Server: ${log.message}`);
          }
        }
      },
    } as any);
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
