from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse
from sqlalchemy import func, or_
from sqlalchemy.orm import Session
from datetime import datetime, timedelta, timezone
from io import StringIO
import csv

from auth import get_current_active_user, require_admin
from database import get_db
from models.db_models import (
    DamageReport, Notification, Scan, ScanChatMessage,
    SubscriptionRequest, UsageLog, User,
)

router = APIRouter(prefix="/admin", tags=["Admin"])

PROTECTED_ADMIN_EMAIL = "muhammadsaadzubair186@gmail.com"


# ── HELPERS ───────────────────────────────────────────────────────────────────

def _get_user_or_404(db: Session, user_id: int) -> User:
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found.")
    return user


def _serialize_user(user: User, db: Session) -> dict:
    total_scans = (
        db.query(func.count(Scan.id))
        .filter(Scan.user_id == user.id, Scan.is_deleted == False)
        .scalar()
    )
    return {
        "id": user.id,
        "email": user.email,
        "full_name": user.full_name,
        "plan": user.plan,
        "is_active": user.is_active,
        "total_scans": total_scans,
        "created_at": str(user.created_at),
        "last_login": str(user.last_login),
    }


# ── UNIFIED ANALYTICS ENDPOINT ────────────────────────────────────────────────

@router.get("/analytics")
def get_analytics(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_active_user),
):
    """
    Unified analytics endpoint.
    - Regular users get their own personal analytics.
    - Admin users get full platform-wide advanced analytics.
    Returns a `scope` field: "user" | "admin" so the frontend
    can render the correct dashboard variant.
    """
    from collections import Counter

    is_admin = getattr(user, "is_admin", False) or getattr(user, "plan", "") == "admin"

    # ── months helper (last 12) ──────────────────────────────
    now = datetime.now(timezone.utc)
    months = [
        (now.year if now.month - i > 0 else now.year - 1, (now.month - i - 1) % 12 + 1)
        for i in range(11, -1, -1)
    ]
    month_labels = [f"{y}-{m:02d}" for y, m in months]
    severities = ["low", "medium", "high", "critical"]

    # ── shared: severity trends (scoped) ─────────────────────
    sev_data = {sev: {label: 0 for label in month_labels} for sev in severities}
    scan_filter = Scan.is_deleted == False
    if not is_admin:
        scan_filter = (Scan.is_deleted == False) & (Scan.user_id == user.id)

    scans_for_sev = db.query(Scan.severity, Scan.created_at).filter(scan_filter).all()
    for sev, created_at in scans_for_sev:
        if created_at and sev in severities:
            label = f"{created_at.year}-{created_at.month:02d}"
            if label in sev_data[sev]:
                sev_data[sev][label] += 1

    severity_trends = {
        "months": month_labels,
        "severities": severities,
        "counts": {sev: [sev_data[sev][m] for m in month_labels] for sev in severities},
    }

    # ── shared: report type distribution (scoped) ────────────
    report_types_q = db.query(DamageReport.report_type)
    if not is_admin:
        report_types_q = report_types_q.filter(DamageReport.user_id == user.id)
    report_types_rows = report_types_q.all()
    rt_counter = Counter([r[0] or "unknown" for r in report_types_rows])
    report_type_distribution = {
        "types": list(rt_counter.keys()),
        "counts": list(rt_counter.values()),
    }

    # ── base response ─────────────────────────────────────────
    base = {
        "scope": "admin" if is_admin else "user",
        "severity_trends": severity_trends,
        "report_type_distribution": report_type_distribution,
    }

    # ── user-only extras ──────────────────────────────────────
    if not is_admin:
        # Personal scan summary counts
        total_scans = db.query(func.count(Scan.id)).filter(
            Scan.user_id == user.id, Scan.is_deleted == False
        ).scalar()
        thirty_ago = now - timedelta(days=30)
        scans_30d = db.query(func.count(Scan.id)).filter(
            Scan.user_id == user.id,
            Scan.is_deleted == False,
            Scan.created_at >= thirty_ago,
        ).scalar()
        sev_breakdown = {
            sev: db.query(func.count(Scan.id))
                   .filter(Scan.user_id == user.id, Scan.severity == sev, Scan.is_deleted == False)
                   .scalar()
            for sev in severities
        }
        base["user_summary"] = {
            "total_scans": total_scans,
            "scans_last_30_days": scans_30d,
            "severity_breakdown": sev_breakdown,
        }
        return base

    # ── admin-only extras ─────────────────────────────────────

    # 1. Platform stats
    severity_counts = {
        sev: db.query(func.count(Scan.id))
               .filter(Scan.severity == sev, Scan.is_deleted == False)
               .scalar()
        for sev in severities
    }
    platform_stats = {
        "total_users": db.query(func.count(User.id)).scalar(),
        "pro_users":   db.query(func.count(User.id)).filter(User.plan == "pro").scalar(),
        "free_users":  db.query(func.count(User.id)).filter(User.plan == "free").scalar(),
        "admin_users": db.query(func.count(User.id)).filter(User.plan == "admin").scalar(),
        "total_scans": db.query(func.count(Scan.id)).filter(Scan.is_deleted == False).scalar(),
        "severity_breakdown": severity_counts,
    }

    # 2. User growth (last 12 months)
    growth_counts = {label: 0 for label in month_labels}
    for (created_at,) in db.query(User.created_at).all():
        if created_at:
            label = f"{created_at.year}-{created_at.month:02d}"
            if label in growth_counts:
                growth_counts[label] += 1
    user_growth = {
        "months": month_labels,
        "user_counts": [growth_counts[m] for m in month_labels],
    }

    # 3. Daily active users (last 30 days)
    days_30 = [(now - timedelta(days=i)).strftime("%Y-%m-%d") for i in range(29, -1, -1)]
    dau_counts = {d: 0 for d in days_30}
    for _, last_login in db.query(User.id, User.last_login).all():
        if last_login:
            day = last_login.strftime("%Y-%m-%d")
            if day in dau_counts:
                dau_counts[day] += 1
    daily_active_users = {
        "days": days_30,
        "active_users": [dau_counts[d] for d in days_30],
    }

    # 4. Churn rate
    thirty_ago = now - timedelta(days=30)
    churned = db.query(User).filter(User.is_active == False, User.updated_at >= thirty_ago).count()
    total_users = db.query(User).count()
    churn_rate = {
        "churned": churned,
        "total_users": total_users,
        "churn_rate_percent": round((churned / total_users) * 100 if total_users else 0, 2),
    }

    # 5. Average scans per user
    total_scans_all = db.query(Scan).filter(Scan.is_deleted == False).count()
    scans_30d_all = db.query(Scan).filter(Scan.is_deleted == False, Scan.created_at >= thirty_ago).count()
    avg_scans = {
        "average_lifetime": round(total_scans_all / total_users if total_users else 0, 2),
        "average_last_30_days": round(scans_30d_all / total_users if total_users else 0, 2),
    }

    # 6. Most active users (top 10)
    from sqlalchemy import desc
    top_users = (
        db.query(User.email, func.count(Scan.id).label("scan_count"))
        .join(Scan, Scan.user_id == User.id)
        .filter(Scan.is_deleted == False)
        .group_by(User.id)
        .order_by(desc("scan_count"))
        .limit(10)
        .all()
    )
    most_active_users = {"users": [{"email": u[0], "scan_count": u[1]} for u in top_users]}

    # 7. Damage label frequency
    all_labels: list[str] = []
    for (labels,) in db.query(Scan.damage_labels).filter(
        Scan.is_deleted == False, Scan.damage_labels != None
    ).all():
        if labels:
            all_labels.extend([x.strip() for x in labels.split(",") if x.strip()])
    dl_counter = Counter(all_labels)
    damage_label_frequency = {
        "labels": list(dl_counter.keys()),
        "counts": list(dl_counter.values()),
    }

    # 8. Scan file-type distribution
    ft_counter = Counter(
        [t[0] or "unknown" for t in db.query(Scan.file_type).filter(Scan.is_deleted == False).all()]
    )
    scan_file_type_distribution = {
        "file_types": list(ft_counter.keys()),
        "counts": list(ft_counter.values()),
    }

    # 9. Top report types (last 30 days)
    recent_reports = db.query(DamageReport.report_type).filter(
        DamageReport.generated_at >= thirty_ago
    ).all()
    tr_counter = Counter([r[0] or "unknown" for r in recent_reports])
    top_report_types = {
        "types": list(tr_counter.keys()),
        "counts": list(tr_counter.values()),
    }

    # 10. Activity (last 14 days scans-per-day + active/inactive)
    week_ago = now - timedelta(days=7)
    fortnight_ago = now - timedelta(days=13)
    day_buckets = {
        (now - timedelta(days=i)).strftime("%Y-%m-%d"): 0
        for i in range(13, -1, -1)
    }
    for scan in db.query(Scan).filter(Scan.is_deleted == False, Scan.created_at >= fortnight_ago).all():
        key = scan.created_at.strftime("%Y-%m-%d")
        if key in day_buckets:
            day_buckets[key] += 1
    activity_stats = {
        "active_users_last_7_days": db.query(func.count(User.id))
            .filter(User.last_login >= week_ago).scalar(),
        "scans_last_7_days": db.query(func.count(Scan.id))
            .filter(Scan.created_at >= week_ago, Scan.is_deleted == False).scalar(),
        "inactive_users": db.query(func.count(User.id))
            .filter(User.is_active == False).scalar(),
        "scans_per_day": [{"day": d, "count": c} for d, c in day_buckets.items()],
    }

    base.update({
        "platform_stats": platform_stats,
        "user_growth": user_growth,
        "daily_active_users": daily_active_users,
        "churn_rate": churn_rate,
        "avg_scans": avg_scans,
        "most_active_users": most_active_users,
        "damage_label_frequency": damage_label_frequency,
        "scan_file_type_distribution": scan_file_type_distribution,
        "top_report_types": top_report_types,
        "activity_stats": activity_stats,
    })
    return base


