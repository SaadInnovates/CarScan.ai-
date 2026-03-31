# inference.py
# Local YOLOv8 inference using best.pt downloaded from HuggingFace
# pyright: reportAttributeAccessIssue=false

import cv2
import os
import time
import shutil
import subprocess
import logging
import hashlib
import requests
from pathlib import Path
from config import settings

logger = logging.getLogger(__name__)

UPLOAD_DIR = settings.UPLOAD_DIR

MODEL_PATH = os.getenv("MODEL_PATH", "best.pt")
MODEL_URL  = "https://huggingface.co/SaadZubair/car-damage-yolo/resolve/main/best.pt"

# ── CLASSES ───────────────────────────────────────────────────────────────────

DAMAGE_CLASSES = [
    "Front-Windscreen-Damage",
    "Headlight-Damage",
    "Rear-windscreen-Damage",
    "RunningBoard-Dent",
    "Sidemirror-Damage",
    "Signlight-Damage",
    "Taillight-Damage",
    "bonnet-dent",
    "boot-dent",
    "doorouter-dent",
    "fender-dent",
    "front-bumper-dent",
    "pillar-dent",
    "quaterpanel-dent",
    "rear-bumper-dent",
    "roof-dent",
]

CLASS_TO_CATEGORY = {
    "Front-Windscreen-Damage" : "Windscreen",
    "Headlight-Damage"        : "Headlight",
    "Rear-windscreen-Damage"  : "Windscreen",
    "RunningBoard-Dent"       : "Body Dent",
    "Sidemirror-Damage"       : "Mirror",
    "Signlight-Damage"        : "Light",
    "Taillight-Damage"        : "Taillight",
    "bonnet-dent"             : "Body Dent",
    "boot-dent"               : "Body Dent",
    "doorouter-dent"          : "Body Dent",
    "fender-dent"             : "Body Dent",
    "front-bumper-dent"       : "Bumper",
    "pillar-dent"             : "Body Dent",
    "quaterpanel-dent"        : "Body Dent",
    "rear-bumper-dent"        : "Bumper",
    "roof-dent"               : "Body Dent",
}

LABEL_COLOR_PALETTE = [
    (204, 120, 0),
    (168, 139, 22),
    (22, 163, 74),
    (5, 150, 105),
    (180, 83, 9),
    (161, 98, 7),
    (180, 83, 139),
    (211, 77, 30),
    (165, 81, 29),
    (120, 113, 108),
]

CATEGORY_COLOR_MAP = {
    "windscreen" : (220, 120, 0),
    "headlight"  : (15, 180, 240),
    "taillight"  : (70, 70, 220),
    "light"      : (40, 140, 240),
    "mirror"     : (200, 150, 40),
    "bumper"     : (20, 140, 20),
    "body dent"  : (25, 115, 185),
}

# ── MODEL SINGLETON ───────────────────────────────────────────────────────────

_yolo_model = None


def _download_model_if_needed():
    """Download best.pt from HuggingFace if not already present locally."""
    model_path = Path(MODEL_PATH)
    if model_path.exists():
        logger.info(f"[model] Found cached model at '{MODEL_PATH}'")
        return

    logger.info(f"[model] '{MODEL_PATH}' not found — downloading from HuggingFace...")
    hf_token = os.getenv("HF_API_TOKEN")
    headers  = {"Authorization": f"Bearer {hf_token}"} if hf_token else {}

    try:
        with requests.get(MODEL_URL, headers=headers, stream=True, timeout=120) as r:
            r.raise_for_status()
            downloaded = 0
            with open(MODEL_PATH, "wb") as f:
                for chunk in r.iter_content(chunk_size=8192):
                    f.write(chunk)
                    downloaded += len(chunk)
            logger.info(f"[model] Download complete — {downloaded / 1_000_000:.1f} MB saved to '{MODEL_PATH}'")
    except Exception as e:
        # Clean up any partial file so next startup retries cleanly
        if Path(MODEL_PATH).exists():
            Path(MODEL_PATH).unlink()
        raise RuntimeError(f"[model] Failed to download model: {e}") from e


