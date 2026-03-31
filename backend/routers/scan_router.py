# scan_router.py
# Core feature — handles image AND video upload, AI inference, history, stats
# pyright: reportGeneralTypeIssues=false, reportArgumentType=false, reportAttributeAccessIssue=false, reportOperatorIssue=false, reportCallIssue=false

import time
import mimetypes
from pathlib import Path
from datetime import datetime, timezone, timedelta

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form, Query
from fastapi.responses import FileResponse
from fastapi.concurrency import run_in_threadpool
from sqlalchemy.orm import Session
from dotenv import load_dotenv
from config import settings

from database import get_db
from models.db_models import User, Scan, UsageLog, Notification
from schemas import ScanOut, PaginatedScans, Detection, BoundingBox, VideoSummary
from auth import get_current_active_user

from utils import (
    save_upload_file, generate_thumbnail,
    generate_video_thumbnail, get_month_key,
    calculate_processing_time, paginate, is_video,
)
from inference import (
    run_inference, generate_annotated_image,
    process_video, calculate_severity,
)

load_dotenv()

UPLOAD_DIR     = settings.UPLOAD_DIR
MAX_FREE_SCANS = settings.MAX_FREE_SCANS_PER_MONTH
MAX_PRO_SCANS  = settings.MAX_PRO_SCANS_PER_MONTH

router = APIRouter(prefix="/scans", tags=["Scans"])


# ── Helpers ───────────────────────────────────────────────────────────────────

def _is_admin(user: "User") -> bool:
    return (
        getattr(user, "plan", "") == "admin"
        or bool(getattr(user, "is_admin", False))
    )


@router.get("/debug/me")
def debug_me(current_user: "User" = Depends(get_current_active_user)):
    return {
        "id"              : current_user.id,
        "email"           : getattr(current_user, "email", None),
        "plan"            : getattr(current_user, "plan", "MISSING"),
        "is_admin"        : getattr(current_user, "is_admin", "MISSING"),
        "_is_admin_result": _is_admin(current_user),
    }


@router.get("/debug/scan/{scan_id}")
def debug_scan(
    scan_id     : int,
    db          : Session = Depends(get_db),
    current_user: "User"  = Depends(get_current_active_user),
):
    scan = db.query(Scan).filter(Scan.id == scan_id).first()
    if not scan:
        return {"error": "Scan not found"}
    return {
        "id"                  : scan.id,
        "user_id"             : scan.user_id,
        "file_type"           : scan.file_type,
        "original_filename"   : scan.original_filename,
        "annotated_video_path": scan.annotated_video_path,
        "annotated_image_path": scan.annotated_image_path,
        "image_path"          : scan.image_path,
        "is_deleted"          : scan.is_deleted,
        "created_at"          : str(scan.created_at),
        "result_json"         : scan.result_json,
    }


def get_scan_limit(plan: str) -> int:
    if settings.ENABLE_ALL_PRO_FEATURES:
        return 10 ** 9
    return MAX_PRO_SCANS if plan == "pro" else MAX_FREE_SCANS


def get_or_create_usage(db: Session, user_id: int) -> "UsageLog":
    month_key = get_month_key()
    usage = db.query(UsageLog).filter(
        UsageLog.user_id    == user_id,
        UsageLog.year_month == month_key,
    ).first()
    if not usage:
        usage = UsageLog(user_id=user_id, year_month=month_key, scan_count=0)
        db.add(usage)
        db.commit()
        db.refresh(usage)
    return usage


