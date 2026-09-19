# Gridline Scan: handoff notes v5 -- true-scale geometry + a walkable 3D model (Sep 19, 2026)

Read this first. Supersedes v4 (below); nothing has been deleted.

**The deliverable is now a 3D model, not a picture of one.** `--viewer` writes a single self-contained
HTML file you double-click to open: orbit it from outside, or switch to Walk and move through it at eye
height with the walls solid. That file is the thing to put in front of a dispatcher.

## 1. What was wrong with the scaling, and what fixed it

The overall scale (pixels per metre) was roughly right. What was wrong was **quantisation**: walls and
floors were emitted as a grid of 0.2 m cells, so every edge in the model got snapped to a 20 cm lattice.
A 10 cm partition became a 20 cm block, a 3.48 m room became 3.4 or 3.6 m, and a wall that should read
as one flat plane came out as a row of separate columns. Proportions inside the model were wrong by up
to 20 cm everywhere, independently of whether the px/m figure was right.

**Fix: no grid.** The wall and room masks are now decomposed into maximal axis-aligned rectangles at
**full pixel resolution** (`rectsFromMask`), then converted to metres by dividing by px/m. A wall edge in
the model sits exactly where the drawing put it, to within one pixel of the source image -- about 2 cm
at this plan's scale. The only remaining scale factor is px/m, which sets overall size and cannot
distort proportions.

Verification worth repeating after any change to the mask: take the metre-space rectangles out of the
scene JSON, multiply by px/m, and paint them back onto the source PNG. They should land exactly on the
drawn wall lines. They do.

Side effect: the model is also much lighter. 542 voxel cells became 1027 rectangles that are mostly long
runs, drawn as a single instanced mesh, and it looks like a building instead of a pin cushion.

## 2. Scale, now calibrated and cross-checked

`--calib` is repeatable and fits px/m by least squares across every measurement you give it, printing
the residual per measurement:

```
--calib "2=16'x18'6\""
  room 2:   243 px = 4.877 m ->  49.83 px/m  ( +1.9%)
  room 2:   272 px = 5.639 m ->  48.24 px/m  ( -1.4%)
  fitted scale: 48.92 px/m   (worst single measurement off by 1.9%)
```

**48.92 px/m is the calibrated scale for `apartment_2bed2bath_2d.png`**, from the living room's printed
16' x 18'6". Residuals under 2% on both axes.

Do **not** calibrate off either bedroom on this plan. They come back 16-18% high, and the warning fires:
each detected bedroom region includes its closet, which the printed dimension excludes, so the pixel
measurement isn't measuring the thing the label describes. That is the general rule -- calibrate off the
largest, most rectangular labelled room, and believe the residual warning when it fires.

## 3. Rooms

10 rooms at the calibrated scale. Each room now reports `clearWidthM`/`clearDepthM` (the modal wall-to-
wall run, shown in feet and inches in the viewer) alongside bbox and area, so a dispatcher reading "Room
3, 11'9" x 12'6", 166 sqft" can match it against the drawing.

Known and unfixed: **a room absorbs any closet that opens onto it at full width.** `--door` splits rooms
at narrow openings, and a closet with a full-width opening has no narrow neck to split at. The bedrooms
therefore read ~40 sqft larger than the brochure number. Wall positions are right; the area figure is
"room plus what opens directly into it". Splitting those needs opening classification (section 6).

`--door 0.55` is right for this plan; the synthetic plans draw much wider openings and want `--door 1.0`.
This is the one parameter to sweep when a room count looks wrong. Too small and nothing splits; too
large and real rooms fuse (at 1.3 the living room and kitchen merge into one 33 m² blob).

## 4. The 3D model

`--viewer` writes `<name>.model.html` into the output directory -- the viewer template with the scene
JSON and the source drawing (base64) substituted in. One file, no server, no scene.json beside it,
nothing fetched except three.js from a CDN. It is ~500 KB and opens by double-clicking.

What's in it:

- **Orbit** -- drag to rotate, scroll to zoom, right-drag to pan.
- **Walk inside** -- drops you in the middle of the largest room at 1.6 m eye height. W/A/S/D or arrows
  to move, Shift to run, drag to look. **Walls are solid**: there's a 0.08 m occupancy grid built from
  the wall rectangles and you slide along walls instead of clipping through them, so the only way from
  one room to another is through an actual opening in the drawing. That is the property that makes this
  worth anything operationally -- if you can walk it, a person can walk it.
