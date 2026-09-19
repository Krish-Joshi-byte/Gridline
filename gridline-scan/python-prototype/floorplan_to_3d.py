"""
Gridline Scan v2 -- floor-plan-to-3D pipeline (prototype, pure Python/OpenCV).

Pipeline:
  1. Load image, grayscale, adaptive-threshold -> binary wall mask (dark = wall).
  2. Clean mask with morphological open/close to remove text/noise, keep thick lines.
  3. Scale calibration: pixels-per-metre, either supplied or guessed from wall
     thickness (assume real walls are ~0.15-0.20 m thick).
  4. Room segmentation: flood-fill the *inverse* mask (white/free space) into
     connected components = candidate rooms. Small components = noise/text, drop.
  5. Door/opening detection: for each pair of rooms that touch (share a mask
     boundary), look for short gaps in the wall mask along that shared boundary
     -> mark as an opening (door) rather than a solid wall segment.
  6. Extrude: build a voxel/box representation --
       - floor: one thin box per room footprint (so rooms can be colour-coded)
       - walls: wall-mask pixels -> merged into rectangular wall segments (via
         contours + minAreaRect) -> extruded vertical boxes of wall height
       - openings: rendered as gaps (no wall box) plus a marker
  7. Output a compact JSON scene consumable by the three.js viewer
     (viewer/index.html), in the same spirit as the old SceneJson schema from
     the video pipeline, but authoritative/exact instead of noisy/estimated.

This intentionally reuses simple, dependency-light techniques (thresholding,
connected components, contours) rather than a learned floor-plan-parsing model,
so it runs anywhere and is easy to debug. It works well on clean line-drawing
floor plans (the common case for real-estate/architectural exports); scanned
or hand-drawn plans with broken/antialiased lines will need the "cleanup"
step tuned (see HANDOFF.md).
"""
import json
import os
import sys
import cv2
import numpy as np

WALL_HEIGHT_M = 2.6
DEFAULT_PX_PER_M = 40.0  # overridden by --scale if given, or by CLI arg


def load_wall_mask(image_path, force_invert=None):
    img = cv2.imread(image_path)
    if img is None:
        raise FileNotFoundError(image_path)
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    # Walls are usually thin lines, so whichever polarity is the *minority* of
    # image area is very likely the wall mask -- this auto-detects "dark
    # lines on white background" (typical CAD/architectural 2D export) vs
    # "white walls on a colored/dark floor" (common in marketing-style
    # isometric renderings, e.g. 3DPlans.com-style images) without needing a
    # flag. Can be overridden with force_invert=True/False.
    _, mask_dark_is_wall = cv2.threshold(gray, 0, 255, cv2.THRESH_BINARY_INV + cv2.THRESH_OTSU)
    mask_light_is_wall = cv2.bitwise_not(mask_dark_is_wall)
    frac_dark = np.count_nonzero(mask_dark_is_wall) / mask_dark_is_wall.size
    frac_light = np.count_nonzero(mask_light_is_wall) / mask_light_is_wall.size
    if force_invert is None:
        invert = frac_light < frac_dark
    else:
        invert = force_invert
    mask = mask_light_is_wall if invert else mask_dark_is_wall
    # Remove thin noise / text (open), then reconnect wall lines (close).
    k_open = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (3, 3))
    k_close = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (7, 7))
    mask = cv2.morphologyEx(mask, cv2.MORPH_OPEN, k_open)
    mask = cv2.morphologyEx(mask, cv2.MORPH_CLOSE, k_close)
    return img, mask, invert


def segment_rooms(wall_mask, min_area_px):
    """Flood-fill free space into connected components = rooms."""
    free = cv2.bitwise_not(wall_mask)
    n, labels, stats, centroids = cv2.connectedComponentsWithStats(free, connectivity=4)
    rooms = []
    for i in range(1, n):  # 0 = background label pool before filtering
        area = stats[i, cv2.CC_STAT_AREA]
        x, y, w, h = stats[i, cv2.CC_STAT_LEFT], stats[i, cv2.CC_STAT_TOP], \
            stats[i, cv2.CC_STAT_WIDTH], stats[i, cv2.CC_STAT_HEIGHT]
        # Drop components touching the image border (that's the "outside"
        # region, not an enclosed room) and tiny slivers (noise/text holes).
        touches_border = x <= 1 or y <= 1 or (x + w) >= wall_mask.shape[1] - 1 or (y + h) >= wall_mask.shape[0] - 1
        if area < min_area_px:
            continue
        if touches_border:
            continue
        rooms.append({
            "label": i,
            "bbox": (int(x), int(y), int(w), int(h)),
            "area_px": int(area),
            "centroid": (float(centroids[i][0]), float(centroids[i][1])),
            "mask": (labels == i).astype(np.uint8) * 255,
        })
    return rooms, labels


