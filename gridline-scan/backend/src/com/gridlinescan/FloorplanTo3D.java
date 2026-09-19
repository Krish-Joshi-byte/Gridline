package com.gridlinescan;

import javax.imageio.ImageIO;
import java.awt.image.BufferedImage;
import java.io.File;
import java.util.*;

/**
 * Gridline Scan v3 -- floor-plan-to-3D pipeline, pure Java (JDK only).
 *
 * v3 changes vs v2 (HANDOFF.md v2/v3 rationale otherwise still holds):
 *
 *  1. WALL MASK. The old "open 3x3 then close 7x7" cleanup deleted the wall
 *     lines outright on real floor plans, where walls are drawn as 1-2px
 *     outlines rather than thick fills. Opening with a 3x3 element removes
 *     anything thinner than 3px, so the mask came back as fragments and every
 *     downstream stage was working on garbage. Replaced with connected-
 *     component size filtering: drop blobs whose longest side is under ~0.25 m
 *     (tile grout dots, room labels, dimension text, small fixture icons) and
 *     keep long thin runs, which is what a wall is. This also covers v2's
 *     next-step #2 (stray furniture blobs).
 *
 *  2. ROOM SEGMENTATION. The old approach flood-filled free space and threw
 *     away any component touching the image border. On any real plan every
 *     room leaks outside through a doorway gap, so that returned 0 rooms.
 *     Replaced with erode-cores-then-regrow (watershed-style): erode free
 *     space by half a doorway width so rooms pinch apart at their doorways,
 *     label what survives, then grow those labels back over the full free
 *     space with a multi-source BFS. No wall geometry has to be invented.
 *
 *  3. EXTERIOR DETECTION. Rejecting border-touching components was also wrong
 *     because a plan's outer wall usually sits flush with the image edge, so
 *     legitimate rooms touch the border. Instead the image is padded with
 *     free space and the one component owning the padded corner is dropped as
 *     "outside the building". Pad width is 2*erodeRadius+6 so the pad ring
 *     survives erosion and stays connected -- with a thinner pad the ring
 *     erodes away and enclosed outdoor notches get mistaken for rooms.
 *
 *  4. SCALE CALIBRATION. --calib takes a room id and the dimensions printed
 *     on the plan for that room (e.g. 11'5"x10'2") and solves for pixels-per-
 *     metre instead of the operator guessing. No OCR needed -- a human reads
 *     one number off the drawing.
 *
 *  5. Rooms export a coarse cell footprint, not just a bounding box, so the
 *     viewer can draw L-shaped rooms as they actually are.
 *
 * Still pure JDK: java.awt.image + javax.imageio, no OpenCV, no Maven, no
 * network at build or run time.
 *
 * Usage:
 *   java FloorplanTo3D <image> [ppm] [outDir] [--door M] [--calib ID=WxH]
 *
 *   ppm             pixels per metre (default 40; see --calib)
 *   --door M        widest doorway gap to split rooms at, metres (default 0.65)
 *   --calib ID=WxH  solve ppm from a room's printed dimensions and re-run,
 *                   e.g. --calib 2=16'x18'6"  or  --calib 2=4.88x5.64m
 *
 * Compile (no Maven needed):
 *   javac -d out backend/src/com/gridlinescan/FloorplanTo3D.java
 *   java -cp out com.gridlinescan.FloorplanTo3D input/plan.png 48 output
 */
public class FloorplanTo3D {

    static final double WALL_HEIGHT_M = 2.6;
    static final double DEFAULT_PPM = 40.0;
    static final double CELL_M = 0.2;
    static final double DEFAULT_DOOR_M = 0.65;
    static final double MIN_ROOM_M2 = 1.5;
    static final double MIN_CORE_M2 = 0.3;
    static final boolean DEBUG = "1".equals(System.getenv("FP_DEBUG"));