# ── CSV EXPORT (admin only) ───────────────────────────────────────────────────

@router.get("/stats/export")

def export_analytics_csv(db: Session = Depends(get_db), admin: User = Depends(require_admin)):
    """Export all analytics data as a multi-section CSV download (matches AnalyticsPage.jsx)."""
    from collections import Counter
    now = datetime.now(timezone.utc)
    months = [
        (now.year if now.month - i > 0 else now.year - 1, (now.month - i - 1) % 12 + 1)
        for i in range(11, -1, -1)
    ]
    month_labels = [f"{y}-{m:02d}" for y, m in months]
    severities = ["low", "medium", "high", "critical"]
    output = StringIO()
    writer = csv.writer(output)

    # 1. Platform stats
    severity_counts = {
        sev: db.query(func.count(Scan.id))
               .filter(Scan.severity == sev, Scan.is_deleted == False)
               .scalar()
        for sev in severities
    }
    platform_stats = {
        "total_users": db.query(func.count(User.id)).scalar(),
        "pro_users":   db.query(func.count(User.id)).filter(User.plan == "pro").scalar(),
        "free_users":  db.query(func.count(User.id)).filter(User.plan == "free").scalar(),
        "admin_users": db.query(func.count(User.id)).filter(User.plan == "admin").scalar(),
        "total_scans": db.query(func.count(Scan.id)).filter(Scan.is_deleted == False).scalar(),
        "severity_breakdown": severity_counts,
    }
    writer.writerow(["Platform Stats"])
    for k, v in platform_stats.items():
        if isinstance(v, dict):
            for sk, sv in v.items():
                writer.writerow([f"{k}:{sk}", sv])
        else:
            writer.writerow([k, v])
    writer.writerow([])

    # 2. User growth
    growth_counts = {label: 0 for label in month_labels}
    for (created_at,) in db.query(User.created_at).all():
        if created_at:
            label = f"{created_at.year}-{created_at.month:02d}"
            if label in growth_counts:
                growth_counts[label] += 1
    writer.writerow(["User Growth"])
    writer.writerow(["Month", "New Users"])
    for m in month_labels:
        writer.writerow([m, growth_counts[m]])
    writer.writerow([])

    # 3. Daily active users
    days_30 = [(now - timedelta(days=i)).strftime("%Y-%m-%d") for i in range(29, -1, -1)]
    dau_counts = {d: 0 for d in days_30}
    for _, last_login in db.query(User.id, User.last_login).all():
        if last_login:
            day = last_login.strftime("%Y-%m-%d")
            if day in dau_counts:
                dau_counts[day] += 1
    writer.writerow(["Daily Active Users"])
    writer.writerow(["Day", "Active Users"])
    for d in days_30:
        writer.writerow([d, dau_counts[d]])
    writer.writerow([])

    # 4. Churn rate
    thirty_ago = now - timedelta(days=30)
    churned = db.query(User).filter(User.is_active == False, User.updated_at >= thirty_ago).count()
    total_users = db.query(User).count()
    churn_rate_percent = round((churned / total_users) * 100 if total_users else 0, 2)
    writer.writerow(["Churn Rate"])
    writer.writerow(["Churned", churned])
    writer.writerow(["Total Users", total_users])
    writer.writerow(["Churn Rate %", churn_rate_percent])
    writer.writerow([])

    # 5. Average scans per user
    total_scans_all = db.query(Scan).filter(Scan.is_deleted == False).count()
    scans_30d_all = db.query(Scan).filter(Scan.is_deleted == False, Scan.created_at >= thirty_ago).count()
    avg_lifetime = round(total_scans_all / total_users if total_users else 0, 2)
    avg_30d = round(scans_30d_all / total_users if total_users else 0, 2)
    writer.writerow(["Average Scans Per User"])
    writer.writerow(["Lifetime Avg", avg_lifetime])
    writer.writerow(["Last 30 Days Avg", avg_30d])
    writer.writerow([])

    # 6. Most active users (top 10)
    from sqlalchemy import desc
    top_users = (
        db.query(User.email, func.count(Scan.id).label("scan_count"))
        .join(Scan, Scan.user_id == User.id)
        .filter(Scan.is_deleted == False)
        .group_by(User.id)
        .order_by(desc("scan_count"))
        .limit(10)
        .all()
    )
    writer.writerow(["Most Active Users"])
    writer.writerow(["Email", "Scan Count"])
    for u in top_users:
        writer.writerow([u[0], u[1]])
    writer.writerow([])

    # 7. Damage label frequency
    all_labels = []
    for (labels,) in db.query(Scan.damage_labels).filter(
        Scan.is_deleted == False, Scan.damage_labels != None
    ).all():
        if labels:
            all_labels.extend([x.strip() for x in labels.split(",") if x.strip()])
    dl_counter = Counter(all_labels)
    writer.writerow(["Damage Label Frequency"])
    writer.writerow(["Label", "Count"])
    for lbl, cnt in dl_counter.items():
        writer.writerow([lbl, cnt])
    writer.writerow([])

    # 8. Scan file type distribution
    ft_counter = Counter(
        [t[0] or "unknown" for t in db.query(Scan.file_type).filter(Scan.is_deleted == False).all()]
    )
    writer.writerow(["Scan File Type Distribution"])
    writer.writerow(["File Type", "Count"])
    for ft, cnt in ft_counter.items():
        writer.writerow([ft, cnt])
    writer.writerow([])

    # 9. Top report types (last 30 days)
    recent_reports = db.query(DamageReport.report_type).filter(
        DamageReport.generated_at >= thirty_ago
    ).all()
    tr_counter = Counter([r[0] or "unknown" for r in recent_reports])
    writer.writerow(["Top Report Types (Last 30 Days)"])
    writer.writerow(["Type", "Count"])
    for t, cnt in tr_counter.items():
        writer.writerow([t, cnt])
    writer.writerow([])

    # 10. Activity stats (last 14 days)
    week_ago = now - timedelta(days=7)
    fortnight_ago = now - timedelta(days=13)
    day_buckets = {
        (now - timedelta(days=i)).strftime("%Y-%m-%d"): 0
        for i in range(13, -1, -1)
    }
    for scan in db.query(Scan).filter(Scan.is_deleted == False, Scan.created_at >= fortnight_ago).all():
        key = scan.created_at.strftime("%Y-%m-%d")
        if key in day_buckets:
            day_buckets[key] += 1
    active_users_last_7_days = db.query(func.count(User.id)).filter(User.last_login >= week_ago).scalar()
    scans_last_7_days = db.query(func.count(Scan.id)).filter(Scan.created_at >= week_ago, Scan.is_deleted == False).scalar()
    inactive_users = db.query(func.count(User.id)).filter(User.is_active == False).scalar()
    writer.writerow(["Activity Stats (Last 14 Days)"])
    writer.writerow(["Day", "Scan Count"])
    for d, c in day_buckets.items():
        writer.writerow([d, c])
    writer.writerow([])
    writer.writerow(["Active Users Last 7 Days", active_users_last_7_days])
    writer.writerow(["Scans Last 7 Days", scans_last_7_days])
    writer.writerow(["Inactive Users", inactive_users])
    writer.writerow([])

    # 11. Severity trends (last 12 months)
    sev_data = {sev: {label: 0 for label in month_labels} for sev in severities}
    scans_for_sev = db.query(Scan.severity, Scan.created_at).filter(Scan.is_deleted == False).all()
    for sev, created_at in scans_for_sev:
        if created_at and sev in severities:
            label = f"{created_at.year}-{created_at.month:02d}"
            if label in sev_data[sev]:
                sev_data[sev][label] += 1
    writer.writerow(["Severity Trends (Last 12 Months)"])
    writer.writerow(["Month"] + severities)
    for m in month_labels:
        writer.writerow([m] + [sev_data[sev][m] for sev in severities])
    writer.writerow([])

    # 12. Report type distribution (all time)
    report_types_q = db.query(DamageReport.report_type)
    report_types_rows = report_types_q.all()
    rt_counter = Counter([r[0] or "unknown" for r in report_types_rows])
    writer.writerow(["Report Type Distribution (All Time)"])
    writer.writerow(["Type", "Count"])
    for t, cnt in rt_counter.items():
        writer.writerow([t, cnt])
    writer.writerow([])

    output.seek(0)
    return StreamingResponse(
        output,
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=analytics_export.csv"},
    )


