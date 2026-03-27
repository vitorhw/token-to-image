/**
 * Maps style names (from StyleGallery) to curated reference images for IP-Adapter.
 *
 * Images stored in public/styles/ at 512x512 JPEG.
 * Used when the Modal backend's IP-Adapter is enabled.
 */

export const STYLE_REFERENCES: Record<string, {
  imagePath: string;
  defaultStrength: number;
}> = {
  "Photorealistic": { imagePath: "/styles/photorealistic.jpg", defaultStrength: 0.4 },
  "Impressionist": { imagePath: "/styles/impressionist.jpg", defaultStrength: 0.65 },
  "Watercolor": { imagePath: "/styles/watercolor.jpg", defaultStrength: 0.65 },
  "Oil Painting": { imagePath: "/styles/oil-painting.jpg", defaultStrength: 0.6 },
  "Anime": { imagePath: "/styles/anime.jpg", defaultStrength: 0.7 },
  "Pixel Art": { imagePath: "/styles/pixel-art.jpg", defaultStrength: 0.7 },
  "Sketch": { imagePath: "/styles/sketch.jpg", defaultStrength: 0.6 },
  "Cinematic": { imagePath: "/styles/cinematic.jpg", defaultStrength: 0.5 },
  "Pop Art": { imagePath: "/styles/pop-art.jpg", defaultStrength: 0.7 },
  "Minimalist": { imagePath: "/styles/minimalist.jpg", defaultStrength: 0.5 },
  "Digital Art": { imagePath: "/styles/digital-art.jpg", defaultStrength: 0.55 },
  "Fantasy": { imagePath: "/styles/fantasy.jpg", defaultStrength: 0.6 },
  "Vintage": { imagePath: "/styles/vintage.jpg", defaultStrength: 0.55 },
  "Abstract": { imagePath: "/styles/abstract.jpg", defaultStrength: 0.65 },
  "Art Deco": { imagePath: "/styles/art-deco.jpg", defaultStrength: 0.6 },
  "Studio Ghibli": { imagePath: "/styles/studio-ghibli.jpg", defaultStrength: 0.7 },
};

/**
 * Load a style reference image as a base64 data URL.
 * Returns null if the image doesn't exist or can't be loaded.
 */
export async function loadStyleReference(styleName: string): Promise<string | null> {
  const ref = STYLE_REFERENCES[styleName];
  if (!ref) return null;

  try {
    const response = await fetch(ref.imagePath, { signal: AbortSignal.timeout(3000) });
    if (!response.ok) return null;
    const contentType = response.headers.get("content-type") ?? "";
    if (!contentType.startsWith("image/")) return null;
    const blob = await response.blob();
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}