    public static void main(String[] args) throws Exception {
        if (args.length < 1) {
            System.out.println("usage: FloorplanTo3D <image> [pixels_per_metre] [out_dir] "
                    + "[--door METRES] [--calib ROOM_ID=WxH]");
            System.exit(1);
        }
        String outDir = "output";
        String template = "frontend/viewer.template.html";
        boolean viewer = false;
        List<String> calibs = new ArrayList<>();
        double ppm = DEFAULT_PPM, doorM = DEFAULT_DOOR_M;
        List<String> positional = new ArrayList<>();
        for (int i = 0; i < args.length; i++) {
            String a = args[i];
            if (a.equals("--door")) doorM = Double.parseDouble(args[++i]);
            else if (a.equals("--calib")) calibs.add(args[++i]);
            else if (a.equals("--viewer")) viewer = true;
            else if (a.equals("--template")) template = args[++i];
            else if (a.equals("--ppm")) ppm = Double.parseDouble(args[++i]);
            else positional.add(a);
        }
        String imagePath = positional.get(0);
        if (positional.size() > 1) ppm = Double.parseDouble(positional.get(1));
        if (positional.size() > 2) outDir = positional.get(2);
        new File(outDir).mkdirs();

        BufferedImage img = ImageIO.read(new File(imagePath));
        if (img == null) throw new RuntimeException("could not read image: " + imagePath);

        Result res = run(img, ppm, doorM);

        // --- optional: solve for ppm from printed room dimensions, then redo ---
        if (!calibs.isEmpty()) {
            // Least squares through the origin over every supplied measurement:
            // ppm = sum(px*m) / sum(m*m). Each --calib contributes two
            // observations (across and down). Residuals are printed per room
            // because they are informative -- a room whose detected region
            // swallowed a closet reads systematically large, and you want to
            // see that rather than average it in silently.
            double sumPM = 0, sumMM = 0;
            List<double[]> obs = new ArrayList<>(); // roomId, px, metres
            for (String c : calibs) {
                int eq = c.indexOf('=');
                int roomId = Integer.parseInt(c.substring(0, eq).trim());
                double[] wh = parseDims(c.substring(eq + 1).trim());
                Room target = null;
                for (Room r : res.rooms) if (r.id == roomId) target = r;
                if (target == null) throw new RuntimeException("no room with id " + roomId
                        + " in the first pass -- run without --calib to list the room ids");
                // Modal row width / column height beats the bbox here: it ignores
                // the thin slivers a room sends out through its doorways.
                obs.add(new double[]{roomId, target.modalWidthPx, wh[0]});
                obs.add(new double[]{roomId, target.modalHeightPx, wh[1]});
                sumPM += target.modalWidthPx * wh[0] + target.modalHeightPx * wh[1];
                sumMM += wh[0] * wh[0] + wh[1] * wh[1];
            }
            double newPpm = sumPM / sumMM;
            System.out.printf("calibration from %d room(s), %d measurements:%n", calibs.size(), obs.size());
            double worst = 0;
            for (double[] o : obs) {
                double implied = o[1] / o[2];
                double err = (implied - newPpm) / newPpm * 100.0;
                worst = Math.max(worst, Math.abs(err));
                System.out.printf("  room %d: %5.0f px = %.3f m -> %6.2f px/m  (%+5.1f%%)%n",
                        (int) o[0], o[1], o[2], implied, err);
            }
            System.out.printf("  fitted scale: %.2f px/m   (worst single measurement off by %.1f%%)%n",
                    newPpm, worst);
            if (worst > 6.0) System.out.println(
                    "  NOTE: measurements disagree by more than 6%. The usual cause is a detected room "
                  + "that includes a closet or passage the printed dimension excludes -- prefer the "
                  + "largest, most rectangular labelled room and drop the outliers.");
            ppm = newPpm;
            res = run(img, ppm, doorM);
        }

        String base = new File(imagePath).getName().replaceAll("\\.[^.]+$", "");
        String jsonPath = outDir + "/" + base + ".scene.json";
        writeSceneJson(jsonPath, base, res, ppm);
        String debugPath = outDir + "/" + base + ".debug.png";
        writeDebugImage(debugPath, img, res);

        String viewerPath = null;
        if (viewer) {
            viewerPath = outDir + "/" + base + ".model.html";
            writeViewer(viewerPath, template, jsonPath, imagePath, base);
        }

        System.out.println("scene json: " + jsonPath);
        System.out.println("debug png : " + debugPath);
        if (viewerPath != null) System.out.println("3D model  : " + viewerPath + "  (open in any browser)");
        System.out.printf("rooms=%d wallCells=%d size=%.2fx%.2f m scale=%.2f px/m%n",
                res.rooms.size(), res.wallCells.size(), res.w / ppm, res.h / ppm, ppm);
        for (Room r : res.rooms) {
            System.out.printf("  room %-2d %6.1f m2 (%4.0f sqft)  %3dx%-3d px  bbox %d,%d-%d,%d%n",
                    r.id, r.areaPx / (ppm * ppm), r.areaPx / (ppm * ppm) * 10.7639,
                    r.modalWidthPx, r.modalHeightPx, r.minX, r.minY, r.maxX, r.maxY);
        }
    }

    // ---------- result holders ----------

