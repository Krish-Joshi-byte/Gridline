"""
Quick static 3D preview of a scene.json, using matplotlib instead of three.js.

Why this exists: the real viewer (viewer/index.html) loads three.js from a CDN,
and this sandbox has no outbound network access at all (confirmed: even
npm/pip registries return 403 here), so that CDN script can't load inside
this terminal. This script renders the same wallCells + rooms data with
matplotlib's Poly3DCollection instead, purely so you can see the pipeline's
output *right now* without leaving the chat. It is not meant to replace
viewer/index.html -- once you open that file on your own machine (with normal
internet access) it will look better and be interactive (orbit/zoom, tinted
floor tiles, live loading of any scene.json via the file picker).
"""
import json
import sys
import numpy as np
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
from mpl_toolkits.mplot3d.art3d import Poly3DCollection

ROOM_COLORS = ["#2f81f7", "#3fb950", "#d29922", "#f85149", "#a371f7", "#39c5cf",
               "#ff8c00", "#00c878", "#dc3ca0", "#5a5aff"]


def box_faces(x0, y0, z0, dx, dy, dz):
    """Return the 6 quad faces of an axis-aligned box for Poly3DCollection."""
    pts = np.array([
        [x0, y0, z0], [x0+dx, y0, z0], [x0+dx, y0+dy, z0], [x0, y0+dy, z0],
        [x0, y0, z0+dz], [x0+dx, y0, z0+dz], [x0+dx, y0+dy, z0+dz], [x0, y0+dy, z0+dz],
    ])
    faces = [
        [pts[0], pts[1], pts[2], pts[3]],
        [pts[4], pts[5], pts[6], pts[7]],
        [pts[0], pts[1], pts[5], pts[4]],
        [pts[2], pts[3], pts[7], pts[6]],
        [pts[1], pts[2], pts[6], pts[5]],
        [pts[0], pts[3], pts[7], pts[4]],
    ]
    return faces


def draw(ax, data, w, d, cell, wh):
    # Floor
    ax.add_collection3d(Poly3DCollection(
        [[(0, 0, 0), (w, 0, 0), (w, d, 0), (0, d, 0)]],
        facecolor="#173a66", edgecolor="none", alpha=0.9))

    # Room tints
    # Rooms are drawn from their cell footprint (scene v3+) because real rooms
    # are rarely rectangles; fall back to the bbox for older scene files.
    for i, r in enumerate(data.get("rooms", [])):
        color = ROOM_COLORS[i % len(ROOM_COLORS)]
        floor = r.get("floor") or [[c*cell, rr*cell, cell, cell] for (c, rr) in r.get("cells", [])]
        if floor:
            quads = [[(x, z, 0.02), (x+w, z, 0.02), (x+w, z+d, 0.02), (x, z+d, 0.02)]
                     for (x, z, w, d) in floor]
            ax.add_collection3d(Poly3DCollection(quads, facecolor=color, edgecolor="none", alpha=0.6))
            a = sum(w*d for _, _, w, d in floor) or 1
            cx = sum((x+w/2)*w*d for x, _, w, d in floor)/a
            cz = sum((z+d/2)*w*d for _, z, w, d in floor)/a
        else:
            x0, z0, rw, rd = r["xM"], r["zM"], r["widthM"], r["depthM"]
            ax.add_collection3d(Poly3DCollection(
                [[(x0, z0, 0.02), (x0+rw, z0, 0.02), (x0+rw, z0+rd, 0.02), (x0, z0+rd, 0.02)]],
                facecolor=color, edgecolor="none", alpha=0.55))
            cx, cz = x0+rw/2, z0+rd/2
        ax.text(cx, cz, 0.05, r["label"], fontsize=7, color="white")

    # Walls, as extruded boxes
    faces_all = []
    # v4 scenes carry metre-space wall rectangles; v3 and earlier carried a
    # coarse cell grid, which is exactly the quantisation v4 got rid of.
    walls = data.get("walls")
    if walls is None:
        walls = [[c*cell, r*cell, cell, cell] for (c, r) in data.get("wallCells", [])]
    for (x, z, ww, dd) in walls:
        faces_all.extend(box_faces(x, z, 0, ww, dd, wh))
    ax.add_collection3d(Poly3DCollection(faces_all, facecolor="#8b949e", edgecolor="#555b62", linewidths=0.1, alpha=0.95))

    ax.set_xlim(0, w); ax.set_ylim(0, d); ax.set_zlim(0, wh*1.3)
    ax.set_xlabel("X (m)"); ax.set_ylabel("Z (m)"); ax.set_zlabel("Y / height (m)")


def render(scene_path, out_path):
    data = json.load(open(scene_path))
    meta = data["meta"]
    w, d = meta["widthM"], meta["depthM"]
    cell = meta.get("wallCellSizeM", 0.2)
    wh = meta.get("wallHeightM", 2.6)

    fig = plt.figure(figsize=(15, 7))
    # Two views: matplotlib has no real depth sorting, so walls hide the room
    # tints in the isometric view. The top-down panel is where you actually
    # check the segmentation.
    for i, (elev, azim, title) in enumerate(
            [(38, -60, "extruded walls"), (89, -90, "room footprints (top-down)")], start=1):
        ax = fig.add_subplot(1, 2, i, projection="3d")
        ax.set_box_aspect((w, d, wh * 1.3))
        draw(ax, data, w, d, cell, wh if i == 1 else 0.02)
        ax.view_init(elev=elev, azim=azim)
        ax.set_title(title, fontsize=10)
    fig.suptitle(f"{data.get('source_image','scene')} -- {w}x{d} m, "
                 f"{meta['roomCount']} room(s), "
                 f"{meta['pixelsPerMetre']} px/m\n"
                 f"(static matplotlib preview -- see frontend/index.html for the interactive viewer)",
                 fontsize=11)
    fig.tight_layout()
    fig.savefig(out_path, dpi=130)
    print("wrote", out_path)


if __name__ == "__main__":
    render(sys.argv[1], sys.argv[2])
