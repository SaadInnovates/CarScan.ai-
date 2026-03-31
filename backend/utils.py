# utils.py
# File handling, thumbnails, video validation, pagination helpers

import os
import uuid
import time
from datetime import datetime, timezone
from pathlib import Path
from PIL import Image
from fastapi import HTTPException, UploadFile
from dotenv import load_dotenv
from config import settings

load_dotenv()

UPLOAD_DIR        = settings.UPLOAD_DIR
MAX_FILE_SIZE_MB  = settings.MAX_FILE_SIZE_MB   # 50MB for videos
THUMBNAIL_SIZE    = settings.THUMBNAIL_SIZE

# accepted image formats
ALLOWED_IMAGE_EXTENSIONS = {"jpg", "jpeg", "png", "webp", "jfif"}

# accepted video formats
ALLOWED_VIDEO_EXTENSIONS = {"mp4", "avi", "mov", "mkv", "webm"}

ALL_ALLOWED = ALLOWED_IMAGE_EXTENSIONS | ALLOWED_VIDEO_EXTENSIONS


def get_file_extension(filename: str) -> str:
    return filename.rsplit(".", 1)[-1].lower() if "." in filename else ""


def is_video(filename: str) -> bool:
    return get_file_extension(filename) in ALLOWED_VIDEO_EXTENSIONS


def is_image(filename: str) -> bool:
    return get_file_extension(filename) in ALLOWED_IMAGE_EXTENSIONS


async def save_upload_file(file: UploadFile, user_id: int) -> tuple[str, str]:
    # saves image or video to disk, returns (file_path, original_filename)

    original_filename = file.filename or "upload.bin"
    ext = get_file_extension(original_filename)

    if ext not in ALL_ALLOWED:
        raise HTTPException(
            status_code=400,
            detail=(
                f"File type '.{ext}' not supported. "
                f"Images: jpg, jpeg, png, webp, jfif | Videos: mp4, avi, mov, mkv, webm"
            )
        )

    content   = await file.read()
    max_bytes = MAX_FILE_SIZE_MB * 1024 * 1024

    if len(content) > max_bytes:
        raise HTTPException(
            status_code=400,
            detail=f"File too large. Maximum allowed size is {MAX_FILE_SIZE_MB}MB."
        )

    # user-specific folder: uploads/{user_id}/
    user_dir = Path(UPLOAD_DIR) / str(user_id)
    user_dir.mkdir(parents=True, exist_ok=True)

    # Ultralytics does not accept .jfif extension directly, so store as .jpg.
    storage_ext = "jpg" if ext == "jfif" else ext
    file_stem = Path(original_filename).stem or uuid.uuid4().hex
    unique_name = f"{uuid.uuid4().hex}_{file_stem}.{storage_ext}"
    file_path   = user_dir / unique_name

    with open(file_path, "wb") as f:
        f.write(content)

    return str(file_path), original_filename


def generate_thumbnail(image_path: str, user_id: int) -> str:
    # creates a small preview JPEG for history list display

    thumb_dir = Path(UPLOAD_DIR) / str(user_id) / "thumbs"
    thumb_dir.mkdir(parents=True, exist_ok=True)

    thumb_path = thumb_dir / f"{Path(image_path).stem}_thumb.jpg"

    try:
        img = Image.open(image_path).convert("RGB")
        img.thumbnail((THUMBNAIL_SIZE, THUMBNAIL_SIZE))
        img.save(str(thumb_path), "JPEG", quality=85)
    except Exception as e:
        print(f"[utils] Thumbnail generation failed: {e}")
        return ""

    return str(thumb_path)


def generate_video_thumbnail(video_path: str, user_id: int) -> str:
    # extracts the first frame of a video and saves it as thumbnail

    import cv2

    thumb_dir = Path(UPLOAD_DIR) / str(user_id) / "thumbs"
    thumb_dir.mkdir(parents=True, exist_ok=True)

    thumb_path = str(thumb_dir / (Path(video_path).stem + "_thumb.jpg"))

    cap = cv2.VideoCapture(video_path)
    ret, frame = cap.read()
    cap.release()

    if ret:
        # resize frame to thumbnail size
        h, w = frame.shape[:2]
        scale = THUMBNAIL_SIZE / max(h, w)
        new_w, new_h = int(w * scale), int(h * scale)
        resized = cv2.resize(frame, (new_w, new_h))
        cv2.imwrite(thumb_path, resized)
        return thumb_path

    return ""


def get_month_key() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m")


def get_reset_date() -> str:
    now = datetime.now(timezone.utc)
    if now.month == 12:
        return f"{now.year + 1}-01-01"
    return f"{now.year}-{now.month + 1:02d}-01"


def calculate_processing_time(start_time: float) -> int:
    return int((time.time() - start_time) * 1000)


def paginate(query, page: int, per_page: int) -> tuple:
    total = query.count()
    items = query.offset((page - 1) * per_page).limit(per_page).all()
    return items, total