    static class Result {
        int w, h;
        boolean[] wall;      // original size
        int[] roomLabel;     // original size, 0 = not a room
        List<Room> rooms = new ArrayList<>();
        List<int[]> wallCells = new ArrayList<>();
        List<int[]> wallRects = new ArrayList<>();   // x,y,w,h in PIXELS
        int cellPx;
        boolean invert;
    }

    static class Room {
        int id, minX, minY, maxX, maxY, areaPx, modalWidthPx, modalHeightPx;
        List<int[]> cells = new ArrayList<>();
        List<int[]> floorRects = new ArrayList<>();  // x,y,w,h in PIXELS
    }

    // ---------- pipeline ----------

    static Result run(BufferedImage img, double ppm, double doorM) {
        int w = img.getWidth(), h = img.getHeight();
        Result res = new Result();
        res.w = w; res.h = h;

        int[] gray = toGrayscale(img);

        // 1. wall mask ------------------------------------------------------
        final int NEAR_BLACK = 70;
        boolean[] nearBlack = new boolean[w * h];
        for (int i = 0; i < gray.length; i++) nearBlack[i] = gray[i] <= NEAR_BLACK;
        double frac = fraction(nearBlack);
        boolean[] wall;
        if (frac > 0.005 && frac < 0.30) {
            wall = nearBlack;
            res.invert = false;
        } else {
            int otsu = otsuThreshold(gray);
            boolean[] dark = new boolean[w * h], light = new boolean[w * h];
            for (int i = 0; i < gray.length; i++) { dark[i] = gray[i] <= otsu; light[i] = gray[i] > otsu; }
            res.invert = fraction(light) < fraction(dark);
            wall = res.invert ? light : dark;
        }

        // 2. drop small blobs (text, grout dots, fixture icons), keep runs ---
        int minExtent = (int) Math.max(3, Math.round(0.25 * ppm));
        wall = removeSmallBlobs(wall, w, h, minExtent);
        // heal 1px antialiasing breaks without eating thin lines
        wall = dilate(wall, w, h, 1);
        wall = erode(wall, w, h, 1);
        res.wall = wall;

        // 3. pad with free space so "outside" is one component ---------------
        int r = Math.max(2, (int) Math.round(doorM * ppm / 2.0));
        int pad = 2 * r + 6;
        int pw = w + 2 * pad, ph = h + 2 * pad;
        boolean[] free = new boolean[pw * ph];
        Arrays.fill(free, true);
        for (int y = 0; y < h; y++)
            for (int x = 0; x < w; x++)
                free[(y + pad) * pw + (x + pad)] = !wall[y * w + x];

        // 4. cores: erode free space by half a doorway so rooms pinch apart --
        boolean[] core = erode(free, pw, ph, r);
        int[] coreLabel = new int[pw * ph];
        int nCores = labelComponents(core, pw, ph, coreLabel);
        int[] coreArea = new int[nCores + 1];
        for (int v : coreLabel) if (v > 0) coreArea[v]++;
        double minCorePx = MIN_CORE_M2 * ppm * ppm;
        int[] remap = new int[nCores + 1];
        int next = 0;
        for (int i = 1; i <= nCores; i++) remap[i] = coreArea[i] >= minCorePx ? ++next : 0;
        for (int i = 0; i < coreLabel.length; i++) coreLabel[i] = remap[coreLabel[i]];
        if (DEBUG) System.err.println("cores: " + nCores + " raw, " + next + " above "
                + MIN_CORE_M2 + " m2, erodeRadius=" + r + "px");

        // 5. grow cores back over free space (multi-source BFS = geodesic) ---
        int[] grown = growLabels(coreLabel, free, pw, ph);

        // 6. exterior = whatever owns the padded corner ----------------------
        int exterior = grown[1 * pw + 1];
        if (DEBUG) System.err.println("exterior label = " + exterior);

        // 7. collect rooms ---------------------------------------------------
        double minRoomPx = MIN_ROOM_M2 * ppm * ppm;
        int[] area = new int[next + 1];
        for (int v : grown) if (v > 0) area[v]++;
        int[] roomId = new int[next + 1];
        int id = 0;
        for (int k = 1; k <= next; k++) {
            if (k == exterior) {
                if (DEBUG) System.err.println("label " + k + " area=" + area[k] + " -> EXTERIOR");
                continue;
            }
            if (area[k] < minRoomPx) {
                if (DEBUG) System.err.println("label " + k + " area=" + area[k] + " -> dropped, under "
                        + MIN_ROOM_M2 + " m2");
                continue;
            }
            roomId[k] = ++id;
        }

        res.roomLabel = new int[w * h];
        for (int y = 0; y < h; y++)
            for (int x = 0; x < w; x++) {
                int g = grown[(y + pad) * pw + (x + pad)];
                res.roomLabel[y * w + x] = (g > 0 && g <= next) ? roomId[g] : 0;
            }

        Map<Integer, Room> byId = new LinkedHashMap<>();
        for (int i = 1; i <= id; i++) {
            Room room = new Room();
            room.id = i;
            room.minX = w; room.minY = h; room.maxX = 0; room.maxY = 0;
            byId.put(i, room);
        }
        int stride = id + 1;
        int[] rowRuns = new int[h * stride];
        int[] colRuns = new int[w * stride];
        for (int y = 0; y < h; y++) {
            for (int x = 0; x < w; x++) {
                int rid = res.roomLabel[y * w + x];
                if (rid == 0) continue;
                Room room = byId.get(rid);
                room.areaPx++;
                room.minX = Math.min(room.minX, x); room.maxX = Math.max(room.maxX, x);
                room.minY = Math.min(room.minY, y); room.maxY = Math.max(room.maxY, y);
                rowRuns[y * stride + rid]++;
                colRuns[x * stride + rid]++;
            }
        }
        for (int i = 1; i <= id; i++) {
            Room room = byId.get(i);
            room.modalWidthPx = mode(rowRuns, h, stride, i);
            room.modalHeightPx = mode(colRuns, w, stride, i);
            res.rooms.add(room);
        }

        // 8. rasterize walls and room floors onto the coarse grid ------------
        res.cellPx = Math.max(1, (int) Math.round(CELL_M * ppm));
        res.wallCells = rasterizeWalls(wall, w, h, res.cellPx);
        rasterizeRooms(res, w, h);

        // 9. vector geometry at full pixel resolution -----------------------
        // The coarse 0.2 m cell grid was the real source of the "proportions
        // look wrong" problem: every wall got snapped to a 20 cm lattice, so a
        // 10 cm partition became a 20 cm block, a 3.48 m room became 3.4 or
        // 3.6 m, and the extruded model read as a field of columns rather than
        // walls. Decomposing the masks into maximal axis-aligned rectangles at
        // pixel resolution keeps every edge where the drawing actually put it;
        // the only scale factor left is ppm, which sets overall size and
        // cannot distort proportions.
        res.wallRects = rectsFromMask(wall, w, h);
        boolean[] roomMask = new boolean[w * h];
        for (Room room : res.rooms) {
            for (int i = 0; i < roomMask.length; i++) roomMask[i] = res.roomLabel[i] == room.id;
            room.floorRects = rectsFromMask(roomMask, w, h);
        }
        if (DEBUG) {
            int rr = 0;
            for (Room room : res.rooms) rr += room.floorRects.size();
            System.err.println("vector geometry: " + res.wallRects.size() + " wall rects, " + rr + " floor rects");
        }

        return res;
    }

