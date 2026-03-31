# profile_router.py
# User profile, usage stats, and notifications
# pyright: reportGeneralTypeIssues=false, reportArgumentType=false, reportAttributeAccessIssue=false, reportOperatorIssue=false, reportCallIssue=false

import uuid
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, Query, UploadFile, File, Form
from sqlalchemy.orm import Session

from database import get_db
from models.db_models import User, Scan, UsageLog, Notification, SubscriptionRequest
from schemas import UsageStats, NotificationOut, SubscriptionRequestOut
from auth import get_current_active_user
from utils import get_month_key, get_reset_date
from config import settings
import os
from dotenv import load_dotenv

load_dotenv()

MAX_FREE_SCANS = int(os.getenv("MAX_FREE_SCANS_PER_MONTH", 10))
MAX_PRO_SCANS  = int(os.getenv("MAX_PRO_SCANS_PER_MONTH", 500))
PAYMENT_NUMBER = "+92 3371458542"
ALLOWED_PAYMENT_METHODS = {"jazzcash", "easypaisa"}
ALLOWED_RECEIPT_EXTENSIONS = {"jpg", "jpeg", "png", "webp", "jfif", "pdf"}

router = APIRouter(prefix="/profile", tags=["Profile"])


def get_scan_limit(plan: str) -> int:
    if settings.ENABLE_ALL_PRO_FEATURES:
        return 10**9
    return MAX_PRO_SCANS if plan == "pro" else MAX_FREE_SCANS


def _save_subscription_receipt(file: UploadFile, user_id: int) -> str:
    filename = file.filename or "receipt.jpg"
    ext = filename.rsplit(".", 1)[-1].lower() if "." in filename else ""
    if ext not in ALLOWED_RECEIPT_EXTENSIONS:
        raise HTTPException(status_code=400, detail="Receipt must be jpg, jpeg, png, webp, jfif, or pdf.")

    receipt_dir = Path(settings.UPLOAD_DIR) / "subscriptions" / str(user_id)
    receipt_dir.mkdir(parents=True, exist_ok=True)
    safe_ext = "jpg" if ext == "jfif" else ext
    receipt_name = f"{uuid.uuid4().hex}_receipt.{safe_ext}"
    receipt_path = receipt_dir / receipt_name

    content = file.file.read()
    if not content:
        raise HTTPException(status_code=400, detail="Receipt file is empty.")

    with open(receipt_path, "wb") as fp:
        fp.write(content)

    return str(receipt_path)


# ── PROFILE + USAGE COMBINED ──────────────────────────────────

@router.get("")
def get_profile(
    db          : Session = Depends(get_db),
    current_user: User    = Depends(get_current_active_user)
):
    # returns profile info + this month's usage in one call
    month_key   = get_month_key()
    usage       = db.query(UsageLog).filter(
        UsageLog.user_id    == current_user.id,
        UsageLog.year_month == month_key
    ).first()

    scans_this_month = usage.scan_count if usage else 0
    limit            = get_scan_limit(current_user.plan)
    total_scans      = db.query(Scan).filter(
        Scan.user_id   == current_user.id,
        Scan.is_deleted == False
    ).count()

    return {
        "user": {
            "id"        : current_user.id,
            "email"     : current_user.email,
            "full_name" : current_user.full_name,
            "plan"      : current_user.plan,
            "avatar_url": current_user.avatar_url,
            "created_at": str(current_user.created_at),
            "last_login": str(current_user.last_login),
        },
        "usage": {
            "scans_this_month"    : scans_this_month,
            "scan_limit"          : limit,
            "scans_remaining"     : max(0, limit - scans_this_month),
            "plan"                : current_user.plan,
            "total_scans_all_time": total_scans,
            "reset_date"          : get_reset_date(),
        }
    }


# ── USAGE ONLY ────────────────────────────────────────────────

@router.get("/usage", response_model=UsageStats)
def get_usage(
    db          : Session = Depends(get_db),
    current_user: User    = Depends(get_current_active_user)
):
    month_key = get_month_key()
    usage     = db.query(UsageLog).filter(
        UsageLog.user_id    == current_user.id,
        UsageLog.year_month == month_key
    ).first()

    scans_used  = usage.scan_count if usage else 0
    limit       = get_scan_limit(current_user.plan)
    total_scans = db.query(Scan).filter(
        Scan.user_id   == current_user.id,
        Scan.is_deleted == False
    ).count()

    return UsageStats(
        scans_this_month     = scans_used,
        scan_limit           = limit,
        scans_remaining      = max(0, limit - scans_used),
        plan                 = current_user.plan,
        total_scans_all_time = total_scans,
        reset_date           = get_reset_date(),
    )


# ── NOTIFICATIONS ─────────────────────────────────────────────

@router.get("/notifications", response_model=list[NotificationOut])
def get_notifications(
    unread_only : bool    = Query(default=False),
    db          : Session = Depends(get_db),
    current_user: User    = Depends(get_current_active_user)
):
    query = db.query(Notification).filter(
        Notification.user_id == current_user.id
    )
    if unread_only:
        query = query.filter(Notification.is_read == False)

    return query.order_by(Notification.created_at.desc()).all()