def build_scan_out(scan: "Scan", detections_list: list) -> ScanOut:
    parsed = [
        Detection(
            label           = d["label"],
            confidence      = d["confidence"],
            bbox            = BoundingBox(**d["bbox"]),
            damage_category = d["damage_category"],
            severity_score  = d["severity_score"],
            frame           = d.get("frame"),
        )
        for d in detections_list
    ]

    video_summary = None
    if scan.file_type == "video" and scan.result_json:
        s = scan.result_json.get("summary", {})
        if s:
            video_summary = VideoSummary(
                total_frames       = s.get("total_frames", 0),
                frames_analyzed    = s.get("frames_analyzed", 0),
                total_detections   = s.get("total_detections", 0),
                unique_damages     = s.get("unique_damages", []),
                damage_counts      = s.get("damage_counts", {}),
                severity           = s.get("severity", "low"),
                confidence_avg     = s.get("confidence_avg", 0.0),
                processing_time_ms = s.get("processing_time_ms", 0),
                video_fps          = s.get("video_fps", 0.0),
                video_resolution   = s.get("video_resolution", ""),
            )

    return ScanOut(
        id                   = scan.id,
        original_filename    = scan.original_filename,
        file_type            = scan.file_type,
        thumbnail_path       = scan.thumbnail_path,
        annotated_image_path = scan.annotated_image_path,
        annotated_video_path = scan.annotated_video_path,
        playback_url         = f"/scans/{scan.id}/media",
        total_detections     = scan.total_detections,
        severity             = scan.severity,
        confidence_avg       = scan.confidence_avg,
        processing_time_ms   = scan.processing_time_ms,
        created_at           = scan.created_at,
        detections           = parsed,
        video_summary        = video_summary,
        damage_labels        = scan.damage_labels,
    )


def _rewrite_path_for_admin(path: str, owner_id: int, admin_id: int) -> str:
    if not path:
        return path
    p     = Path(path)
    parts = list(p.parts)
    try:
        idx       = next(i for i, part in enumerate(parts) if part == str(owner_id))
        parts[idx] = str(admin_id)
        return str(Path(*parts))
    except StopIteration:
        return path


def _resolve_scan_media(
    scan            : "Scan",
    requesting_user : "User | None" = None,
) -> tuple[str, str]:
    import logging as _log

    annotated_video = str(scan.annotated_video_path or "")
    annotated_image = str(scan.annotated_image_path or "")
    original        = str(scan.image_path or "")

    if (
        requesting_user is not None
        and _is_admin(requesting_user)
        and scan.user_id != requesting_user.id
    ):
        annotated_video = _rewrite_path_for_admin(annotated_video, scan.user_id, requesting_user.id)
        annotated_image = _rewrite_path_for_admin(annotated_image, scan.user_id, requesting_user.id)

    candidates = (
        [(annotated_video, "video/mp4"), (annotated_image, "image/jpeg")]
        if scan.file_type == "video"
        else [(annotated_image, None), (original, None)]
    )

    for path, forced_mime in candidates:
        if path and Path(path).exists():
            mime = forced_mime or mimetypes.guess_type(path)[0] or "application/octet-stream"
            return path, mime

    missing = [p for p, _ in candidates]
    _log.error(f"Scan media not found for scan_id={scan.id}. Tried: {missing}")
    raise HTTPException(status_code=404, detail=f"Scan media not found. Tried: {missing}")


def _get_scan_or_404(
    db          : Session,
    scan_id     : int,
    current_user: "User",
    *,
    include_deleted: bool = False,
) -> "Scan":
    query = db.query(Scan).filter(Scan.id == scan_id)
    if not include_deleted:
        query = query.filter(Scan.is_deleted == False)
    if not _is_admin(current_user):
        query = query.filter(Scan.user_id == current_user.id)
    scan = query.first()
    if not scan:
        raise HTTPException(status_code=404, detail="Scan not found.")
    return scan


# ── UPLOAD ────────────────────────────────────────────────────────────────────