    /** Most common non-zero per-line pixel count for room {@code rid}. */
    static int mode(int[] runs, int n, int stride, int rid) {
        Map<Integer, Integer> hist = new HashMap<>();
        int best = 0, bestCount = 0;
        for (int i = 0; i < n; i++) {
            int v = runs[i * stride + rid];
            if (v <= 0) continue;
            int c = hist.merge(v, 1, Integer::sum);
            if (c > bestCount || (c == bestCount && v > best)) { best = v; bestCount = c; }
        }
        return best;
    }

    // ---------- image helpers ----------

    static int[] toGrayscale(BufferedImage img) {
        int w = img.getWidth(), h = img.getHeight();
        int[] out = new int[w * h];
        for (int y = 0; y < h; y++) {
            for (int x = 0; x < w; x++) {
                int rgb = img.getRGB(x, y);
                int r = (rgb >> 16) & 0xFF, g = (rgb >> 8) & 0xFF, b = rgb & 0xFF;
                out[y * w + x] = (int) Math.round(0.299 * r + 0.587 * g + 0.114 * b);
            }
        }
        return out;
    }

    static int otsuThreshold(int[] gray) {
        int[] hist = new int[256];
        for (int v : gray) hist[v]++;
        int total = gray.length;
        double sum = 0;
        for (int t = 0; t < 256; t++) sum += t * hist[t];
        double sumB = 0, maxVar = 0;
        int wB = 0, threshold = 127;
        for (int t = 0; t < 256; t++) {
            wB += hist[t];
            if (wB == 0) continue;
            int wF = total - wB;
            if (wF == 0) break;
            sumB += t * hist[t];
            double mB = sumB / wB, mF = (sum - sumB) / wF;
            double varBetween = (double) wB * wF * (mB - mF) * (mB - mF);
            if (varBetween > maxVar) { maxVar = varBetween; threshold = t; }
        }
        return threshold;
    }

