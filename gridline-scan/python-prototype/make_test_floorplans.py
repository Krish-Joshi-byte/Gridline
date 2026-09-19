"""
Generates simple, clean black-and-white floor plan test images that mimic the
style of floor plans commonly found online (e.g. real-estate listings,
architectural drawings): black wall lines on a white background, door gaps
left as small breaks in the wall line, room labels ignored (we only care
about geometry).

NOTE: the sandbox this was built in has no outbound network access (bash_tool
network is disabled, and web_fetch cannot save binary images to disk), so we
could not literally download floor plans from the web to test against. These
synthetic plans are deliberately drawn in the same visual convention
(solid black wall lines >= ~6px thick, door gaps, orthogonal rooms) that real
scanned/exported floor plans use, so the pipeline built against them should
transfer directly to a real photo/scan once one is uploaded. See HANDOFF.md.
"""
from PIL import Image, ImageDraw
import os

OUT_DIR = os.path.join(os.path.dirname(__file__), "..", "input")
os.makedirs(OUT_DIR, exist_ok=True)

WALL = (20, 20, 20)
BG = (255, 255, 255)
WALL_PX = 8  # wall thickness in pixels


def wall(draw, x1, y1, x2, y2, w=WALL_PX):
    draw.line([(x1, y1), (x2, y2)], fill=WALL, width=w)


def door_gap(draw, x1, y1, x2, y2, w=WALL_PX + 2):
    # erase a segment of wall to represent a doorway opening
    draw.line([(x1, y1), (x2, y2)], fill=BG, width=w)


def plan_small_apartment():
    """~9m x 7m, 2 bed 1 bath apartment. 40 px = 1 m."""
    S = 40
    W, H = int(9.5 * S), int(7.5 * S)
    img = Image.new("RGB", (W, H), BG)
    d = ImageDraw.Draw(img)
    ox, oy = 20, 20  # origin offset

    def pt(mx, my):
        return ox + mx * S, oy + my * S

    # Exterior shell 9x7
    wall(d, *pt(0, 0), *pt(9, 0))
    wall(d, *pt(9, 0), *pt(9, 7))
    wall(d, *pt(9, 7), *pt(0, 7))
    wall(d, *pt(0, 7), *pt(0, 0))

    # Interior walls
    wall(d, *pt(4, 0), *pt(4, 4))     # living/bed1 divider
    wall(d, *pt(4, 4), *pt(9, 4))     # hallway divider
    wall(d, *pt(6, 4), *pt(6, 7))     # bed2 / bath divider
    wall(d, *pt(7.5, 4), *pt(7.5, 7))  # bath / bed2b divider (closet)

    # Door gaps
    door_gap(d, *pt(4, 2), *pt(4, 2.9))     # living -> bed1 hallway... (simple)
    door_gap(d, *pt(5, 4), *pt(5.9, 4))     # hallway -> bath area
    door_gap(d, *pt(6, 5.2), *pt(6, 6))     # bed2/bath doorway
    door_gap(d, *pt(3.2, 0), *pt(4.2, 0))   # front entry on exterior wall

    img.save(os.path.join(OUT_DIR, "apartment_2bed.png"))
    return img


def plan_office_floor():
    """~16m x 10m open office with a ring of small offices + corridor."""
    S = 32
    W, H = int(16.5 * S), int(10.5 * S)
    img = Image.new("RGB", (W, H), BG)
    d = ImageDraw.Draw(img)
    ox, oy = 20, 20

    def pt(mx, my):
        return ox + mx * S, oy + my * S

    # Exterior shell
    wall(d, *pt(0, 0), *pt(16, 0))
    wall(d, *pt(16, 0), *pt(16, 10))
    wall(d, *pt(16, 10), *pt(0, 10))
    wall(d, *pt(0, 10), *pt(0, 0))

    # Corridor band
    wall(d, *pt(0, 3), *pt(16, 3))
    wall(d, *pt(0, 7), *pt(16, 7))

    # Offices along the top, 3 rooms
    for x in (5.3, 10.6):
        wall(d, *pt(x, 0), *pt(x, 3))
    # Offices along the bottom, 4 rooms
    for x in (4, 8, 12):
        wall(d, *pt(x, 7), *pt(x, 10))

    # Door gaps into each room from corridor
    for x in (2.3, 7.6, 13):
        door_gap(d, *pt(x, 3), *pt(x + 0.9, 3))
    for x in (1.5, 5.5, 9.5, 13.5):
        door_gap(d, *pt(x, 7), *pt(x + 0.9, 7))
    # Two exterior entries
    door_gap(d, *pt(7.5, 10), *pt(8.5, 10))
    door_gap(d, *pt(0, 4.5), *pt(0, 5.4))

    img.save(os.path.join(OUT_DIR, "office_floor.png"))
    return img


if __name__ == "__main__":
    plan_small_apartment()
    plan_office_floor()
    print("wrote test floor plans to", os.path.abspath(OUT_DIR))