# ── STATS (legacy endpoints kept for backward compat) ─────────────────────────

@router.get("/stats/activity")
def activity_stats(db: Session = Depends(get_db), admin: User = Depends(require_admin)):
    """Scan activity per day (last 14 days) + active/inactive user counts."""
    now = datetime.now(timezone.utc)
    week_ago = now - timedelta(days=7)
    fortnight_ago = now - timedelta(days=13)

    day_buckets = {
        (now - timedelta(days=i)).strftime("%Y-%m-%d"): 0
        for i in range(13, -1, -1)
    }
    for scan in (
        db.query(Scan)
        .filter(Scan.is_deleted == False, Scan.created_at >= fortnight_ago)
        .all()
    ):
        key = scan.created_at.strftime("%Y-%m-%d")
        if key in day_buckets:
            day_buckets[key] += 1

    return {
        "active_users_last_7_days": db.query(func.count(User.id))
            .filter(User.last_login >= week_ago).scalar(),
        "scans_last_7_days": db.query(func.count(Scan.id))
            .filter(Scan.created_at >= week_ago, Scan.is_deleted == False).scalar(),
        "inactive_users": db.query(func.count(User.id))
            .filter(User.is_active == False).scalar(),
        "scans_per_day": [{"day": d, "count": c} for d, c in day_buckets.items()],
    }