    static double fraction(boolean[] mask) {
        int c = 0;
        for (boolean b : mask) if (b) c++;
        return (double) c / mask.length;
    }

    static boolean[] dilate(boolean[] mask, int w, int h, int radius) {
        boolean[] out = new boolean[mask.length];
        for (int y = 0; y < h; y++) {
            for (int x = 0; x < w; x++) {
                boolean found = false;
                for (int dy = -radius; dy <= radius && !found; dy++) {
                    int ny = y + dy;
                    if (ny < 0 || ny >= h) continue;
                    for (int dx = -radius; dx <= radius; dx++) {
                        int nx = x + dx;
                        if (nx < 0 || nx >= w) continue;
                        if (mask[ny * w + nx]) { found = true; break; }
                    }
                }
                out[y * w + x] = found;
            }
        }
        return out;
    }

    static boolean[] erode(boolean[] mask, int w, int h, int radius) {
        // Replicate-padding at the border (OpenCV's default). Treating off-edge
        // as background silently erases anything flush with the image edge --
        // see HANDOFF.md v3 section 4.
        boolean[] out = new boolean[mask.length];
        for (int y = 0; y < h; y++) {
            for (int x = 0; x < w; x++) {
                boolean all = true;
                for (int dy = -radius; dy <= radius && all; dy++) {
                    int ny = Math.min(h - 1, Math.max(0, y + dy));
                    for (int dx = -radius; dx <= radius; dx++) {
                        int nx = Math.min(w - 1, Math.max(0, x + dx));
                        if (!mask[ny * w + nx]) { all = false; break; }
                    }
                }
                out[y * w + x] = all;
            }
        }
        return out;
    }

    /**
     * Drop connected blobs whose longest bounding-box side is under minExtent.
     * Removes tile grout dots, room labels, dimension text and small fixture
     * icons while keeping wall runs, which are long and thin. 8-connected, so
     * a diagonal hairline stays one blob.
     */
    static boolean[] removeSmallBlobs(boolean[] mask, int w, int h, int minExtent) {
        int[] label = new int[w * h];
        int n = labelComponents(mask, w, h, label);
        int[] minX = new int[n + 1], minY = new int[n + 1], maxX = new int[n + 1], maxY = new int[n + 1];
        Arrays.fill(minX, Integer.MAX_VALUE); Arrays.fill(minY, Integer.MAX_VALUE);
        Arrays.fill(maxX, -1); Arrays.fill(maxY, -1);
        for (int y = 0; y < h; y++) {
            for (int x = 0; x < w; x++) {
                int l = label[y * w + x];
                if (l == 0) continue;
                minX[l] = Math.min(minX[l], x); maxX[l] = Math.max(maxX[l], x);
                minY[l] = Math.min(minY[l], y); maxY[l] = Math.max(maxY[l], y);
            }
        }
        boolean[] keep = new boolean[n + 1];
        int kept = 0;
        for (int i = 1; i <= n; i++) {
            int ext = Math.max(maxX[i] - minX[i] + 1, maxY[i] - minY[i] + 1);
            keep[i] = ext >= minExtent;
            if (keep[i]) kept++;
        }
        if (DEBUG) System.err.println("wall blobs: kept " + kept + " of " + n
                + " (minExtent=" + minExtent + "px)");
        boolean[] out = new boolean[mask.length];
        for (int i = 0; i < out.length; i++) out[i] = label[i] != 0 && keep[label[i]];
        return out;
    }

    /** 8-connected labelling. Writes 1..n into {@code label}, 0 for background. */
    static int labelComponents(boolean[] mask, int w, int h, int[] label) {
        Arrays.fill(label, 0);
        int[] stack = new int[w * h];
        int n = 0;
        for (int s = 0; s < mask.length; s++) {
            if (!mask[s] || label[s] != 0) continue;
            n++;
            int top = 0;
            stack[top++] = s;
            label[s] = n;
            while (top > 0) {
                int p = stack[--top];
                int px = p % w, py = p / w;
                for (int dy = -1; dy <= 1; dy++) {
                    int ny = py + dy;
                    if (ny < 0 || ny >= h) continue;
                    for (int dx = -1; dx <= 1; dx++) {
                        int nx = px + dx;
                        if (nx < 0 || nx >= w) continue;
                        int q = ny * w + nx;
                        if (mask[q] && label[q] == 0) { label[q] = n; stack[top++] = q; }
                    }
                }
            }
        }
        return n;
    }

