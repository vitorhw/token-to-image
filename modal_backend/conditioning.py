"""Server-side conditioning image rendering using Pillow/numpy.

Renders depth maps, canny edge maps, and binary region masks
from structured widget data. All output as PIL Images (1024x1024).
"""

import numpy as np
from PIL import Image, ImageDraw, ImageFilter
from typing import Optional
import math

SIZE = 1024


def render_depth_map(
    regions: Optional[list[dict]] = None,
    camera: Optional[dict] = None,
) -> Image.Image:
    """Render a smooth depth map combining camera perspective and spatial regions.

    Depth convention: 0=far (black), 255=near (white) — matches Depth Anything V2.
    """
    pixels = np.zeros((SIZE, SIZE), dtype=np.float32)

    # Camera perspective base
    if camera:
        _compute_perspective_depth(camera, pixels)

    # Overlay spatial regions (sorted far-to-near)
    if regions:
        sorted_regions = sorted(regions, key=lambda r: r["depth"])
        for r in sorted_regions:
            _paint_region_with_fade(r, pixels)

    # Multi-pass Gaussian approximation (3 passes of box blur)
    img = Image.fromarray(np.clip(pixels * 255, 0, 255).astype(np.uint8), mode="L")
    blur_radius = 12 if (regions and camera) else 14 if regions else 10
    for _ in range(3):
        img = img.filter(ImageFilter.BoxBlur(blur_radius // 3))

    return img.convert("RGB")


def render_canny_map(regions: list[dict], line_width: int = 3) -> Image.Image:
    """Render white edge outlines on black background for ControlNet canny mode."""
    img = Image.new("L", (SIZE, SIZE), 0)
    draw = ImageDraw.Draw(img)

    sorted_regions = sorted(regions, key=lambda r: r["depth"])
    for r in sorted_regions:
        x0 = int(r["x"] * SIZE)
        y0 = int(r["y"] * SIZE)
        x1 = int((r["x"] + r["width"]) * SIZE)
        y1 = int((r["y"] + r["height"]) * SIZE)
        draw.rectangle([x0, y0, x1, y1], outline=255, width=line_width)

    # Slight blur to soften edges (matches real canny output)
    img = img.filter(ImageFilter.GaussianBlur(radius=2))
    return img.convert("RGB")


def render_region_mask(region: dict, feather: int = 8) -> Image.Image:
    """Render a binary mask for a single region with feathered edges."""
    img = Image.new("L", (SIZE, SIZE), 0)
    draw = ImageDraw.Draw(img)

    x0 = int(region["x"] * SIZE)
    y0 = int(region["y"] * SIZE)
    x1 = int((region["x"] + region["width"]) * SIZE)
    y1 = int((region["y"] + region["height"]) * SIZE)
    draw.rectangle([x0, y0, x1, y1], fill=255)

    if feather > 0:
        img = img.filter(ImageFilter.GaussianBlur(radius=feather))

    return img


def render_background_mask(regions: list[dict], feather: int = 8) -> Image.Image:
    """Render inverse mask: everything NOT covered by any region."""
    combined = np.ones((SIZE, SIZE), dtype=np.float32) * 255

    for r in regions:
        x0 = max(0, int(r["x"] * SIZE))
        y0 = max(0, int(r["y"] * SIZE))
        x1 = min(SIZE, int((r["x"] + r["width"]) * SIZE))
        y1 = min(SIZE, int((r["y"] + r["height"]) * SIZE))
        combined[y0:y1, x0:x1] = 0

    img = Image.fromarray(combined.astype(np.uint8), mode="L")
    if feather > 0:
        img = img.filter(ImageFilter.GaussianBlur(radius=feather))

    return img


def _compute_perspective_depth(camera: dict, pixels: np.ndarray):
    """Ray-ground plane intersection for camera perspective depth.

    Ported from lib/conditioning.ts computePerspectiveDepth().
    """
    elev_rad = math.radians(camera.get("elevation", 0))
    azimuth_rad = math.radians(camera.get("azimuth", 0))
    focal_length = camera.get("focalLength", 50)

    sensor_half = 18.0  # mm (half of 36mm full-frame)
    v_fov_half = math.atan(sensor_half / focal_length)
    cam_height = 1.5
    max_dist = 20.0

    for py in range(SIZE):
        screen_y = (py / SIZE - 0.5) * 2
        pixel_elev = -elev_rad - screen_y * v_fov_half

        for px in range(SIZE):
            screen_x = (px / SIZE - 0.5) * 2
            lateral_bias = screen_x * math.sin(azimuth_rad) * 0.12

            if pixel_elev < -0.005:
                dist = cam_height / math.sin(-pixel_elev)
                depth = max(0.0, 1.0 - dist / max_dist)
                depth = max(0.0, min(1.0, depth + lateral_bias))
            else:
                depth = 0.0

            pixels[py, px] = depth


def _paint_region_with_fade(region: dict, pixels: np.ndarray):
    """Paint a region onto the depth map with edge-fade gradients."""
    x0 = max(0, int(region["x"] * SIZE))
    y0 = max(0, int(region["y"] * SIZE))
    x1 = min(SIZE, int((region["x"] + region["width"]) * SIZE))
    y1 = min(SIZE, int((region["y"] + region["height"]) * SIZE))
    base_depth = region["depth"]

    cx = region["x"] + region["width"] / 2
    cy = region["y"] + region["height"] / 2
    hw = region["width"] / 2
    hh = region["height"] / 2

    for py in range(y0, y1):
        for px in range(x0, x1):
            # Edge fade: 15% falloff at boundaries
            dx = abs(px / SIZE - cx) / hw if hw > 0 else 0
            dy = abs(py / SIZE - cy) / hh if hh > 0 else 0
            fade = 1.0 - 0.15 * max(dx, dy)
            fade = max(0.5, fade)
            pixels[py, px] = base_depth * fade