def load_model():
    """Download best.pt if needed, then load with ultralytics YOLO."""
    from ultralytics import YOLO
    _download_model_if_needed()
    model = YOLO(MODEL_PATH)
    logger.info(f"[model] YOLOv8 loaded successfully from '{MODEL_PATH}'")
    return model


def get_model():
    """Return the module-level YOLO singleton, loading it on first call."""
    global _yolo_model
    if _yolo_model is None:
        _yolo_model = load_model()
    return _yolo_model


# ── COLOR HELPERS ─────────────────────────────────────────────────────────────

def get_box_color(label: str, category: str | None = None) -> tuple[int, int, int]:
    normalized = str(category or "").strip().lower()
    if normalized in CATEGORY_COLOR_MAP:
        return CATEGORY_COLOR_MAP[normalized]
    if not label:
        return LABEL_COLOR_PALETTE[0]
    digest = hashlib.sha256(label.encode("utf-8")).hexdigest()
    idx    = int(digest[:8], 16) % len(LABEL_COLOR_PALETTE)
    return LABEL_COLOR_PALETTE[idx]


def get_label_text_color(bg_color: tuple[int, int, int]) -> tuple[int, int, int]:
    b, g, r   = bg_color
    luminance = (0.114 * b) + (0.587 * g) + (0.299 * r)
    return (20, 20, 20) if luminance >= 150 else (255, 255, 255)


# ── NMS / DEDUP ───────────────────────────────────────────────────────────────

def _bbox_iou(box_a: dict, box_b: dict) -> float:
    ax1, ay1, ax2, ay2 = box_a["x1"], box_a["y1"], box_a["x2"], box_a["y2"]
    bx1, by1, bx2, by2 = box_b["x1"], box_b["y1"], box_b["x2"], box_b["y2"]
    inter_area = max(0.0, min(ax2, bx2) - max(ax1, bx1)) * max(0.0, min(ay2, by2) - max(ay1, by1))
    area_a     = max(0.0, ax2 - ax1) * max(0.0, ay2 - ay1)
    area_b     = max(0.0, bx2 - bx1) * max(0.0, by2 - by1)
    union      = area_a + area_b - inter_area
    return inter_area / union if union > 0 else 0.0


def merge_distinct_detections(detections: list[dict], iou_threshold: float = 0.50) -> list[dict]:
    if not detections:
        return []
    distinct: list[dict] = []
    for det in sorted(detections, key=lambda d: d.get("confidence", 0.0), reverse=True):
        matched = any(
            kept["label"] == det["label"] and _bbox_iou(kept["bbox"], det["bbox"]) >= iou_threshold
            for kept in distinct
        )
        if not matched:
            distinct.append(det)
    return distinct


# ── INFERENCE ─────────────────────────────────────────────────────────────────

def run_inference(image_path: str) -> list[dict]:
    """Run local YOLOv8 inference on an image file. Returns list of detections."""
    frame = cv2.imread(image_path)
    if frame is None:
        logger.error(f"[inference] Could not read image: {image_path}")
        return []
    return infer_frame(frame, conf_threshold=0.20)