    /**
     * Multi-source BFS: every labelled pixel seeds the queue, labels spread
     * through {@code free} only. Each free pixel ends up owned by the core it
     * is geodesically closest to -- distance measured through open space, not
     * straight through a wall, which is the whole point.
     */
    static int[] growLabels(int[] seed, boolean[] free, int w, int h) {
        int[] out = seed.clone();
        int[] queue = new int[w * h];
        int head = 0, tail = 0;
        for (int i = 0; i < out.length; i++) if (out[i] > 0) queue[tail++] = i;
        while (head < tail) {
            int p = queue[head++];
            int px = p % w, py = p / w, lab = out[p];
            int[][] nb = {{px + 1, py}, {px - 1, py}, {px, py + 1}, {px, py - 1}};
            for (int[] nn : nb) {
                int nx = nn[0], ny = nn[1];
                if (nx < 0 || nx >= w || ny < 0 || ny >= h) continue;
                int q = ny * w + nx;
                if (!free[q] || out[q] != 0) continue;
                out[q] = lab;
                queue[tail++] = q;
            }
        }
        return out;
    }

    // ---------- rasterization ----------

    static List<int[]> rasterizeWalls(boolean[] wallMask, int w, int h, int cellPx) {
        int cols = (w + cellPx - 1) / cellPx, rows = (h + cellPx - 1) / cellPx;
        List<int[]> cells = new ArrayList<>();
        for (int r = 0; r < rows; r++) {
            int y0 = r * cellPx, y1 = Math.min((r + 1) * cellPx, h);
            for (int c = 0; c < cols; c++) {
                int x0 = c * cellPx, x1 = Math.min((c + 1) * cellPx, w);
                int total = (y1 - y0) * (x1 - x0);
                if (total == 0) continue;
                int occ = 0;
                for (int y = y0; y < y1; y++) {
                    int base = y * w;
                    for (int x = x0; x < x1; x++) if (wallMask[base + x]) occ++;
                }
                // Walls here are thin lines, not filled bands, so the old 0.35
                // occupancy cutoff dropped most of them. A cell is a wall cell
                // if a meaningful part of a wall run passes through it.
                if ((double) occ / total > 0.10) cells.add(new int[]{c, r});
            }
        }
        return cells;
    }

    static void rasterizeRooms(Result res, int w, int h) {
        int cellPx = res.cellPx;
        int cols = (w + cellPx - 1) / cellPx, rows = (h + cellPx - 1) / cellPx;
        Map<Integer, Room> byId = new HashMap<>();
        for (Room r : res.rooms) byId.put(r.id, r);
        int nIds = res.rooms.size();
        for (int r = 0; r < rows; r++) {
            int y0 = r * cellPx, y1 = Math.min((r + 1) * cellPx, h);
            for (int c = 0; c < cols; c++) {
                int x0 = c * cellPx, x1 = Math.min((c + 1) * cellPx, w);
                int[] votes = new int[nIds + 1];
                for (int y = y0; y < y1; y++)
                    for (int x = x0; x < x1; x++)
                        votes[res.roomLabel[y * w + x]]++;
                int best = 0;
                for (int i = 1; i <= nIds; i++) if (votes[i] > votes[best]) best = i;
                if (best > 0) byId.get(best).cells.add(new int[]{c, r});
            }
        }
    }

    /**
     * Greedy decomposition of a binary mask into maximal axis-aligned
     * rectangles, at full pixel resolution. For each unclaimed pixel: run
     * right as far as the mask allows, then push that whole span down as far
     * as it stays solid. Thin wall runs collapse into a handful of long
     * rectangles, which is exactly the shape a wall wants to be.
     */
    static List<int[]> rectsFromMask(boolean[] mask, int w, int h) {
        boolean[] claimed = new boolean[mask.length];
        List<int[]> rects = new ArrayList<>();
        for (int y = 0; y < h; y++) {
            for (int x = 0; x < w; x++) {
                int p = y * w + x;
                if (!mask[p] || claimed[p]) continue;
                int x1 = x;
                while (x1 + 1 < w && mask[y * w + x1 + 1] && !claimed[y * w + x1 + 1]) x1++;
                int y1 = y;
                boolean grow = true;
                while (grow && y1 + 1 < h) {
                    for (int xx = x; xx <= x1; xx++) {
                        int q = (y1 + 1) * w + xx;
                        if (!mask[q] || claimed[q]) { grow = false; break; }
                    }
                    if (grow) y1++;
                }
                for (int yy = y; yy <= y1; yy++)
                    for (int xx = x; xx <= x1; xx++) claimed[yy * w + xx] = true;
                rects.add(new int[]{x, y, x1 - x + 1, y1 - y + 1});
            }
        }
        return rects;
    }