@router.get("/stats/platform")
def platform_stats(db: Session = Depends(get_db), admin: User = Depends(require_admin)):
    """Overall platform statistics for the admin dashboard."""
    severity_counts = {
        sev: db.query(func.count(Scan.id))
               .filter(Scan.severity == sev, Scan.is_deleted == False)
               .scalar()
        for sev in ("low", "medium", "high", "critical")
    }
    return {
        "total_users":  db.query(func.count(User.id)).scalar(),
        "pro_users":    db.query(func.count(User.id)).filter(User.plan == "pro").scalar(),
        "free_users":   db.query(func.count(User.id)).filter(User.plan == "free").scalar(),
        "admin_users":  db.query(func.count(User.id)).filter(User.plan == "admin").scalar(),
        "total_scans":  db.query(func.count(Scan.id)).filter(Scan.is_deleted == False).scalar(),
        "severity_breakdown": severity_counts,
    }


# ── USERS ─────────────────────────────────────────────────────────────────────

@router.get("/users")
def list_users(db: Session = Depends(get_db), admin: User = Depends(require_admin)):
    users = db.query(User).order_by(User.created_at.desc()).all()
    return {"users": [_serialize_user(u, db) for u in users], "total": len(users)}


@router.get("/users/search")
def search_users(
    query: str = Query(""),
    plan: str = Query(""),
    active: str = Query(""),
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
):
    q = db.query(User)
    if query:
        q = q.filter(or_(User.email.ilike(f"%{query}%"), User.full_name.ilike(f"%{query}%")))
    if plan in ("free", "pro", "admin"):
        q = q.filter(User.plan == plan)
    if active == "true":
        q = q.filter(User.is_active == True)
    elif active == "false":
        q = q.filter(User.is_active == False)
    users = q.order_by(User.created_at.desc()).all()
    return {"users": [_serialize_user(u, db) for u in users], "total": len(users)}