def infer_frame(
    frame,
    conf_threshold: float = 0.20,
    frame_num: int | None = None,
) -> list[dict]:
    """Run local YOLOv8 inference on a single OpenCV frame (numpy array)."""
    model      = get_model()
    results    = model(frame, stream=True, verbose=False)
    detections = []

    for result in results:
        boxes = result.boxes
        if boxes is None:
            continue
        for box in boxes:
            x1, y1, x2, y2 = box.xyxy[0].tolist()
            conf            = float(box.conf[0])
            if conf < conf_threshold:
                continue
            class_id = int(box.cls[0])
            label    = model.names.get(class_id, "unknown")
            category = CLASS_TO_CATEGORY.get(label, "General Damage")
            det = {
                "label"          : label,
                "confidence"     : round(conf, 3),
                "bbox"           : {
                    "x1": round(x1, 1),
                    "y1": round(y1, 1),
                    "x2": round(x2, 1),
                    "y2": round(y2, 1),
                },
                "damage_category": category,
                "severity_score" : round(conf, 3),
            }
            if frame_num is not None:
                det["frame"] = frame_num
            detections.append(det)

    return detections


def calculate_severity(detections: list[dict]) -> str:
    count = len(detections)
    if count == 0   : return "low"
    elif count <= 2 : return "low"
    elif count <= 5 : return "medium"
    elif count <= 9 : return "high"
    else            : return "critical"


# ── DRAWING ───────────────────────────────────────────────────────────────────

def draw_boxes_on_frame(frame, detections: list[dict]):
    frame_h, frame_w = frame.shape[:2]

    for det in detections:
        bbox          = det["bbox"]
        label_name    = str(det.get("label", "damage"))
        category_name = str(det.get("damage_category") or CLASS_TO_CATEGORY.get(label_name, ""))

        x1 = max(0, min(int(bbox["x1"]), frame_w - 1))
        y1 = max(0, min(int(bbox["y1"]), frame_h - 1))
        x2 = max(0, min(int(bbox["x2"]), frame_w - 1))
        y2 = max(0, min(int(bbox["y2"]), frame_h - 1))

        if x2 <= x1: x2 = min(frame_w - 1, x1 + 1)
        if y2 <= y1: y2 = min(frame_h - 1, y1 + 1)

        edge_color   = (255, 60, 255)
        corner_color = (60, 255, 60)
        chip_color   = (255, 0, 0)
        thickness    = max(2, int(round(min(frame_w, frame_h) / 520)))

        cv2.rectangle(frame, (x1, y1), (x2, y2), edge_color, thickness)

        cl = max(14, int(round(min(frame_w, frame_h) / 36)))  # corner length
        cv2.line(frame, (x1, y1), (min(x2, x1 + cl), y1), corner_color, thickness)
        cv2.line(frame, (x1, y1), (x1, min(y2, y1 + cl)), corner_color, thickness)
        cv2.line(frame, (x2, y1), (max(x1, x2 - cl), y1), corner_color, thickness)
        cv2.line(frame, (x2, y1), (x2, min(y2, y1 + cl)), corner_color, thickness)
        cv2.line(frame, (x1, y2), (min(x2, x1 + cl), y2), corner_color, thickness)
        cv2.line(frame, (x1, y2), (x1, max(y1, y2 - cl)), corner_color, thickness)
        cv2.line(frame, (x2, y2), (max(x1, x2 - cl), y2), corner_color, thickness)
        cv2.line(frame, (x2, y2), (x2, max(y1, y2 - cl)), corner_color, thickness)

        label_text          = f"{label_name} {float(det.get('confidence', 0.0)):.2f}"
        font                = cv2.FONT_HERSHEY_SIMPLEX
        font_scale          = 0.45
        text_thickness      = 1
        (tw, th), baseline  = cv2.getTextSize(label_text, font, font_scale, text_thickness)
        pad_x, pad_y        = 6, 4

        ll = max(0, min(x1, frame_w - (tw + pad_x * 2)))           # label left
        pt = y1 - th - baseline - pad_y * 2 - 2                     # preferred top
        lt = pt if pt >= 0 else min(frame_h - (th + baseline + pad_y * 2), y1 + 2)
        lt = max(0, lt)
        lb = min(frame_h - 1, lt + th + baseline + pad_y * 2)       # label bottom
        lr = min(frame_w - 1, ll + tw + pad_x * 2)                  # label right

        cv2.rectangle(frame, (ll, lt), (lr, lb), chip_color, -1)
        cv2.putText(
            frame, label_text,
            (ll + pad_x, lb - baseline - pad_y),
            font, font_scale, (240, 240, 240), text_thickness, cv2.LINE_AA,
        )

    return frame