@router.get("/notifications/unread-count")
def unread_count(
    db          : Session = Depends(get_db),
    current_user: User    = Depends(get_current_active_user)
):
    count = db.query(Notification).filter(
        Notification.user_id == current_user.id,
        Notification.is_read == False
    ).count()
    return {"unread_count": count}


@router.put("/notifications/{notification_id}/read")
def mark_read(
    notification_id: int,
    db             : Session = Depends(get_db),
    current_user   : User    = Depends(get_current_active_user)
):
    notif = db.query(Notification).filter(
        Notification.id      == notification_id,
        Notification.user_id == current_user.id
    ).first()

    if not notif:
        raise HTTPException(status_code=404, detail="Notification not found.")

    notif.is_read = True
    db.commit()
    return {"detail": "Marked as read."}


@router.put("/notifications/read-all")
def mark_all_read(
    db          : Session = Depends(get_db),
    current_user: User    = Depends(get_current_active_user)
):
    db.query(Notification).filter(
        Notification.user_id == current_user.id,
        Notification.is_read == False
    ).update({"is_read": True})
    db.commit()
    return {"detail": "All notifications marked as read."}


@router.delete("/notifications/clear-read")
def clear_read_notifications(
    db          : Session = Depends(get_db),
    current_user: User    = Depends(get_current_active_user)
):
    deleted_count = db.query(Notification).filter(
        Notification.user_id == current_user.id,
        Notification.is_read == True
    ).delete()

    db.commit()
    return {
        "detail": "Read notifications cleared.",
        "deleted_count": deleted_count,
    }


@router.delete("/notifications/{notification_id}")
def delete_notification(
    notification_id: int,
    db             : Session = Depends(get_db),
    current_user   : User    = Depends(get_current_active_user)
):
    notif = db.query(Notification).filter(
        Notification.id      == notification_id,
        Notification.user_id == current_user.id
    ).first()

    if not notif:
        raise HTTPException(status_code=404, detail="Notification not found.")

    db.delete(notif)
    db.commit()
    return {"detail": "Notification deleted."}


# ── PROFILE STATS ─────────────────────────────────────────────

@router.get("/stats")
def get_profile_stats(
    db          : Session = Depends(get_db),
    current_user: User    = Depends(get_current_active_user)
):
    # same as scan stats but scoped here for profile page use
    scans = db.query(Scan).filter(
        Scan.user_id   == current_user.id,
        Scan.is_deleted == False
    ).all()

    severity_breakdown = {"low": 0, "medium": 0, "high": 0, "critical": 0}
    damage_counts      = {}

    for scan in scans:
        sev = scan.severity or "low"
        severity_breakdown[sev] = severity_breakdown.get(sev, 0) + 1

        if scan.damage_labels:
            for label in scan.damage_labels.split(","):
                label = label.strip()
                if label:
                    damage_counts[label] = damage_counts.get(label, 0) + 1

    top_damages = sorted(
        [{"type": k, "count": v} for k, v in damage_counts.items()],
        key=lambda x: x["count"], reverse=True
    )[:5]

    return {
        "total_scans"       : len(scans),
        "severity_breakdown": severity_breakdown,
        "top_damage_types"  : top_damages,
    }


@router.post("/subscription-request", response_model=SubscriptionRequestOut)
def submit_subscription_request(
    payment_method: str = Form(...),
    receipt: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    method = (payment_method or "").strip().lower()
    if method not in ALLOWED_PAYMENT_METHODS:
        raise HTTPException(status_code=400, detail="Payment method must be JazzCash or Easypaisa.")

    if current_user.plan in ("pro", "admin"):
        raise HTTPException(status_code=400, detail="Your account already has an upgraded plan.")

    pending = db.query(SubscriptionRequest).filter(
        SubscriptionRequest.user_id == current_user.id,
        SubscriptionRequest.status == "pending",
    ).first()
    if pending:
        raise HTTPException(status_code=409, detail="You already have a pending subscription request.")

    receipt_path = _save_subscription_receipt(receipt, current_user.id)

    req = SubscriptionRequest(
        user_id=current_user.id,
        payment_method=method,
        payment_number=PAYMENT_NUMBER,
        receipt_path=receipt_path,
        status="pending",
    )
    db.add(req)

    admin_users = db.query(User).filter(User.plan == "admin", User.is_active == True).all()
    for admin in admin_users:
        db.add(Notification(
            user_id=admin.id,
            message=f"New pro subscription request from {current_user.email} via {method.title()}.",
            type="info",
        ))

    db.commit()
    db.refresh(req)
    return req


@router.get("/subscription-request/me", response_model=SubscriptionRequestOut | None)
def get_my_subscription_request(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    req = db.query(SubscriptionRequest).filter(
        SubscriptionRequest.user_id == current_user.id,
    ).order_by(SubscriptionRequest.created_at.desc()).first()
    return req