from __future__ import annotations

import math
import os
import threading
import time
import uuid
from dataclasses import dataclass, field
from pathlib import Path
from typing import Literal

import cv2
import numpy as np
import torch
from fastapi import BackgroundTasks, FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from PIL import Image
from transformers import pipeline

DATA_DIR = Path(os.getenv("GRIDLINE_DATA_DIR", "./gridline-data")).resolve()
UPLOAD_DIR = DATA_DIR / "uploads"
RESULT_DIR = DATA_DIR / "results"
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
RESULT_DIR.mkdir(parents=True, exist_ok=True)

MAX_UPLOAD_BYTES = int(os.getenv("GRIDLINE_MAX_UPLOAD_MB", "500")) * 1024 * 1024
MODEL_ID = os.getenv("GRIDLINE_DEPTH_MODEL", "depth-anything/Depth-Anything-V2-Small-hf")
DEVICE = 0 if torch.cuda.is_available() else -1

app = FastAPI(title="Gridline 3D Reconstruction API", version="1.0.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=os.getenv("GRIDLINE_CORS_ORIGINS", "*").split(","),
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


@dataclass
class Job:
    id: str
    filename: str
    input_path: str
    result_path: str
    status: Literal["queued", "processing", "complete", "failed", "cancelled"] = "queued"
    progress: float = 0.0
    stage: str = "Queued"
    frame_count: int = 0
    points: int = 0
    error: str | None = None
    created_at: float = field(default_factory=time.time)
    cancel_event: threading.Event = field(default_factory=threading.Event, repr=False)

    def public(self) -> dict:
        return {
            "id": self.id,
            "filename": self.filename,
            "status": self.status,
            "progress": self.progress,
            "stage": self.stage,
            "frame_count": self.frame_count,
            "points": self.points,
            "error": self.error,
            "created_at": self.created_at,
            "resultUrl": f"/api/reconstructions/{self.id}/result" if self.status == "complete" else None,
        }


jobs: dict[str, Job] = {}
jobs_lock = threading.Lock()
model_lock = threading.Lock()
depth_pipe = None


def update_job(job: Job, **changes) -> None:
    with jobs_lock:
        for key, value in changes.items():
            setattr(job, key, value)


def get_depth_pipe():
    global depth_pipe
    with model_lock:
        if depth_pipe is None:
            kwargs = {"model": MODEL_ID, "device": DEVICE}
            if DEVICE >= 0:
                kwargs["torch_dtype"] = torch.float16
            depth_pipe = pipeline("depth-estimation", **kwargs)
    return depth_pipe


def normalized_depth(frame_bgr: np.ndarray, width: int, height: int) -> np.ndarray:
    rgb = cv2.cvtColor(frame_bgr, cv2.COLOR_BGR2RGB)
    result = get_depth_pipe()(Image.fromarray(rgb))
    depth = np.asarray(result["depth"], dtype=np.float32)
    depth = cv2.resize(depth, (width, height), interpolation=cv2.INTER_CUBIC)

    low, high = np.percentile(depth, (2, 98))
    if high - low < 1e-6:
        return np.full((height, width), 0.5, dtype=np.float32)
    return np.clip((depth - low) / (high - low), 0.0, 1.0)


def sample_frames(video_path: str, count: int, max_resolution: int) -> list[np.ndarray]:
    capture = cv2.VideoCapture(video_path)
    if not capture.isOpened():
        raise RuntimeError("OpenCV could not decode the uploaded video.")

    total = int(capture.get(cv2.CAP_PROP_FRAME_COUNT))
    fps = float(capture.get(cv2.CAP_PROP_FPS) or 0)
    if total <= 0:
        capture.release()
        raise RuntimeError("The video contains no readable frames.")

    indices = np.linspace(max(0, total * 0.03), max(0, total * 0.97 - 1), count).astype(int)
    frames: list[np.ndarray] = []
    for index in indices:
        capture.set(cv2.CAP_PROP_POS_FRAMES, int(index))
        ok, frame = capture.read()
        if not ok:
            continue
        h, w = frame.shape[:2]
        scale = min(1.0, max_resolution / max(w, h))
        if scale < 1:
            frame = cv2.resize(frame, (round(w * scale), round(h * scale)), interpolation=cv2.INTER_AREA)
        frames.append(frame)

    capture.release()
    if len(frames) < 2:
        raise RuntimeError(f"Only {len(frames)} frame(s) could be decoded from the video.")
    return frames


def fallback_pose(index: int, count: int, motion: str, amount_degrees: float, depth_scale: float):
    t = 0.5 if count == 1 else index / (count - 1)
    rotation = np.eye(3, dtype=np.float32)
    translation = np.zeros(3, dtype=np.float32)

    if motion == "orbit":
        angle = math.radians((t - 0.5) * amount_degrees)
        radius = depth_scale * 1.15
        translation[:] = (math.sin(angle) * radius, 0, math.cos(angle) * radius)
        target = np.zeros(3, dtype=np.float32)
        forward = target - translation
        forward /= np.linalg.norm(forward) + 1e-8
        right = np.cross(forward, np.array([0, 1, 0], dtype=np.float32))
        right /= np.linalg.norm(right) + 1e-8
        up = np.cross(right, forward)
        rotation = np.column_stack((right, up, forward))
    elif motion == "forward":
        travel = depth_scale * (amount_degrees / 180.0) * 1.5
        translation[2] = (0.5 - t) * travel
        rotation[2, 2] = -1
    else:
        rotation[2, 2] = -1

    return rotation, translation


def estimate_poses(
    frames: list[np.ndarray], motion: str, amount_degrees: float, depth_scale: float
) -> list[tuple[np.ndarray, np.ndarray]]:
    """Estimate relative camera motion with ORB; use the selected trajectory when matches are weak."""
    h, w = frames[0].shape[:2]
    focal = 0.5 * w / math.tan(math.radians(58) / 2)
    k = np.array([[focal, 0, w / 2], [0, focal, h / 2], [0, 0, 1]], dtype=np.float64)
    orb = cv2.ORB_create(nfeatures=5000, fastThreshold=7)
    matcher = cv2.BFMatcher(cv2.NORM_HAMMING)

    poses = [(np.eye(3, dtype=np.float64), np.zeros(3, dtype=np.float64))]
    successful_steps = 0

    previous_gray = cv2.cvtColor(frames[0], cv2.COLOR_BGR2GRAY)
    previous_keypoints, previous_descriptors = orb.detectAndCompute(previous_gray, None)

    for index in range(1, len(frames)):
        gray = cv2.cvtColor(frames[index], cv2.COLOR_BGR2GRAY)
        keypoints, descriptors = orb.detectAndCompute(gray, None)
        valid = previous_descriptors is not None and descriptors is not None

        if valid:
            pairs = matcher.knnMatch(previous_descriptors, descriptors, k=2)
            good = [a for a, b in pairs if a.distance < 0.72 * b.distance]
            valid = len(good) >= 20

        if valid:
            points1 = np.float32([previous_keypoints[m.queryIdx].pt for m in good])
            points2 = np.float32([keypoints[m.trainIdx].pt for m in good])
            essential, mask = cv2.findEssentialMat(
                points1, points2, k, method=cv2.RANSAC, prob=0.999, threshold=1.25
            )
            valid = essential is not None

        if valid:
            _, relative_r, relative_t, pose_mask = cv2.recoverPose(
                essential, points1, points2, k, mask=mask
            )
            inliers = int((pose_mask > 0).sum())
            valid = inliers >= 15

        if valid:
            previous_r, previous_t = poses[-1]
            step = max(0.03, depth_scale * 0.025)
            camera_r = previous_r @ relative_r.T
            camera_t = previous_t - camera_r @ (relative_t[:, 0] * step)
            poses.append((camera_r, camera_t))
            successful_steps += 1
        else:
            poses.append(poses[-1])

        previous_keypoints, previous_descriptors = keypoints, descriptors

    if successful_steps < max(1, (len(frames) - 1) // 2):
        return [
            fallback_pose(i, len(frames), motion, amount_degrees, depth_scale)
            for i in range(len(frames))
        ]

    translations = np.stack([pose[1] for pose in poses])
    translations -= translations.mean(axis=0)
    extent = np.linalg.norm(translations.max(axis=0) - translations.min(axis=0))
    target_extent = max(depth_scale * 0.35, 0.25)
    if extent > 1e-6:
        translations *= min(4.0, target_extent / extent)

    return [(poses[i][0].astype(np.float32), translations[i].astype(np.float32)) for i in range(len(poses))]


def add_frame(
    voxels: dict[tuple[int, int, int], list[float]],
    frame: np.ndarray,
    depth: np.ndarray,
    pose: tuple[np.ndarray, np.ndarray],
    voxel_size: float,
    depth_scale: float,
    stride: int,
    max_points: int,
) -> None:
    h, w = depth.shape
    rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
    if rgb.shape[:2] != (h, w):
        rgb = cv2.resize(rgb, (w, h), interpolation=cv2.INTER_AREA)

    ys, xs = np.mgrid[1 : h - 1 : stride, 1 : w - 1 : stride]
    brightness = depth[ys, xs]

    z = depth_scale * (0.16 + np.power(1.0 - brightness, 1.7) * 0.84)
    tan_half_fov = math.tan(math.radians(58) / 2)
    nx = xs / max(1, w - 1) * 2 - 1
    ny = 1 - ys / max(1, h - 1) * 2
    x = nx * z * tan_half_fov * (w / h)
    y = ny * z * tan_half_fov

    local = np.stack((x, y, z), axis=-1).reshape(-1, 3)
    rotation, translation = pose
    world = local @ rotation.T + translation
    colors = rgb[ys, xs].reshape(-1, 3)
    keys = np.rint(world / voxel_size).astype(np.int32)

    for key_array, color in zip(keys, colors):
        key = (int(key_array[0]), int(key_array[1]), int(key_array[2]))
        existing = voxels.get(key)
        if existing is not None:
            existing[3] += int(color[0])
            existing[4] += int(color[1])
            existing[5] += int(color[2])
            existing[6] += 1
        elif len(voxels) < max_points:
            voxels[key] = [
                key[0] * voxel_size,
                key[1] * voxel_size,
                key[2] * voxel_size,
                int(color[0]),
                int(color[1]),
                int(color[2]),
                1,
            ]


def write_ply(path: str, voxels: dict[tuple[int, int, int], list[float]]) -> None:
    with open(path, "w", encoding="ascii", newline="\n") as output:
        output.write(
            "ply\nformat ascii 1.0\n"
            f"element vertex {len(voxels)}\n"
            "property float x\nproperty float y\nproperty float z\n"
            "property uchar red\nproperty uchar green\nproperty uchar blue\n"
            "end_header\n"
        )
        for x, y, z, r, g, b, n in voxels.values():
            output.write(
                f"{x:.5f} {y:.5f} {z:.5f} "
                f"{round(r / n)} {round(g / n)} {round(b / n)}\n"
            )


def process_job(
    job: Job,
    frame_count: int,
    resolution: int,
    stride: int,
    voxel_size: float,
    depth_scale: float,
    motion: str,
    motion_amount: float,
    max_points: int,
) -> None:
    try:
        update_job(job, status="processing", stage="Extracting video frames", progress=0.02)
        frames = sample_frames(job.input_path, frame_count, resolution)
        if job.cancel_event.is_set():
            raise InterruptedError

        update_job(job, frame_count=len(frames), stage="Estimating camera motion", progress=0.08)
        poses = estimate_poses(frames, motion, motion_amount, depth_scale)
        voxels: dict[tuple[int, int, int], list[float]] = {}

        for index, (frame, pose) in enumerate(zip(frames, poses)):
            if job.cancel_event.is_set():
                raise InterruptedError
            update_job(
                job,
                stage=f"Estimating depth for frame {index + 1} of {len(frames)}",
                progress=0.1 + 0.82 * index / len(frames),
                points=len(voxels),
            )
            h, w = frame.shape[:2]
            depth = normalized_depth(frame, w, h)
            add_frame(voxels, frame, depth, pose, voxel_size, depth_scale, stride, max_points)

        if job.cancel_event.is_set():
            raise InterruptedError

        update_job(job, stage="Writing point cloud", progress=0.94, points=len(voxels))
        write_ply(job.result_path, voxels)
        update_job(
            job,
            status="complete",
            stage="Complete",
            progress=1.0,
            points=len(voxels),
        )
    except InterruptedError:
        update_job(job, status="cancelled", stage="Cancelled", error=None)
    except Exception as exc:
        update_job(job, status="failed", stage="Failed", error=str(exc))
    finally:
        try:
            Path(job.input_path).unlink(missing_ok=True)
        except OSError:
            pass


@app.get("/api/health")
def health() -> dict:
    return {
        "status": "ok",
        "device": "cuda" if DEVICE >= 0 else "cpu",
        "model": MODEL_ID,
    }


@app.post("/api/reconstructions", status_code=202)
async def create_reconstruction(
    background_tasks: BackgroundTasks,
    video: UploadFile = File(...),
    frame_count: int = Form(12, ge=4, le=48),
    resolution: int = Form(384, ge=128, le=1024),
    stride: int = Form(3, ge=1, le=12),
    voxel_size: float = Form(0.06, ge=0.005, le=1.0),
    depth_scale: float = Form(4.0, ge=0.25, le=50.0),
    motion: Literal["orbit", "forward", "static"] = Form("orbit"),
    motion_amount: float = Form(70.0, ge=0, le=360),
    max_points: int = Form(350000, ge=1000, le=1000000),
) -> dict:
    content_type = video.content_type or ""
    if not content_type.startswith("video/"):
        raise HTTPException(415, "Upload a video file.")

    suffix = Path(video.filename or "video.mp4").suffix.lower() or ".mp4"
    job_id = uuid.uuid4().hex
    input_path = UPLOAD_DIR / f"{job_id}{suffix}"
    result_path = RESULT_DIR / f"{job_id}.ply"

    size = 0
    try:
        with input_path.open("wb") as target:
            while chunk := await video.read(1024 * 1024):
                size += len(chunk)
                if size > MAX_UPLOAD_BYTES:
                    raise HTTPException(413, f"Video exceeds the {MAX_UPLOAD_BYTES // 1024 // 1024} MB limit.")
                target.write(chunk)
    except Exception:
        input_path.unlink(missing_ok=True)
        raise
    finally:
        await video.close()

    job = Job(
        id=job_id,
        filename=video.filename or input_path.name,
        input_path=str(input_path),
        result_path=str(result_path),
    )
    with jobs_lock:
        jobs[job_id] = job

    background_tasks.add_task(
        process_job,
        job,
        frame_count,
        resolution,
        stride,
        voxel_size,
        depth_scale,
        motion,
        motion_amount,
        max_points,
    )
    return job.public()


@app.get("/api/reconstructions/{job_id}")
def reconstruction_status(job_id: str) -> dict:
    with jobs_lock:
        job = jobs.get(job_id)
        if job is None:
            raise HTTPException(404, "Reconstruction job not found.")
        return job.public()


@app.get("/api/reconstructions/{job_id}/result")
def reconstruction_result(job_id: str):
    with jobs_lock:
        job = jobs.get(job_id)
        if job is None:
            raise HTTPException(404, "Reconstruction job not found.")
        if job.status != "complete":
            raise HTTPException(409, f"Reconstruction is {job.status}.")
        path = Path(job.result_path)

    if not path.exists():
        raise HTTPException(410, "The result file is no longer available.")
    return FileResponse(path, media_type="application/octet-stream", filename="gridline-reconstruction.ply")


@app.delete("/api/reconstructions/{job_id}", status_code=202)
def cancel_reconstruction(job_id: str) -> dict:
    with jobs_lock:
        job = jobs.get(job_id)
        if job is None:
            raise HTTPException(404, "Reconstruction job not found.")
        if job.status in {"complete", "failed", "cancelled"}:
            return job.public()
        job.cancel_event.set()
        job.stage = "Cancelling"
        return job.public()