- **Wall height slider** -- drop the walls to knee height for a dollhouse view of the whole unit at
  once, raise them to full 2.6 m to see what someone inside can actually see.
- **Floor plan underlay** -- the source drawing laid flat under the model at exactly the model's scale.
  This is the proportion check, live and in the viewer: if the 3D walls ever drift off the drawn lines,
  you will see it immediately.
- **Room list** -- click a room to fly to it; areas in sqft, clear dimensions in feet and inches.
- **Load another scene** -- file picker takes any `*.scene.json` (the floor plan underlay won't follow,
  since that's baked in per-file).

Wall height is a flat 2.6 m assumption. Nothing in a floor plan says how tall the walls are. If a
building's real ceiling height is known, change `WALL_HEIGHT_M` in the Java file.

`frontend/index.html` (the older generic viewer) still works and now reads both v3 and v4 scenes, but
the generated `.model.html` supersedes it for anything operational, and needs no local web server.

## 5. How to run it

**Requirements:** a JDK (17 or newer; tested on 21). Nothing else -- no Maven, no OpenCV, no npm, no
internet at build time. The viewer needs internet on first open to pull three.js from a CDN.

**Build once:**
```
cd gridline-scan
javac -d out backend/src/com/gridlinescan/FloorplanTo3D.java
```
(On a JRE-only box with no `javac`:
`java -m jdk.compiler/com.sun.tools.javac.Main -d out backend/src/com/gridlinescan/FloorplanTo3D.java`)

**The full run on the real plan -- this is the command that produced the shipped model:**
```
java -cp out com.gridlinescan.FloorplanTo3D \
     input/real/apartment_2bed2bath_2d.png 48.5 output \
     --door 0.55 --calib "2=16'x18'6\"" --viewer
```
Then open `output/apartment_2bed2bath_2d.model.html` in any browser. That's it.

**On a new floor plan, three steps:**

1. **Rough pass** to see the rooms and get their ids. Guess px/m from the image width: a one-bedroom
   drawn 800 px wide is roughly 800/12 m ≈ 65 px/m.
   ```
   java -cp out com.gridlinescan.FloorplanTo3D path/to/plan.png 65 output
   ```
   Look at `output/plan.debug.png`. Rooms are tinted, walls are red. If rooms are merging, lower
   `--door`; if separate rooms are fusing or vanishing, raise it.
2. **Calibrate** against a dimension printed on the drawing, using the id of a large rectangular room
   from step 1:
   ```
   java -cp out com.gridlinescan.FloorplanTo3D path/to/plan.png 65 output \
        --door 0.55 --calib "2=14'6\"x12'"
   ```
   Check the residuals it prints. Under ~3% is good. Over 6% it warns, and you should pick a different
   room rather than accept the fit.
3. **Build the model** by adding `--viewer` to the calibrated command. Open the `.model.html`.

**All options:**
```
java -cp out com.gridlinescan.FloorplanTo3D <image> [ppm] [outDir] [options]

  ppm                 pixels per metre; ignored if --calib is given
  --door METRES       widest opening that still splits two rooms (default 0.65)
  --calib ID=WxH      fit the scale from a room's printed dimensions; repeatable.
                      Accepts 11'5"x10'2", 16'x18'6", 3.48x3.10m
  --viewer            also write <name>.model.html, the standalone 3D model
  --template PATH     viewer template (default frontend/viewer.template.html)
  --ppm V             same as the positional ppm argument
```
`FP_DEBUG=1` logs blob filtering, core counts, the erosion radius in pixels, which label was treated as
exterior, why each label was dropped, and the vector rectangle counts. First thing to turn on when a
room count looks wrong.

**Outputs per run**, in the output directory:
```
<name>.model.html   standalone walkable 3D model  <- the deliverable
<name>.scene.json   geometry in metres (schema floorplan-v4-java)
<name>.debug.png    source image with rooms tinted and walls in red
```
`python3 python-prototype/render_preview.py <scene.json> <out.png>` still makes a static two-panel PNG
if you need to check a result from a terminal with no browser. It needs numpy/matplotlib; the Java path
needs nothing.

## 6. Current state and what's next

Baseline numbers to compare future changes against:

| image | args | rooms | wall rects |
|---|---|---|---|
| `real/apartment_2bed2bath_2d.png` | `48.5 output --door 0.55 --calib "2=16'x18'6\""` | 10 | 1027 |
| `synthetic/apartment_2bed.png` | `40 output --door 1.0` | 4 | 307 cells / 4 rooms |
| `synthetic/office_floor.png` | `40 output --door 1.0` | 2 | -- |
| `real/apartment_3dplans_2.png` | `40 output` | 6 (meaningless) | -- |

Next, in priority order:

1. **Classify openings.** Doors, windows and cased openings are all just gaps in a wall right now. They
   are recoverable cheaply -- a door is a narrow neck where two grown room labels meet -- and it would
   buy three things at once: splitting closets off rooms (section 3), marking exits and windows in the
   viewer, and letting a dispatcher say "second door on the left".
2. **Name the rooms.** The plan prints "Bedroom", "Kitchen", "Bath" inside each region, and the blob
   filter already isolates exactly that text as the thing it discards. Capture the discarded blobs, OCR
   them, assign each to the room whose mask contains it. "Room 3" becomes "Bedroom" and the model stops
   needing a legend. Java has no built-in OCR -- check what's fetchable outside the sandbox.
3. **Ceiling height** is assumed at 2.6 m. If it matters, take it from building records per address
   rather than from the drawing, which doesn't have it.
4. **Multi-floor / multi-unit.** Everything here is one plan, one level. A stairwell marker and a floor
   selector in the viewer is the obvious shape of that.
5. **Isometric marketing renderings are still out of scope**, unchanged since v3. Prefer the plain 2D
   plan whenever a listing offers both.
6. **Video-based object placement** onto the shell: still not built, still a separate later feature.

---

# Gridline Scan: handoff notes v4 -- room segmentation fixed, scale calibrated from the plan (Sep 19, 2026)

Read this first. Supersedes v3 (below); nothing has been deleted. The v2 Python prototype and the
original video/SfM plan are still in the zip too.

## 1. Headline: the pipeline now produces real rooms on a real floor plan

`input/real/apartment_2bed2bath_2d.png` went from **0 rooms** to **9 rooms at 49.1 px/m**, with the
scale solved from the dimensions printed on the drawing rather than guessed. The synthetic plan with
doorways went from **1 room to 4** -- the doorway-merging bug flagged as next-step #1 in v3 is fixed.

Current baseline (regenerate with the commands in section 5; these are the numbers to compare future
changes against):

| image | args | rooms | wall cells |
|---|---|---|---|
| `real/apartment_2bed2bath_2d.png` | `48.5 output --calib "2=16'x18'6\""` | 9 | 542 |
| `synthetic/apartment_2bed.png` | `40 output --door 1.0` | 4 | 307 |
| `synthetic/apartment_2bed_nodoors.png` | `40 output --door 1.0` | 4 | 341 |
| `synthetic/office_floor.png` | `40 output --door 1.0` | 2 | 465 |
| `real/apartment_3dplans_2.png` | `40 output` | 6 (meaningless, see v3 s.3) | 1980 |

## 2. Three bugs, in the order they had to be peeled apart

**2a. The wall mask was being destroyed before segmentation ever ran.** This was the one hiding all the
others, and v3 never caught it because v3 only ever looked at the *wall overlay* on the debug image,
which looked plausible. It wasn't. The cleanup step was `open(3x3)` then `close(7x7)`; opening with a
3x3 structuring element deletes anything thinner than 3px, and on this plan -- as on most real-estate
and CAD plans -- walls are drawn as **1-2px outlines**, not thick filled bands. The exterior wall, the
living-room walls and most partitions were simply gone from the mask; what survived was fragments plus
the thicker fixture outlines. Everything downstream was operating on rubble.

Replaced with **connected-component size filtering**: label the raw threshold mask, drop any blob whose
longest bounding-box side is under ~0.25 m, keep the rest. Walls are long thin runs so they survive;
tile grout dots, room labels, the printed dimension text and small fixture icons do not. This also
delivers v3's next-step #2 (stray furniture blobs) as a side effect, since it's the same filter. A 1px
dilate/erode afterwards heals antialiasing breaks without eating thin lines.

Diagnostic worth reusing: dump the wall mask on its own as a black-and-white PNG and look at it. Judging
the mask from the red overlay on top of the source image is how this survived two sessions -- the source
image underneath supplies the wall lines your eye expects to see.

**2b. Room segmentation: doorway gaps.** Fixed, as v3 predicted, but not with v3's suggested
bridged-mask diff. Instead: **erode free space by half a doorway width, label what survives as room
cores, then grow those labels back over the full free space with a multi-source BFS** (a watershed by
another name). Rooms pinch apart from each other at their doorways because a doorway is the narrowest
part of the connection; the regrow step then restores the true room extents. Nothing has to be
hallucinated into the wall mask, and the doorway width is a single explicit knob (`--door`, default
0.65 m) rather than a hidden constant.

`--door` is the one parameter you will actually have to tune per drawing style. The real plan wants
~0.65 m; the synthetic plans draw much wider openings and want ~1.0. Too small and rooms merge through
their doorways (the old behaviour); too large and genuinely separate rooms fuse -- at `--door 1.3` the
real plan's living room and kitchen merge into one 33 m² blob. Sweep it and look at the debug image.

**2c. Border rejection was rejecting real rooms.** Dropping every component that touches the image
border is wrong whenever the outer wall sits flush with the canvas edge, which is most of the time, and
it's why the left bedroom kept disappearing. Now the image is **padded with free space** and the single
component that owns the padded corner is dropped as "outside the building". Everything else is a
candidate room.

Subtlety that cost a debugging round: the pad has to be **wider than the erosion radius** (it's
`2*erodeRadius + 6`). With a thin pad the pad ring itself erodes away, the ring stops being one
connected component, and an enclosed outdoor notch -- the white cutout at the bottom right of the real
plan -- gets promoted to a 16 m² phantom "room".

## 3. Scale is now read off the drawing, not guessed

`--calib <roomId>=<WxH>` solves pixels-per-metre from the dimensions already printed on the plan. No
OCR, no Tesseract, no new dependency: run once to list the rooms, read one dimension off the drawing
yourself, run again with it.

```
java -cp out com.gridlinescan.FloorplanTo3D input/real/apartment_2bed2bath_2d.png 48.5 output
#   -> room 2  30.3 m2  243x273 px   <- the living room
java -cp out com.gridlinescan.FloorplanTo3D input/real/apartment_2bed2bath_2d.png 48.5 output \
     --calib "2=16'x18'6\""
#   -> 49.83 px/m across, 48.41 px/m down -> using 49.12 px/m
```

It accepts `11'5"x10'2"`, `16'x18'6"`, `3.48x3.10m`. It measures the room's **modal row width and
column height**, not the bounding box, because a room's bbox is inflated by the thin slivers it sends
out through its own doorways.

It also cross-checks the two axes against each other and warns when they disagree by more than 10%.
That warning is doing real work: calibrating off **either bedroom** on this plan produces a 13%
disagreement, because both bedrooms' detected regions swallow their closet and an adjacent passage, so
their pixel dimensions aren't the dimensions the label refers to. The living room is clean (2.8%
disagreement) and is what the baseline uses. **Calibrate off the largest, most rectangular labelled
room, and believe the warning when it fires.**

