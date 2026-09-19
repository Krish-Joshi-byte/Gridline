# Gridline — full stack dispatch + video-to-3D reconstruction

Gridline combines:

- A Java 17 / Spring Boot 911 dispatch simulator on port `3001`.
- A React + Vite dispatcher UI on port `5173`.
- A standalone Three.js video upload page.
- A Python / FastAPI reconstruction backend on port `8000` that extracts video frames, estimates monocular depth and camera motion, voxel-fuses the frames, and returns a colored PLY point cloud.

## Run the dispatch backend

Requires Java 17+ and Maven.

```bash
cd backend
export ELEVENLABS_WEBHOOK_SECRET=your_signing_secret   # optional for local demo
mvn spring-boot:run
```

The dispatch API listens on `http://localhost:3001`.

## Run the dispatcher frontend

Requires Node 18+.

```bash
cd frontend
npm install
npm run dev
```

The React app opens on `http://localhost:5173`. Vite proxies `/api` and `/notes` requests to the Spring backend.

## Run the 3D reconstruction backend

Requires Python 3.10+ and FFmpeg-compatible video codecs. An NVIDIA GPU is optional but strongly recommended.

Place `gridline_reconstruction_api.py` and `requirements-3d.txt` in the same directory, then run:

```bash
python -m venv .venv

# macOS/Linux
source .venv/bin/activate

# Windows PowerShell
# .venv\Scripts\Activate.ps1

pip install -r requirements-3d.txt
uvicorn gridline_reconstruction_api:app --host 0.0.0.0 --port 8000
```

Verify it with:

```bash
curl http://localhost:8000/api/health
```

The first reconstruction downloads the Depth Anything V2 Small model from Hugging Face and caches it. Set these optional environment variables before starting the server:

```bash
export GRIDLINE_DATA_DIR=./gridline-data
export GRIDLINE_MAX_UPLOAD_MB=500
export GRIDLINE_CORS_ORIGINS=http://localhost:8080,http://127.0.0.1:8080
export GRIDLINE_DEPTH_MODEL=depth-anything/Depth-Anything-V2-Small-hf
```

`GRIDLINE_CORS_ORIGINS` defaults to `*` for local demo use. Restrict it before deployment.

## Run the standalone 3D page

Serve `gridline_3d_reconstructor.html` over HTTP instead of opening it with `file://`:

```bash
npx serve . -l 8080
```

Open `http://localhost:8080/gridline_3d_reconstructor.html`. Leave the Reconstruction API URL set to `http://localhost:8000`, upload a video, adjust the reconstruction settings, and click **Build 3D grid**.

### Reconstruction workflow

1. The browser uploads the original video as `multipart/form-data`.
2. `POST /api/reconstructions` saves it and starts a background job.
3. OpenCV samples frames and estimates relative camera movement with ORB feature matching and essential-matrix pose recovery.
4. Depth Anything V2 estimates a monocular depth map for each sampled frame.
5. Colored pixels are projected into 3D and merged into occupied voxels.
6. The browser polls `GET /api/reconstructions/{id}` for progress.
7. When complete, it downloads `GET /api/reconstructions/{id}/result`, parses the ASCII PLY file, and renders the cloud with Three.js.
8. **Export PLY** downloads the backend-generated result for Blender, MeshLab, CloudCompare, or another point-cloud tool.

To cancel a running job, the page calls `DELETE /api/reconstructions/{id}`.

### Video recommendations

Use a steady 5–30 second clip with:

- Slow movement around an object or through a scene.
- Strong visual texture and overlap between adjacent frames.
- Consistent lighting and minimal motion blur.
- A mostly static environment.
- No digital zoom or abrupt cuts.

For a first CPU test, use 8–12 frames, `256–384 px` resolution, and stride `3–5`. Increase resolution and reduce stride only after the pipeline works.

## Reconstruction API

| Method | Endpoint | Purpose |
|---|---|---|
| `GET` | `/api/health` | Reports backend, model, and CPU/GPU status |
| `POST` | `/api/reconstructions` | Uploads a video and creates a job |
| `GET` | `/api/reconstructions/{id}` | Returns job stage, progress, frame count, and point count |
| `GET` | `/api/reconstructions/{id}/result` | Downloads the completed PLY file |
| `DELETE` | `/api/reconstructions/{id}` | Requests cancellation |

Upload fields:

- `video`: MP4, MOV, WebM, or another OpenCV-decodable video.
- `frame_count`: `4–48`.
- `resolution`: longest frame side, `128–1024`.
- `stride`: pixel sampling interval, `1–12`.
- `voxel_size`: voxel edge length in reconstruction units.
- `depth_scale`: approximate scene depth.
- `motion`: `orbit`, `forward`, or `static`.
- `motion_amount`: fallback trajectory amount.
- `max_points`: hard voxel cap, up to `1,000,000`.

## Dispatch simulator architecture

- **IntersectionRegistry** maps known Blacksburg intersections and scatters unknown codes near downtown.
- **ResponderStore** keeps six medical, fire, and police units in memory.
- **DispatchController** finds the nearest available unit with haversine distance.
- **MapDataController** serves intersections, responders, and map configuration.
- **WebhookController** verifies ElevenLabs webhook signatures and stores extracted call notes.
- **MapView.jsx** renders Leaflet with dark CARTO tiles, routes, and animated responders.
- **routing.js** requests road-network routes from public OSRM and falls back to a straight line.
- **CallPanel.jsx** and **CallNotesPanel.jsx** provide the simulated call workflow and AI notes.

## Important limitations

- This is a hackathon-grade monocular reconstruction, not metric surveying.
- Monocular depth has unknown absolute scale and can drift between frames.
- ORB/essential-matrix pose recovery can fail on blank walls, motion blur, repeated textures, pure rotation, or low-overlap clips. The selected camera-motion mode is used as a fallback.
- The generated cloud may contain doubled surfaces, floating points, and inaccurate dimensions.
- Jobs and their metadata are stored in memory; restarting the API loses job status. Completed PLY files remain under `gridline-data/results`.
- The first model download requires internet access. Later runs use the local Hugging Face cache.
- CPU inference can be slow. CUDA is selected automatically when PyTorch detects an NVIDIA GPU.
- Upload authentication, quotas, durable job storage, cleanup, malware scanning, and isolated workers are not included.
- For production-quality geometry, replace the pose/fusion stage with COLMAP, pycolmap, OpenMVG/OpenMVS, or a Gaussian-splatting/NeRF pipeline and run jobs through a durable queue such as Celery or RQ.
- The dispatch simulator still keeps responder and call-note state in memory, exposes demo CORS settings, and depends on the rate-limited public OSRM service.