def generate_annotated_image(image_path: str, detections: list[dict], output_path: str) -> str:
    frame = cv2.imread(image_path)
    if frame is None:
        logger.error(f"[inference] Could not read image: {image_path}")
        return image_path
    annotated = draw_boxes_on_frame(frame, detections)
    Path(output_path).parent.mkdir(parents=True, exist_ok=True)
    cv2.imwrite(output_path, annotated)
    return output_path


# ── FFMPEG HELPERS ────────────────────────────────────────────────────────────

def _find_ffmpeg() -> str | None:
    found = shutil.which("ffmpeg")
    if found:
        logger.info(f"[ffmpeg] Found in PATH: {found}")
        return found

    try:
        import imageio_ffmpeg
        ffmpeg_bin = imageio_ffmpeg.get_ffmpeg_exe()
        if ffmpeg_bin and Path(ffmpeg_bin).exists():
            logger.info(f"[ffmpeg] Using imageio-ffmpeg: {ffmpeg_bin}")
            return ffmpeg_bin
    except Exception:
        pass

    for path in [
        "/usr/bin/ffmpeg", "/usr/local/bin/ffmpeg",
        "/opt/homebrew/bin/ffmpeg", "/opt/local/bin/ffmpeg",
        "C:/ffmpeg/bin/ffmpeg.exe", "C:/Program Files/ffmpeg/bin/ffmpeg.exe",
    ]:
        if Path(path).exists():
            logger.info(f"[ffmpeg] Found at: {path}")
            return path

    logger.error("[ffmpeg] NOT FOUND. Install ffmpeg for browser-playable video output.")
    return None


def _ensure_web_playable_video(output_path: str) -> bool:
    p = Path(output_path)
    if not p.exists() or p.stat().st_size == 0:
        logger.error(f"[video] Output file missing or empty: {output_path}")
        return False

    original_size = p.stat().st_size
    ffmpeg_bin    = _find_ffmpeg()
    if not ffmpeg_bin:
        logger.warning("[video] Skipping ffmpeg — browser playback not guaranteed.")
        return True

    tmp_path = p.with_suffix(".webtmp.mp4")
    try:
        # Attempt 1: H.264 + faststart
        r1 = subprocess.run(
            [ffmpeg_bin, "-y", "-i", str(p), "-c:v", "libx264", "-preset", "fast",
             "-crf", "23", "-pix_fmt", "yuv420p", "-movflags", "+faststart", "-an", str(tmp_path)],
            stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, timeout=300,
        )
        if r1.returncode == 0 and tmp_path.exists() and tmp_path.stat().st_size > 0:
            logger.info(f"[video] H.264 OK: {original_size} → {tmp_path.stat().st_size} bytes")
            os.replace(str(tmp_path), str(p))
            return True

        logger.warning(f"[video] libx264 failed, trying remux... {r1.stderr[-300:]}")

        # Attempt 2: copy-remux with faststart
        r2 = subprocess.run(
            [ffmpeg_bin, "-y", "-i", str(p), "-c:v", "copy", "-movflags", "+faststart", "-an", str(tmp_path)],
            stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, timeout=120,
        )
        if r2.returncode == 0 and tmp_path.exists() and tmp_path.stat().st_size > 0:
            logger.info(f"[video] Remux OK: {original_size} → {tmp_path.stat().st_size} bytes")
            os.replace(str(tmp_path), str(p))
            return True

        logger.error(f"[video] Both ffmpeg attempts failed. {r2.stderr[-300:]}")
        return False

    except subprocess.TimeoutExpired:
        logger.error(f"[video] ffmpeg timed out: {output_path}")
        return False
    except Exception as e:
        logger.error(f"[video] Unexpected ffmpeg error: {e}")
        return False
    finally:
        if tmp_path.exists():
            try: tmp_path.unlink()
            except Exception: pass