    // ---------- dimension parsing ----------

    /**
     * Accepts the dimension strings printed on floor plans:
     *   11'5"x10'2"   16'x18'6"   3.48x3.10m   3.48x3.10
     * Returns {widthMetres, depthMetres}.
     */
    static double[] parseDims(String s) {
        String t = s.toLowerCase().replace('\u2019', '\'').replace('\u201d', '"').replace(" ", "");
        boolean metres = t.endsWith("m");
        if (metres) t = t.substring(0, t.length() - 1);
        String[] parts = t.split("x");
        if (parts.length != 2) throw new RuntimeException("cannot parse dimensions: " + s);
        return new double[]{parseOne(parts[0], metres), parseOne(parts[1], metres)};
    }

    static double parseOne(String p, boolean metres) {
        if (metres || (!p.contains("'") && !p.contains("\""))) return Double.parseDouble(p);
        double feet = 0, inches = 0;
        int fi = p.indexOf('\'');
        if (fi >= 0) {
            feet = Double.parseDouble(p.substring(0, fi));
            String rest = p.substring(fi + 1).replace("\"", "");
            if (!rest.isEmpty()) inches = Double.parseDouble(rest);
        } else {
            inches = Double.parseDouble(p.replace("\"", ""));
        }
        return (feet * 12 + inches) * 0.0254;
    }

    // ---------- output ----------

    static void writeSceneJson(String path, String sourceName, Result res, double ppm) throws Exception {
        int w = res.w, h = res.h;
        StringBuilder sb = new StringBuilder();
        sb.append("{\n");
        sb.append(" \"version\": \"floorplan-v4-java\",\n");
        sb.append(" \"units\": \"metres\",\n");
        sb.append(" \"up\": \"y\",\n");
        sb.append(" \"source_image\": \"").append(sourceName).append(".png\",\n");
        sb.append(" \"meta\": {\n");
        sb.append("  \"imageWidthPx\": ").append(w).append(",\n");
        sb.append("  \"imageHeightPx\": ").append(h).append(",\n");
        sb.append("  \"pixelsPerMetre\": ").append(round3(ppm)).append(",\n");
        sb.append("  \"wallHeightM\": ").append(WALL_HEIGHT_M).append(",\n");
        sb.append("  \"widthM\": ").append(round3(w / ppm)).append(",\n");
        sb.append("  \"depthM\": ").append(round3(h / ppm)).append(",\n");
        sb.append("  \"roomCount\": ").append(res.rooms.size()).append(",\n");
        sb.append("  \"wallRectCount\": ").append(res.wallRects.size()).append(",\n");
        sb.append("  \"wallPolarityInverted\": ").append(res.invert).append(",\n");
        sb.append("  \"warnings\": [\n");
        sb.append("   \"Scale comes from --calib or the ppm argument -- check it against a printed dimension.\",\n");
        sb.append("   \"Rooms are split by pinching free space at doorways; an opening wider than --door merges two rooms.\",\n");
        sb.append("   \"Openings are not classified: doors, windows and cased openings are all just gaps in a wall.\",\n");
        sb.append("   \"Wall height is a constant assumption, not measured from the drawing.\"\n");
        sb.append("  ]\n");
        sb.append(" },\n");

        // Walls and floors are metre-space rectangles [x, z, width, depth],
        // straight from the pixel masks. No grid snapping anywhere, so the
        // model's proportions are the drawing's proportions.
        sb.append(" \"walls\": [\n");
        for (int i = 0; i < res.wallRects.size(); i++) {
            int[] r = res.wallRects.get(i);
            sb.append("  ").append(rectJson(r, ppm));
            sb.append(i < res.wallRects.size() - 1 ? ",\n" : "\n");
        }
        sb.append(" ],\n");

        sb.append(" \"rooms\": [\n");
        for (int i = 0; i < res.rooms.size(); i++) {
            Room r = res.rooms.get(i);
            double areaM2 = r.areaPx / (ppm * ppm);
            sb.append("  {\"id\": ").append(r.id)
              .append(", \"label\": \"Room ").append(r.id).append("\"")
              .append(", \"xM\": ").append(round3(r.minX / ppm))
              .append(", \"zM\": ").append(round3(r.minY / ppm))
              .append(", \"widthM\": ").append(round3((r.maxX - r.minX + 1) / ppm))
              .append(", \"depthM\": ").append(round3((r.maxY - r.minY + 1) / ppm))
              .append(", \"clearWidthM\": ").append(round3(r.modalWidthPx / ppm))
              .append(", \"clearDepthM\": ").append(round3(r.modalHeightPx / ppm))
              .append(", \"areaM2\": ").append(round2(areaM2))
              .append(", \"areaSqFt\": ").append(round2(areaM2 * 10.7639))
              .append(", \"floor\": [");
            for (int c = 0; c < r.floorRects.size(); c++) {
                sb.append(rectJson(r.floorRects.get(c), ppm));
                if (c < r.floorRects.size() - 1) sb.append(",");
            }
            sb.append("]}");
            sb.append(i < res.rooms.size() - 1 ? ",\n" : "\n");
        }
        sb.append(" ]\n");
        sb.append("}\n");
        try (java.io.FileWriter fw = new java.io.FileWriter(path)) { fw.write(sb.toString()); }
    }