@router.put("/users/{user_id}/plan")
def update_user_plan(
    user_id: int,
    plan: str = Query(...),
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
):
    if plan not in ("free", "pro", "admin"):
        raise HTTPException(status_code=400, detail="Plan must be: free | pro | admin.")
    user = _get_user_or_404(db, user_id)
    user.plan = plan  # type: ignore[assignment]
    user.is_admin = plan == "admin"  # type: ignore[assignment]
    db.commit()
    return {"detail": f"User '{user.email}' plan updated to '{plan}'."}


@router.put("/users/{user_id}/activate")
def toggle_user_active(
    user_id: int,
    active: bool = Query(...),
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
):
    user = _get_user_or_404(db, user_id)
    user.is_active = active  # type: ignore[assignment]
    db.commit()
    return {"detail": f"User '{user.email}' {'activated' if active else 'deactivated'}."}


@router.delete("/users/{user_id}")
def delete_user(
    user_id: int,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
):
    user = _get_user_or_404(db, user_id)
    if (
        user.email.strip().lower() == PROTECTED_ADMIN_EMAIL
        and admin.email.strip().lower() != PROTECTED_ADMIN_EMAIL
    ):
        raise HTTPException(status_code=403, detail="This protected admin account cannot be deleted.")

    scan_ids = [sid for (sid,) in db.query(Scan.id).filter(Scan.user_id == user_id).all()]
    if scan_ids:
        db.query(DamageReport).filter(
            or_(DamageReport.user_id == user_id, DamageReport.scan_id.in_(scan_ids))
        ).delete(synchronize_session=False)
        db.query(ScanChatMessage).filter(
            or_(ScanChatMessage.user_id == user_id, ScanChatMessage.scan_id.in_(scan_ids))
        ).delete(synchronize_session=False)
    else:
        db.query(DamageReport).filter(DamageReport.user_id == user_id).delete(synchronize_session=False)
        db.query(ScanChatMessage).filter(ScanChatMessage.user_id == user_id).delete(synchronize_session=False)

    db.query(Notification).filter(Notification.user_id == user_id).delete(synchronize_session=False)
    db.query(SubscriptionRequest).filter(SubscriptionRequest.user_id == user_id).delete(synchronize_session=False)
    db.query(UsageLog).filter(UsageLog.user_id == user_id).delete(synchronize_session=False)
    db.query(Scan).filter(Scan.user_id == user_id).delete(synchronize_session=False)
    db.delete(user)
    db.commit()
    return {"detail": "User and all related data deleted successfully."}