@router.post("/upload", response_model=ScanOut)
async def upload_scan(
    file        : UploadFile = File(...),
    notes       : str        = Form(default=""),
    db          : Session    = Depends(get_db),
    current_user: "User"     = Depends(get_current_active_user),
):
    """
    Upload image or video for AI damage analysis using local YOLOv8 (best.pt).
    Heavy work runs in a thread pool so the event loop stays free.
    """
    usage = get_or_create_usage(db, current_user.id)
    limit = get_scan_limit(current_user.plan)
    if usage.scan_count >= limit:
        raise HTTPException(
            status_code=429,
            detail=(
                f"Monthly scan limit reached ({limit} scans). "
                + ("Upgrade to Pro for 500 scans/month." if current_user.plan == "free" else "Contact support.")
            ),
        )

    file_path, original_filename = await save_upload_file(file, current_user.id)
    file_type = "video" if is_video(original_filename) else "image"

    start_time    = time.time()
    annotated_dir = str(Path(UPLOAD_DIR) / str(current_user.id) / "annotated")
    Path(annotated_dir).mkdir(parents=True, exist_ok=True)

    detections         = []
    annotated_img_path = None
    annotated_vid_path = None
    result_json        = {}
    video_meta         = {}

    if file_type == "image":

        def _run_image():
            dets = run_inference(file_path)
            out  = str(Path(annotated_dir) / f"annotated_{Path(file_path).name}")
            generate_annotated_image(file_path, dets, out)
            return dets, out

        detections, annotated_img_path = await run_in_threadpool(_run_image)

        result_json = {
            "detections": detections,
            "summary": {
                "total"       : len(detections),
                "severity"    : calculate_severity(detections),
                "damage_types": list({d["label"] for d in detections}),
            },
        }

    elif file_type == "video":

        annotated_vid_path = str(Path(annotated_dir) / f"annotated_{Path(file_path).stem}.mp4")

        def _run_video():
            # process_video uses local YOLOv8 — no model argument needed
            result = process_video(
                video_path     = file_path,
                output_path    = annotated_vid_path,
                frame_skip     = 5,
                conf_threshold = 0.35,
            )

            # Copy annotated video to all admin folders for preview
            from shutil import copy2
            admin_users = db.query(User).filter(
                (User.plan == "admin") | (User.is_admin == True)
            ).all()
            for admin in admin_users:
                if admin.id == current_user.id:
                    continue
                admin_dir = Path(UPLOAD_DIR) / str(admin.id) / "annotated"
                admin_dir.mkdir(parents=True, exist_ok=True)
                try:
                    copy2(annotated_vid_path, admin_dir / f"annotated_{Path(file_path).stem}.mp4")
                except Exception as e:
                    print(f"[admin copy] Failed for admin {admin.id}: {e}")

            return result

        video_result = await run_in_threadpool(_run_video)
        detections   = video_result["detections"]
        result_json  = video_result
        summary      = video_result.get("summary", {})
        video_meta   = {
            "video_fps"       : summary.get("video_fps", 0),
            "video_resolution": summary.get("video_resolution", ""),
            "frames_analyzed" : summary.get("frames_analyzed", 0),
        }

    # ── Aggregate stats ───────────────────────────────────────────────────
    severity       = calculate_severity(detections)
    confidence_avg = (
        round(sum(d["confidence"] for d in detections) / len(detections), 3)
        if detections else 0.0
    )
    processing_ms = calculate_processing_time(start_time)
    unique_labels = list({d["label"] for d in detections})
    damage_labels = ",".join(unique_labels)

    # ── Thumbnail ─────────────────────────────────────────────────────────
    if file_type == "image":
        thumb_path = await run_in_threadpool(generate_thumbnail, file_path, current_user.id)
    else:
        thumb_path = await run_in_threadpool(generate_video_thumbnail, file_path, current_user.id)

    # ── Persist ───────────────────────────────────────────────────────────
    scan = Scan(
        user_id              = current_user.id,
        original_filename    = original_filename,
        file_type            = file_type,
        image_path           = file_path,
        thumbnail_path       = thumb_path,
        annotated_image_path = annotated_img_path,
        annotated_video_path = annotated_vid_path,
        result_json          = result_json,
        damage_labels        = damage_labels,
        total_detections     = len(detections),
        severity             = severity,
        confidence_avg       = confidence_avg,
        processing_time_ms   = processing_ms,
        video_fps            = video_meta.get("video_fps"),
        video_resolution     = video_meta.get("video_resolution"),
        frames_analyzed      = video_meta.get("frames_analyzed"),
    )
    db.add(scan)

    usage.scan_count  += 1
    usage.last_scan_at = datetime.now(timezone.utc)

    damage_summary = f"{len(unique_labels)} damage type(s) found" if unique_labels else "No damage detected"
    db.add(Notification(
        user_id = current_user.id,
        message = f"Scan complete ({file_type}): {severity.upper()} severity — {damage_summary}.",
        type    = "success" if severity == "low" else "warning",
    ))

    db.commit()
    db.refresh(scan)
    return build_scan_out(scan, detections)