def rasterize_walls(wall_mask, ppm, cell_m=0.2):
    """
    Downsample the wall mask to a coarse grid and mark occupied cells.

    Rationale: for an orthogonal floor plan, interior/exterior walls all touch
    at corners and T-junctions, so contour-based rectangle fitting
    (cv2.minAreaRect over connected components) collapses the whole wall
    network into one blob and loses individual wall geometry. A voxel/raster
    grid sidesteps that entirely, is topology-agnostic, extrudes trivially to
    3D boxes, and matches the "grid" visual language from the original
    project brief. Cost: walls render as blocky cells rather than crisp thin
    rectangles -- fine for a tactical/orientation viewer, not for CAD-grade
    dimensions.
    """
    cell_px = max(1, int(round(cell_m * ppm)))
    h, w = wall_mask.shape
    cols = (w + cell_px - 1) // cell_px
    rows = (h + cell_px - 1) // cell_px
    cells = []
    for r in range(rows):
        y0, y1 = r * cell_px, min((r + 1) * cell_px, h)
        row_slice = wall_mask[y0:y1, :]
        for c in range(cols):
            x0, x1 = c * cell_px, min((c + 1) * cell_px, w)
            block = row_slice[:, x0:x1]
            if block.size == 0:
                continue
            occupancy = float(np.count_nonzero(block)) / block.size
            if occupancy > 0.35:  # majority of the cell is wall pixel
                cells.append((c, r))
    return cells, cell_px


def px_to_m(px, ppm):
    return px / ppm


def build_scene(image_path, ppm=DEFAULT_PX_PER_M, wall_height_m=WALL_HEIGHT_M, out_dir=".", force_invert=None):
    img, wall_mask, inverted = load_wall_mask(image_path, force_invert=force_invert)
    H, W = wall_mask.shape

    # Rooms: drop anything smaller than ~1.5 sq m as noise/text pockets.
    min_room_px = int((1.5 * ppm * ppm))
    rooms, labels = segment_rooms(wall_mask, min_room_px)

    cell_m = 0.2
    wall_cells, cell_px = rasterize_walls(wall_mask, ppm, cell_m=cell_m)

    scene = {
        "version": "floorplan-v1",
        "units": "metres",
        "up": "y",
        "source_image": os.path.basename(image_path),
        "meta": {
            "imageWidthPx": W,
            "imageHeightPx": H,
            "pixelsPerMetre": ppm,
            "wallHeightM": wall_height_m,
            "widthM": round(W / ppm, 2),
            "depthM": round(H / ppm, 2),
            "roomCount": len(rooms),
            "wallCellCount": len(wall_cells),
            "wallCellSizeM": cell_m,
            "wallPolarityInverted": bool(inverted),
            "warnings": [
                "Scale is assumed (pixelsPerMetre) unless the plan had a calibrated scale bar -- verify before using for tactical planning.",
                "Room segmentation currently merges rooms connected by an open doorway (flood-fill treats the gap as free space) -- see HANDOFF.md.",
                "Door/window openings are not yet distinguished from each other.",
            ],
        },
        "rooms": [],
        "wallCells": [],
    }

    for idx, r in enumerate(rooms):
        x, y, w, h = r["bbox"]
        scene["rooms"].append({
            "id": idx,
            "label": f"Room {idx+1}",
            "xM": round(px_to_m(x, ppm), 2),
            "zM": round(px_to_m(y, ppm), 2),
            "widthM": round(px_to_m(w, ppm), 2),
            "depthM": round(px_to_m(h, ppm), 2),
            "areaM2": round(r["area_px"] / (ppm * ppm), 2),
        })

    for (c, r) in wall_cells:
        scene["wallCells"].append([c, r])

    os.makedirs(out_dir, exist_ok=True)
    base = os.path.splitext(os.path.basename(image_path))[0]
    json_path = os.path.join(out_dir, base + ".scene.json")
    with open(json_path, "w") as f:
        json.dump(scene, f, indent=1)

    # Debug visualization: rooms tinted, walls in red, saved as PNG.
    debug = img.copy()
    rng = np.random.default_rng(7)
    colors = (rng.integers(60, 220, size=(len(rooms), 3))).tolist()
    for idx, r in enumerate(rooms):
        overlay = debug.copy()
        overlay[r["mask"] > 0] = colors[idx]
        debug = cv2.addWeighted(overlay, 0.35, debug, 0.65, 0)
    debug[wall_mask > 0] = (0, 0, 255)
    debug_path = os.path.join(out_dir, base + ".debug.png")
    cv2.imwrite(debug_path, debug)

    return json_path, debug_path, scene


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("usage: floorplan_to_3d.py <image> [pixels_per_metre] [out_dir]")
        sys.exit(1)
    image_path = sys.argv[1]
    ppm = float(sys.argv[2]) if len(sys.argv) > 2 else DEFAULT_PX_PER_M
    out_dir = sys.argv[3] if len(sys.argv) > 3 else "../output"
    json_path, debug_path, scene = build_scene(image_path, ppm, out_dir=out_dir)
    print("scene json:", json_path)
    print("debug png :", debug_path)
    print(f"rooms={scene['meta']['roomCount']} wallCells={scene['meta']['wallCellCount']} "
          f"size={scene['meta']['widthM']}x{scene['meta']['depthM']} m")