# ── SCANS ─────────────────────────────────────────────────────────────────────

@router.delete("/scans/{scan_id}/hard-delete")
def hard_delete_scan(
    scan_id: int,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
):
    scan = db.query(Scan).filter(Scan.id == scan_id).first()
    if not scan:
        raise HTTPException(status_code=404, detail="Scan not found.")
    db.delete(scan)
    db.commit()
    return {"detail": f"Scan {scan_id} permanently deleted."}


# ── SUBSCRIPTION REQUESTS ─────────────────────────────────────────────────────

@router.get("/subscription-requests")
def list_subscription_requests(
    status: str = Query("pending"),
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=100),
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
):
    normalized = status.strip().lower()
    query = db.query(SubscriptionRequest)
    if normalized in ("pending", "approved", "rejected"):
        query = query.filter(SubscriptionRequest.status == normalized)

    total = query.count()
    requests = (
        query.order_by(SubscriptionRequest.created_at.desc())
        .offset((page - 1) * per_page)
        .limit(per_page)
        .all()
    )
    user_ids = {r.user_id for r in requests}
    users_map = {u.id: u for u in db.query(User).filter(User.id.in_(user_ids)).all()}

    items = []
    for req in requests:
        u = users_map.get(req.user_id)
        items.append({
            "id": req.id,
            "user_id": req.user_id,
            "user_email": u.email if u else "",
            "user_full_name": u.full_name if u else "",
            "user_plan": u.plan if u else "free",
            "payment_method": req.payment_method,
            "payment_number": req.payment_number,
            "receipt_path": req.receipt_path,
            "status": req.status,
            "admin_note": req.admin_note,
            "created_at": req.created_at,
            "reviewed_at": req.reviewed_at,
        })
    return {"items": items, "total": total, "page": page, "per_page": per_page}