Sanity check on the result: the printed 11'5"x10'2" bedroom comes out at 166 sqft against 119 sqft
nominal, because the detected room includes its closet and the passage in front of it. Detected areas
are "room plus what opens directly into it", not the leasing-brochure number. Distances and wall
positions are right; per-room areas are generous. Worth knowing before anyone quotes them.

## 4. What the outputs look like now

- `output/*.debug.png` -- rooms tinted by their **actual mask** rather than their bounding box (v3 tinted
  bbox rectangles, which overlapped each other and looked like the segmentation had failed even when it
  hadn't). Walls still red.
- `output/*.scene.json` -- schema `floorplan-v3-java`. Rooms now carry a `cells` footprint (the coarse
  grid) alongside the bbox, plus `areaSqFt`. `wallCellSizeM` now reports the **true** cell size
  (`cellPx/ppm`) instead of a hardcoded 0.2, which was off by a few percent at odd scales and quietly
  mis-scaled the viewer.
- `output/*.3d.png` -- two panels now: extruded walls, and a top-down room-footprint view.
  matplotlib has no real depth sorting, so in the isometric panel the walls hide the room tints; the
  top-down panel is where you actually check segmentation.
- `frontend/index.html` -- draws room floors from `cells`, so L-shaped rooms render as L-shaped, and
  lists the rooms with areas in the side panel. Still falls back to bbox rectangles for older scene
  files. Unchanged otherwise: still three.js from a CDN, still needs a local HTTP server (`python3 -m
  http.server` in `frontend/`) because `fetch("./demo.scene.json")` is blocked under `file://`.
  `frontend/demo.scene.json` is now the real apartment scene rather than the synthetic one.

## 5. Commands

```
javac -d out backend/src/com/gridlinescan/FloorplanTo3D.java
# (JRE-only sandbox: java -m jdk.compiler/com.sun.tools.javac.Main -d out backend/src/com/gridlinescan/FloorplanTo3D.java)

java -cp out com.gridlinescan.FloorplanTo3D <image> [ppm] [outDir] [--door M] [--calib ID=WxH]

# the real plan, calibrated:
java -cp out com.gridlinescan.FloorplanTo3D input/real/apartment_2bed2bath_2d.png 48.5 output --calib "2=16'x18'6\""
# the synthetics (wider drawn openings):
java -cp out com.gridlinescan.FloorplanTo3D input/synthetic/apartment_2bed.png 40 output --door 1.0

python3 python-prototype/render_preview.py output/foo.scene.json output/foo.3d.png   # static preview
cd frontend && python3 -m http.server 8000                                           # real viewer
```

`FP_DEBUG=1` now logs core counts, the erosion radius in pixels, which label was treated as exterior,
and why each label was dropped. That is the first thing to turn on when a room count looks wrong.

## 6. Still true, still not done

- **Openings are not classified.** Doors, windows and cased openings are all just gaps. The erode/regrow
  approach means door *locations* are recoverable cheaply -- they're the narrow necks where two grown
  labels meet -- but nothing does that yet. This is the natural next step and is now a small one.
- **Rooms are unlabelled** (`Room 1`, `Room 2`...). The plan prints "Bedroom", "Kitchen", "Bath" right
  inside each region, and the blob filter from section 2a already isolates exactly that text as the
  things it throws away. Capturing those discarded blobs, OCR'ing them, and assigning each to the room
  whose mask contains it would name every room. Same "check what's fetchable outside the sandbox"
  caveat on OCR as in v3.
- **Detected areas include closets and adjacent passages** (section 3). Splitting closets off would need
  either the opening classifier above or a second, smaller `--door` pass.
- **The isometric-rendering input style is still out of scope**, unchanged from v3 section 3. It now
  returns 6 "rooms" instead of 0, which is worse, not better -- they're artifacts of the furniture and
  shadow edges. Don't read anything into that number. Prefer the plain 2D plan whenever one exists.
- **Video-based object placement** onto the shell: still not built, still a separate later feature.
- `backend/src/com/gridlinescan/FloorplanTo3D.v2.java.reference` is the previous version, kept for diffing
  (it has a `.reference` extension so `javac` won't pick it up).

---

# Gridline Scan: handoff notes v3 -- Java port + first real floor plan tests (Sep 19, 2026)

Read this first. Supersedes v2 (`python-prototype/` folder), which itself superseded the original
video/SfM plan. All three are kept in this zip; nothing has been deleted.

## 1. What changed this session

1. **Backend ported to pure Java** (per explicit request): `backend/src/com/gridlinescan/FloorplanTo3D.java`
   reimplements the whole pipeline -- grayscale, thresholding, binary morphology, connected-components room
   segmentation, wall rasterization, JSON output -- using **only the JDK** (`java.awt.image`, `javax.imageio`).
   No OpenCV, no Maven, no external dependency of any kind, because this sandbox still has zero outbound
   network access (confirmed again this session: `curl`, `npm`, and `pip` to any registry all return 403).
   That means it also needs nothing to compile on a normal machine with a JDK -- no `pom.xml`, no internet
   required at build time.
2. **Frontend is unchanged and already Java-project-friendly**: `frontend/index.html` is the same
   three.js/vanilla-JS viewer from before -- it was already plain HTML/JS, so the "frontend in
   HTML/JavaScript" request was already satisfied; it now lives under `frontend/` instead of `viewer/` to
   match the backend/frontend split you asked for.
3. **Tested on two real, user-provided floor plans for the first time** (previously only synthetic
   test images were available -- no internet meant nothing could be downloaded). Results and a real bug
   found because of this are in section 3.
4. **Found and fixed a real bug**: binary erosion was treating "off the edge of the image" as background,
   which silently deletes any wall that sits at or near the image border on every erosion pass. This is
   common (a floor plan's exterior wall is very often right at the image edge) and was actively breaking
   room segmentation on the synthetic test images once ported to Java (the Python/OpenCV version didn't
   have this bug -- OpenCV's default border handling replicates the edge instead of zeroing it, so this
   was introduced by the from-scratch Java port, not a pre-existing issue). Fixed by clamping to the edge
   (replicate padding) instead. See section 4 for full detail -- worth reading if anything looks like it's
   losing walls near an image's edge again.

## 2. Why Java could be written without Maven at all

The core insight: none of thresholding, binary morphology (erode/dilate), or connected-components flood
fill actually need OpenCV. They're each maybe 20-30 lines of array manipulation over a `boolean[]` pixel
mask. `javax.imageio.ImageIO` (built into the JDK) reads/writes PNG directly. So the whole pipeline is one
file with zero dependencies. Trade-off: performance is worse than OpenCV's optimized C++ (this doesn't
matter at floor-plan-image resolution, seconds either way) and the morphology only supports a square
structuring element (OpenCV's ellipse kernel rounds corners slightly differently) -- irrelevant in practice,
confirmed by the regression check in section 3.

**Compiling** (this sandbox has no `javac` binary, only the JRE's compiler module -- your machine will
likely have `javac` directly, in which case skip the `-m` invocation):
```
# this sandbox (JRE-only):
java -m jdk.compiler/com.sun.tools.javac.Main -d out backend/src/com/gridlinescan/FloorplanTo3D.java
java -cp out com.gridlinescan.FloorplanTo3D input/real/apartment_2bed2bath_2d.png 55 output

# a normal machine with a full JDK:
javac -d out backend/src/com/gridlinescan/FloorplanTo3D.java
java -cp out com.gridlinescan.FloorplanTo3D input/real/apartment_2bed2bath_2d.png 55 output
```
Args: image path, pixels-per-metre (manual -- see section 5), output dir. Set env var `FP_DEBUG=1` to print
per-component area/bbox/reason-dropped to stderr during room segmentation (useful for exactly the kind of
bug in section 4).

## 3. Results on the two real floor plans you provided

### `input/real/apartment_2bed2bath_2d.png` -- a genuine 2D top-down floor plan (2 bed / 2 bath, color-coded
rooms, printed dimensions like `11'5" x 10'2"`, from what looks like an apartment listing site)

This is exactly the input type the pipeline is designed for, and it's the **first non-synthetic image**
it's been run on. Two things happened:

- **Wall detection needed a fix, and now works well.** The first attempt used the same Otsu-threshold +
  "walls are the minority polarity" auto-detection from the Python prototype, and it picked the wrong
  threshold entirely -- the bright tan living-room floor color ended up classified as "wall" (see
  `output/apartment_2bed2bath_2d.debug.png` from that attempt, not kept in this zip, but reproducible by
  reverting the fix below). **Root cause**: this floor plan has three brightness classes (white background
  outside the unit, colored-but-fairly-bright room fills, near-black wall outlines), and a single global
  Otsu split can put the wrong two classes together. **Fix**: try a fixed near-black threshold
  (`gray <= 70`) first, since walls in both this style and the plain B&W synthetic style are solidly
  near-black regardless of what color the floor is; only fall back to the Otsu/polarity-guess approach if
  that threshold doesn't land in a plausible "walls are a small minority of the image" range
  (0.5%-30% of pixels). **After the fix, wall detection is visually excellent** -- compare
  `output/apartment_2bed2bath_2d.debug.png` (red overlay) against the source image; it tracks the real wall
  lines closely, including around the irregular-shaped bathroom and closets. A few furniture/fixture icons
  with dark outlines (the stacked washer/dryer icon, some closet hangers) get picked up as small stray wall
  cells too -- harmless for room segmentation (too small to matter) but would need filtering out before
  trusting wall cell positions precisely.
- **Room segmentation still returns 0 rooms**, for the already-documented reason from v2's handoff: this
  plan's doorways are drawn as literal gaps in the wall line (see the little quarter-circle door-swing arcs
  in the image -- that arc is decorative, the actual opening is the gap in the wall it's next to), and the
  balcony opening at the top is open to the "outside" of the whole unit. Flood-fill free space treats both
  exactly like open floor, so every room ends up connected to the image border through some doorway or
  the balcony, and the border-touching-component rejection throws all of them out. **This confirms the v2
  bug is real and matters on real inputs, not just contrived synthetic ones** -- fixing it (v2 section 4,
  approach 2: segment against a doorway-bridged mask, diff against the real mask to also recover door
  locations for free) is now clearly the highest-value next step, more so than before.
- See `output/apartment_2bed2bath_2d.3d.png` for what the wall-only extrusion looks like in 3D (matplotlib
  static preview, same caveat as before about why it's not the live three.js viewer in this sandbox) --
  the floor plan's shape is recognizably preserved.

### `input/real/apartment_3dplans_2.png` (and `real/apartment_3dplans_1.png` from last session, same style)
-- a rendered isometric "artist's conception" floor plan (3DPlans.com watermark, includes furniture, shadows,
white walls on a colored/wood floor)

**This is a fundamentally different, harder input category, and the pipeline is not designed for it.** Two
separate problems, not one:
1. **Wall/floor color polarity is inverted relative to typical CAD/line-art plans** (white walls, colored
   floor) -- the auto-polarity fallback handles this okay on its own (correctly flips to "light = wall" when
   the near-black-threshold heuristic doesn't find a plausible wall fraction).
2. **It's an isometric perspective rendering, not an orthographic top-down projection.** Walls have visible
   height/shading and non-uniform pixel-to-metre scale across the image (things farther "back" in the
   isometric view are foreshortened differently than a true top-down plan). No amount of threshold-tuning
   fixes this -- the 2D pixel coordinates in this image don't correspond to a consistent real-world scale
   the way a true top-down plan's do. `output/apartment_3dplans_2.3d.png` shows the result: a dense, messy
   tangle of tiny wall-cell columns roughly in the right footprint but geometrically meaningless in detail.
   **Recommendation: don't feed this style of image into this pipeline at all.** If a building only has
   marketing-style isometric renderings available (no real top-down/CAD plan), the right approach is a
   different, dedicated de-warping step (estimate the isometric projection matrix and unproject to a
   synthetic top-down view first) -- worth doing only if this input style turns out to be common for the
   buildings you actually need to cover; flag it as a separate, not-yet-scoped piece of work rather than
   something to patch into the current pipeline.

**Practical implication for sourcing floor plans going forward**: real-estate sites often offer *both*
styles for the same unit (as they did for the second building you gave me -- a plain 2D plan exists
alongside the isometric rendering). When both exist, prefer the plain 2D top-down one every time.

## 4. The border-erosion bug, in detail (for whoever touches `erode()`/`dilate()` next)

`erode(mask, w, h, radius)` checks, for every pixel, whether *every* neighbor within `radius` is also
foreground. The first version of this function said: if a neighbor position is off the edge of the image,
treat that as "not foreground" and fail the pixel. That seems reasonable at first glance, but it means
**every pixel within `radius` of any image edge automatically fails erosion**, regardless of what's actually
there -- including a solid wall that happens to run along the edge. On the synthetic test images, the
outer wall is drawn essentially flush with the canvas edge (an artifact of how `make_test_floorplans.py`
sizes the canvas -- also worth fixing there, but the pipeline shouldn't be this fragile to it either way),
so the `close` step's `erode(radius=3)` call was eating a chunk of the exterior wall on every run, opening a
gap to the "outside" and collapsing what should have been 4 separate rooms down to 1-2. Diagnosed by adding
`FP_DEBUG=1` component-area logging (kept in the code, off by default) and noticing a "dropped, touches
border" component with an unexpectedly huge area, then a `kept` component with a suspiciously large bounding
box spanning what should have been two separate rooms.

**Fix**: clamp out-of-range neighbor coordinates to the nearest valid edge pixel instead of treating them as
background (`Math.min(h-1, Math.max(0, y+dy))`, same for x) -- i.e. replicate-padding, which is what OpenCV
does by default and is why the Python prototype never hit this. After the fix, the Java pipeline reproduces
the Python prototype's results on all three synthetic images exactly (room counts and wall-cell counts
match: 4 rooms / 246 wall cells, 1 room / 229 wall cells, etc.) -- see `output/` for the current
(post-fix) numbers, which are the correct baseline to compare future changes against.

## 5. Everything else from v2 still applies unchanged

Re-reading `python-prototype/floorplan_to_3d.py`'s docstring-level comments alongside the Java file is
useful -- the algorithm is intentionally the same in both, so v2's design rationale (raster/voxel walls
instead of vector rectangles, why flood-fill room segmentation, the JSON schema, etc.) all still holds.
Specifically still true and still not done:
- **Scale calibration is manual** (a CLI arg). The real 2D floor plan you gave has printed dimensions in the
  image itself (`11'5" x 10'2"`, etc.) -- OCR'ing those out and cross-checking against a room's detected
  pixel bounding box would give an automatic, self-calibrating scale, and is now a concretely useful next
  step given a real example to test it against (Java has no built-in OCR; would need Tesseract via a
  subprocess, or a bundled pure-Java OCR lib -- check what's fetchable once this leaves the sandbox).
- **Door/window classification** is still not built.
- **Video-based object placement onto the shell** is still not built (still planned as a separate, later
  feature, see v2 section 1).
- The **doorway room-merging bug** (section 3 above, v2 section 4) is the single highest-priority fix now
  that it's confirmed on a real floor plan.

## 6. Next steps (revised priority order)

1. **Fix the doorway-merging bug** (v2 section 4 approach 2: segment against a bridged mask, diff to also
   get door locations for free) -- now validated as high-value on a real plan, do this first.
2. **Filter stray small wall-cell blobs** from furniture/fixture icons (seen in the real 2D plan's debug
   image) -- e.g. drop wall-cell connected components below some small size threshold, analogous to the
   existing room-size cutoff.
3. **Try OCR-based scale calibration** against the printed dimension text, now that a real example with
   that text exists to test against.
4. Get more real top-down 2D floor plans (ask the source site/listings for the plain 2D version specifically
   when both styles are offered, per section 3) to keep stress-testing threshold/morphology assumptions.
5. Bring back the responder-facing viewer features from the original brief (markers, zone box, arrows, role
   presets, export) -- unchanged from v2 section 8 item 4.
6. Decide whether the isometric-rendering input style (section 3) is common enough among the buildings you
   need to actually cover to justify building a dedicated de-warping preprocessor for it, or whether "always
   prefer the 2D plan when one exists" is a sufficient answer.
7. Wrap the Java class in a small HTTP server if/when you want live upload-and-view instead of a
   command-line + file-picker workflow -- `com.sun.net.httpserver.HttpServer` (also built into the JDK, zero
   dependencies, consistent with this session's constraint) is enough for a single `/scan` endpoint that
   runs `FloorplanTo3D` and returns the JSON; no need for Spring unless you specifically want it.

## 7. File map (this zip)

```
backend/src/com/gridlinescan/FloorplanTo3D.java   the pipeline, pure Java/JDK, see section 2 to compile
frontend/index.html                               three.js viewer, standalone, open directly in a browser
frontend/demo.scene.json                          auto-loads in the viewer (the clean 4-room synthetic test)
input/synthetic/*.png                             the 3 synthetic test plans from v2
input/real/apartment_2bed2bath_2d.png             your first real floor plan (2D top-down, color-coded)
input/real/apartment_3dplans_2.png                your second real floor plan (isometric rendering)
input/real/apartment_3dplans_1.png                the isometric plan from last session (same style/site)
output/*.scene.json, *.debug.png, *.3d.png        current (post-bugfix) results for the Java pipeline
python-prototype/                                 v2's Python/OpenCV version, kept for reference/cross-check
HANDOFF.md                                        this file
```