def _create_web_video_writer(output_path: str, fps: float, width: int, height: int):
    for codec in ["mp4v", "MJPG", "XVID"]:
        fourcc = cv2.VideoWriter_fourcc(*codec)
        try:
            writer = cv2.VideoWriter(output_path, fourcc, fps, (width, height))
        except Exception:
            continue
        if writer.isOpened():
            logger.info(f"[video] VideoWriter opened with codec: {codec}")
            return writer, codec
        writer.release()
    raise ValueError("Could not initialize VideoWriter. Tried: mp4v, MJPG, XVID.")


# ── VIDEO PIPELINE ────────────────────────────────────────────────────────────

def process_video(
    video_path    : str,
    output_path   : str,
    frame_skip    : int   = 2,
    conf_threshold: float = 0.35,
) -> dict:
    """
    Process a video frame-by-frame using local YOLOv8 inference,
    draw detections, write annotated MP4, re-encode to H.264+faststart.
    """
    cap = cv2.VideoCapture(video_path)
    if not cap.isOpened():
        raise ValueError(f"Could not open video: {video_path}")

    fps          = cap.get(cv2.CAP_PROP_FPS) or 25
    width        = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    height       = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
    total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))

    logger.info(f"[video] {video_path} | {width}x{height} @ {fps}fps | {total_frames} frames")

    Path(output_path).parent.mkdir(parents=True, exist_ok=True)
    out, output_codec = _create_web_video_writer(output_path, fps, width, height)

    frame_num       = 0
    all_detections  = []
    damage_counts   = {}
    last_detections = []
    start_time      = time.time()

    while True:
        success, frame = cap.read()
        if not success:
            break

        frame_num += 1

        if frame_num % frame_skip == 0:
            frame_detections = infer_frame(
                frame          = frame,
                conf_threshold = conf_threshold,
                frame_num      = frame_num,
            )
            for det in frame_detections:
                all_detections.append(det)
                damage_counts[det["label"]] = damage_counts.get(det["label"], 0) + 1
            last_detections = frame_detections

        annotated_frame = draw_boxes_on_frame(frame.copy(), last_detections)
        cv2.putText(
            annotated_frame, f"Frame {frame_num}/{total_frames}",
            (10, 28), cv2.FONT_HERSHEY_SIMPLEX, 0.7, (255, 255, 255), 2,
        )
        out.write(annotated_frame)

    cap.release()
    out.release()

    converted           = _ensure_web_playable_video(output_path)
    processing_time     = int((time.time() - start_time) * 1000)
    distinct_detections = merge_distinct_detections(all_detections)
    unique_classes      = list(damage_counts.keys())
    final_size          = Path(output_path).stat().st_size if Path(output_path).exists() else 0

    logger.info(
        f"[video] Done. frames={frame_num}, detections={len(distinct_detections)}, "
        f"size={final_size}B, time={processing_time}ms"
    )

    return {
        "detections": distinct_detections,
        "summary": {
            "total_frames"        : frame_num,
            "frames_analyzed"     : frame_num // frame_skip,
            "total_detections"    : len(distinct_detections),
            "raw_detection_events": len(all_detections),
            "unique_damages"      : unique_classes,
            "damage_counts"       : damage_counts,
            "severity"            : calculate_severity(distinct_detections),
            "confidence_avg"      : round(
                sum(d["confidence"] for d in distinct_detections) / len(distinct_detections), 3
            ) if distinct_detections else 0.0,
            "processing_time_ms"  : processing_time,
            "video_fps"           : fps,
            "video_resolution"    : f"{width}x{height}",
            "output_codec"        : output_codec,
            "ffmpeg_converted"    : converted,
        },
    }