@router.put("/subscription-requests/{request_id}/review")
def review_subscription_request(
    request_id: int,
    action: str = Query(...),
    note: str = Query(""),
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
):
    action = action.strip().lower()
    if action not in ("approve", "reject"):
        raise HTTPException(status_code=400, detail="Action must be 'approve' or 'reject'.")

    req = db.query(SubscriptionRequest).filter(SubscriptionRequest.id == request_id).first()
    if not req:
        raise HTTPException(status_code=404, detail="Subscription request not found.")
    if str(req.status) != "pending":
        raise HTTPException(status_code=400, detail="Only pending requests can be reviewed.")

    user = _get_user_or_404(db, int(req.user_id))  # type: ignore[arg-type]

    if action == "approve":
        req.status = "approved"  # type: ignore[assignment]
        user.plan = "pro"  # type: ignore[assignment]
        notif_message = "Your pro subscription request was approved."
        notif_type = "success"
    else:
        req.status = "rejected"  # type: ignore[assignment]
        notif_message = "Your pro subscription request was rejected."
        notif_type = "warning"

    req.admin_note = note.strip() or None  # type: ignore[assignment]
    req.reviewed_by_admin_id = admin.id  # type: ignore[assignment]
    req.reviewed_at = datetime.now(timezone.utc)  # type: ignore[assignment]

    full_message = f"{notif_message} Note: {req.admin_note}" if str(req.admin_note or "") else notif_message
    db.add(Notification(user_id=user.id, message=full_message, type=notif_type))
    db.commit()
    return {"detail": f"Subscription request '{action}d' successfully."}