# ── HISTORY ───────────────────────────────────────────────────────────────────

_SEVERITY_ORDER = {"critical": 0, "high": 1, "medium": 2, "low": 3}


@router.get("/history", response_model=PaginatedScans)
def get_history(
    page        : int     = Query(default=1, ge=1),
    per_page    : int     = Query(default=10, ge=1, le=50),
    severity    : str     = Query(default=""),
    file_type   : str     = Query(default=""),
    sort        : str     = Query(default="newest"),
    db          : Session = Depends(get_db),
    current_user: "User"  = Depends(get_current_active_user),
):
    query = (
        db.query(Scan).filter(Scan.is_deleted == False)
        if _is_admin(current_user)
        else db.query(Scan).filter(Scan.user_id == current_user.id, Scan.is_deleted == False)
    )

    if severity:
        query = query.filter(Scan.severity == severity)
    if file_type in ("image", "video"):
        query = query.filter(Scan.file_type == file_type)

    query = query.order_by(Scan.created_at.asc() if sort == "oldest" else Scan.created_at.desc())

    items, total = paginate(query, page, per_page)

    if sort == "severity_high":
        items = sorted(items, key=lambda s: _SEVERITY_ORDER.get(s.severity or "low", 3))

    pages = max(1, (total + per_page - 1) // per_page)
    return PaginatedScans(items=items, total=total, page=page, per_page=per_page, pages=pages)


# ── DASHBOARD INSIGHTS ────────────────────────────────────────────────────────

@router.get("/insights/summary")
def get_insights_summary(
    db          : Session = Depends(get_db),
    current_user: "User"  = Depends(get_current_active_user),
):
    scans = (
        db.query(Scan).filter(Scan.is_deleted == False).order_by(Scan.created_at.desc()).all()
        if _is_admin(current_user)
        else db.query(Scan).filter(Scan.user_id == current_user.id, Scan.is_deleted == False).order_by(Scan.created_at.desc()).all()
    )

    total_scans = len(scans)
    severe_scans = image_scans = video_scans = 0
    total_confidence = total_proc_ms = weighted_sum = 0
    severity_weight  = {"low": 1, "medium": 2, "high": 3, "critical": 4}

    for scan in scans:
        if scan.severity in ("high", "critical"): severe_scans += 1
        if scan.file_type == "video": video_scans += 1
        else: image_scans += 1
        total_confidence += scan.confidence_avg or 0.0
        total_proc_ms    += scan.processing_time_ms or 0
        weighted_sum     += severity_weight.get(scan.severity or "low", 1)

    avg_confidence    = round(total_confidence / total_scans, 3) if total_scans else 0.0
    avg_processing_ms = int(total_proc_ms / total_scans) if total_scans else 0

    if total_scans:
        severity_index = weighted_sum / (total_scans * 4)
        risk_score     = int(min(100, round((severity_index * 70 + (severe_scans / total_scans) * 30) * 100)))
    else:
        risk_score = 0

    now         = datetime.now(timezone.utc)
    day_buckets = {(now - timedelta(days=i)).strftime("%Y-%m-%d"): 0 for i in range(6, -1, -1)}
    for scan in scans:
        if scan.created_at:
            key = scan.created_at.strftime("%Y-%m-%d")
            if key in day_buckets:
                day_buckets[key] += 1

    recent_alerts = [
        {"scan_id": s.id, "filename": s.original_filename, "severity": s.severity, "created_at": str(s.created_at)}
        for s in scans if s.severity in ("high", "critical")
    ][:5]

    recommended_actions = []
    if severe_scans > 0:
        recommended_actions.append("Prioritize high and critical scans for manual inspection.")
    if video_scans == 0 and total_scans > 0:
        recommended_actions.append("Upload a short walkaround video for richer damage context.")
    if avg_confidence < 0.55 and total_scans > 0:
        recommended_actions.append("Use brighter, close-range images to improve detection confidence.")
    if not recommended_actions:
        recommended_actions.append("System looks healthy. Keep monitoring weekly trends.")

    return {
        "risk_score"         : risk_score,
        "severe_scans"       : severe_scans,
        "avg_processing_ms"  : avg_processing_ms,
        "avg_confidence"     : avg_confidence,
        "file_mix"           : {"image": image_scans, "video": video_scans},
        "daily_scans"        : [{"day": d, "count": c} for d, c in day_buckets.items()],
        "recent_alerts"      : recent_alerts,
        "recommended_actions": recommended_actions,
    }


# ── SINGLE SCAN ───────────────────────────────────────────────────────────────

@router.get("/{scan_id}", response_model=ScanOut)
def get_scan(
    scan_id     : int,
    db          : Session = Depends(get_db),
    current_user: "User"  = Depends(get_current_active_user),
):
    scan       = _get_scan_or_404(db, scan_id, current_user)
    detections = (scan.result_json or {}).get("detections", [])
    return build_scan_out(scan, detections)


# ── DELETE ────────────────────────────────────────────────────────────────────

@router.delete("/{scan_id}")
def delete_scan(
    scan_id     : int,
    db          : Session = Depends(get_db),
    current_user: "User"  = Depends(get_current_active_user),
):
    scan            = _get_scan_or_404(db, scan_id, current_user, include_deleted=False)
    scan.is_deleted = True
    db.commit()
    return {"detail": "Scan deleted successfully."}


# ── MEDIA STREAM ──────────────────────────────────────────────────────────────

@router.get("/{scan_id}/media")
def stream_scan_media(
    scan_id     : int,
    db          : Session = Depends(get_db),
    current_user: "User"  = Depends(get_current_active_user),
):
    scan                  = _get_scan_or_404(db, scan_id, current_user)
    file_path, media_type = _resolve_scan_media(scan, current_user)
    return FileResponse(path=file_path, media_type=media_type)


# ── PREVIEW ───────────────────────────────────────────────────────────────────

@router.get("/{scan_id}/preview")
def preview_scan_media(
    scan_id     : int,
    db          : Session = Depends(get_db),
    current_user: "User"  = Depends(get_current_active_user),
):
    scan                  = _get_scan_or_404(db, scan_id, current_user)
    file_path, media_type = _resolve_scan_media(scan, current_user)
    return FileResponse(path=file_path, media_type=media_type)


# ── DOWNLOAD ─────────────────────────────────────────────────────────────────

@router.get("/{scan_id}/download")
def download_annotated(
    scan_id     : int,
    db          : Session = Depends(get_db),
    current_user: "User"  = Depends(get_current_active_user),
):
    scan            = _get_scan_or_404(db, scan_id, current_user)
    annotated_video = str(scan.annotated_video_path or "")
    annotated_image = str(scan.annotated_image_path or "")

    if _is_admin(current_user) and scan.user_id != current_user.id:
        annotated_video = _rewrite_path_for_admin(annotated_video, scan.user_id, current_user.id)
        annotated_image = _rewrite_path_for_admin(annotated_image, scan.user_id, current_user.id)

    if scan.file_type == "video" and annotated_video:
        file_path, media_type, download_name = annotated_video, "video/mp4", f"damage_analysis_{scan_id}.mp4"
    elif annotated_image:
        file_path, media_type, download_name = annotated_image, "image/jpeg", f"damage_analysis_{scan_id}.jpg"
    else:
        raise HTTPException(status_code=404, detail="Annotated file not found.")

    if not Path(file_path).exists():
        raise HTTPException(status_code=404, detail="File no longer exists on server.")

    return FileResponse(path=file_path, media_type=media_type, filename=download_name)


# ── STATS ─────────────────────────────────────────────────────────────────────

@router.get("/stats/overview")
def get_stats(
    db          : Session = Depends(get_db),
    current_user: "User"  = Depends(get_current_active_user),
):
    scans = (
        db.query(Scan).filter(Scan.is_deleted == False).all()
        if _is_admin(current_user)
        else db.query(Scan).filter(Scan.user_id == current_user.id, Scan.is_deleted == False).all()
    )

    total              = len(scans)
    severity_breakdown = {"low": 0, "medium": 0, "high": 0, "critical": 0}
    damage_type_counts: dict = {}
    total_confidence   = 0.0

    for scan in scans:
        sev = scan.severity or "low"
        severity_breakdown[sev] = severity_breakdown.get(sev, 0) + 1
        total_confidence += scan.confidence_avg or 0.0
        for lbl in (scan.damage_labels or "").split(","):
            lbl = lbl.strip()
            if lbl:
                damage_type_counts[lbl] = damage_type_counts.get(lbl, 0) + 1

    top_damages = sorted(
        [{"type": k, "count": v} for k, v in damage_type_counts.items()],
        key=lambda x: x["count"], reverse=True,
    )[:5]

    month_counts: dict = {}
    for scan in scans:
        if scan.created_at:
            m = scan.created_at.strftime("%Y-%m")
            month_counts[m] = month_counts.get(m, 0) + 1

    return {
        "total_scans"       : total,
        "severity_breakdown": severity_breakdown,
        "top_damage_types"  : top_damages,
        "avg_confidence"    : round(total_confidence / total, 3) if total else 0.0,
        "scans_by_month"    : [{"month": k, "count": v} for k, v in sorted(month_counts.items())][-6:],
    }


# ── ADMIN: DELETE ALL ─────────────────────────────────────────────────────────

@router.delete("/admin/delete-all-scans")
def admin_delete_all_scans(
    db          : Session = Depends(get_db),
    current_user: "User"  = Depends(get_current_active_user),
):
    if not _is_admin(current_user):
        raise HTTPException(status_code=403, detail="Admin only.")
    from shutil import rmtree
    upload_root = Path(UPLOAD_DIR)
    for user_dir in upload_root.iterdir():
        if user_dir.is_dir():
            for sub in ["annotated", "thumbs"]:
                subdir = user_dir / sub
                if subdir.exists():
                    rmtree(subdir, ignore_errors=True)
    db.query(Scan).delete()
    db.commit()
    return {"detail": "All scans and related files deleted."}


# ── DEBUG: FFMPEG ─────────────────────────────────────────────────────────────

@router.get("/debug/ffmpeg")
def debug_ffmpeg(current_user: "User" = Depends(get_current_active_user)):
    import shutil, subprocess
    result = {
        "ffmpeg_in_path"         : shutil.which("ffmpeg"),
        "hardcoded_paths_checked": [],
        "ffmpeg_version"         : None,
        "has_libx264"            : False,
        "has_libx265"            : False,
        "recommendation"         : None,
    }

    for p in ["/usr/bin/ffmpeg", "/usr/local/bin/ffmpeg", "/opt/homebrew/bin/ffmpeg"]:
        result["hardcoded_paths_checked"].append({"path": p, "exists": Path(p).exists()})

    ffmpeg_bin = result["ffmpeg_in_path"] or next(
        (p["path"] for p in result["hardcoded_paths_checked"] if p["exists"]), None
    )

    if not ffmpeg_bin:
        result["recommendation"] = "ffmpeg NOT FOUND. Install: apt-get install -y ffmpeg"
        return result

    try:
        ver = subprocess.run([ffmpeg_bin, "-version"], stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, timeout=5)
        result["ffmpeg_version"] = (ver.stdout or ver.stderr).splitlines()[0]
    except Exception as e:
        result["ffmpeg_version"] = f"Error: {e}"

    try:
        enc = subprocess.run([ffmpeg_bin, "-encoders"], stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, timeout=10)
        result["has_libx264"] = "libx264" in enc.stdout
        result["has_libx265"] = "libx265" in enc.stdout
    except Exception as e:
        result["ffmpeg_encoders_error"] = str(e)

    result["recommendation"] = (
        "ffmpeg is correctly installed with libx264. Video conversion should work."
        if result["has_libx264"]
        else "ffmpeg found but libx264 MISSING. Run: apt-get install -y ffmpeg"
    )
    return result