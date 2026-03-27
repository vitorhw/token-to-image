import { ModalGenerateRequest, ModalGenerateResponse } from "@/types/tokens";

function getModalUrl(): string | undefined {
  return process.env.MODAL_API_URL;
}

let healthCache: { ok: boolean; checkedAt: number } | null = null;
const HEALTH_CACHE_TTL = 60_000; // Cache health for 60s

function stripDataUrlPrefix(dataUrl: string): string {
  const idx = dataUrl.indexOf(",");
  return idx >= 0 ? dataUrl.substring(idx + 1) : dataUrl;
}

export async function isModalHealthy(): Promise<boolean> {
  const url = getModalUrl();
  if (!url) {
    console.log("[modal] MODAL_API_URL not set");
    return false;
  }

  if (healthCache && Date.now() - healthCache.checkedAt < HEALTH_CACHE_TTL) {
    return healthCache.ok;
  }

  try {
    // Follow redirects (Modal returns 303 during cold start)
    const res = await fetch(`${url}/health`, {
      method: "GET",
      redirect: "follow",
      signal: AbortSignal.timeout(15000), // 15s for cold start
    });
    const ok = res.ok;
    console.log(`[modal] Health check: ${ok ? "healthy" : "unhealthy"} (${res.status})`);
    healthCache = { ok, checkedAt: Date.now() };
    return ok;
  } catch (err) {
    console.log(`[modal] Health check failed: ${err instanceof Error ? err.message : err}`);
    healthCache = { ok: false, checkedAt: Date.now() };
    return false;
  }
}

export async function generateWithModal(
  request: ModalGenerateRequest,
): Promise<{ imageUrl: string; response: ModalGenerateResponse }> {
  const MODAL_API_URL = getModalUrl();
  if (!MODAL_API_URL) throw new Error("MODAL_API_URL not configured");

  // Strip data URL prefixes from all base64 fields
  const cleaned = {
    ...request,
    conditioning: {
      ...request.conditioning,
      depth_map: request.conditioning.depth_map
        ? stripDataUrlPrefix(request.conditioning.depth_map)
        : undefined,
      canny_map: request.conditioning.canny_map
        ? stripDataUrlPrefix(request.conditioning.canny_map)
        : undefined,
      style_reference: request.conditioning.style_reference
        ? stripDataUrlPrefix(request.conditioning.style_reference)
        : undefined,
      regions: request.conditioning.regions?.map((r) => ({
        ...r,
        mask: stripDataUrlPrefix(r.mask),
      })),
    },
  };

  console.log("[modal] Sending generation request...");
  const startTime = Date.now();

  const res = await fetch(`${MODAL_API_URL}/generate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(cleaned),
    redirect: "follow",
    signal: AbortSignal.timeout(180_000), // 180s: cold start (~60s) + inference (~30s)
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Modal backend error ${res.status}: ${err}`);
  }

  const data: ModalGenerateResponse = await res.json();
  const elapsed = Date.now() - startTime;
  console.log(`[modal] Generated in ${elapsed}ms (backend: ${data.generation_time_ms}ms) via ${data.pipeline_info}`);

  // Convert base64 image to data URL for display
  const imageUrl = `data:image/png;base64,${data.image_base64}`;

  return { imageUrl, response: data };
}