    static String rectJson(int[] r, double ppm) {
        return "[" + round3(r[0] / ppm) + "," + round3(r[1] / ppm) + ","
                   + round3(r[2] / ppm) + "," + round3(r[3] / ppm) + "]";
    }

    static double round3(double v) { return Math.round(v * 1000.0) / 1000.0; }

    /**
     * Write a standalone, self-contained 3D model: the viewer template with
     * the scene JSON and the source drawing (base64) substituted in. No
     * server, no scene.json alongside it, nothing to fetch except three.js
     * itself -- one file you can mail to someone or put on a laptop in a
     * dispatch centre and open by double-clicking it.
     */
    static void writeViewer(String outPath, String templatePath, String jsonPath,
                            String imagePath, String title) throws Exception {
        File tpl = new File(templatePath);
        if (!tpl.exists()) {
            System.out.println("viewer template not found at " + templatePath
                    + " -- skipping the 3D model (use --template <path>)");
            return;
        }
        String html = new String(java.nio.file.Files.readAllBytes(tpl.toPath()), "UTF-8");
        String json = new String(java.nio.file.Files.readAllBytes(new File(jsonPath).toPath()), "UTF-8");
        byte[] png = java.nio.file.Files.readAllBytes(new File(imagePath).toPath());
        String dataUri = "data:image/png;base64," + Base64.getEncoder().encodeToString(png);
        html = html.replace("__SCENE_JSON__", json)
                   .replace("__PLAN_IMAGE__", dataUri)
                   .replace("__TITLE__", title);
        try (java.io.Writer wr = new java.io.OutputStreamWriter(
                new java.io.FileOutputStream(outPath), "UTF-8")) {
            wr.write(html);
        }
    }

    static double round2(double v) { return Math.round(v * 100.0) / 100.0; }

    static void writeDebugImage(String path, BufferedImage src, Result res) throws Exception {
        int w = res.w, h = res.h;
        BufferedImage out = new BufferedImage(w, h, BufferedImage.TYPE_INT_RGB);
        int[] palette = {0x2f81f7, 0x3fb950, 0xd29922, 0xf85149, 0xa371f7, 0x39c5cf,
                         0xff8c00, 0x00c878, 0xdc3ca0, 0x5a5aff};
        for (int y = 0; y < h; y++) {
            for (int x = 0; x < w; x++) {
                int rgb = src.getRGB(x, y);
                // Tint by the actual room mask, not the bounding box -- rooms
                // are L-shaped often enough that bbox tinting was misleading.
                int rid = res.roomLabel[y * w + x];
                if (rid > 0) {
                    int color = palette[(rid - 1) % palette.length];
                    int cr = (color >> 16) & 0xFF, cg = (color >> 8) & 0xFF, cb = color & 0xFF;
                    int orr = (rgb >> 16) & 0xFF, og = (rgb >> 8) & 0xFF, ob = rgb & 0xFF;
                    rgb = (((int) (0.45 * orr + 0.55 * cr)) << 16)
                        | (((int) (0.45 * og + 0.55 * cg)) << 8)
                        | ((int) (0.45 * ob + 0.55 * cb));
                }
                if (res.wall[y * w + x]) rgb = 0xFF0000;
                out.setRGB(x, y, rgb);
            }
        }
        ImageIO.write(out, "png", new File(path));
    }
}
