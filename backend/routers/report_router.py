
# Helper: check if user is admin
def _is_admin(user) -> bool:
    return getattr(user, "plan", "") == "admin" or bool(getattr(user, "is_admin", False))

# Helper to fetch scan for admin or owner
def _get_scan_for_report(db, scan_id, current_user):
    query = db.query(Scan).filter(Scan.id == scan_id, Scan.is_deleted == False)
    if not _is_admin(current_user):
        query = query.filter(Scan.user_id == current_user.id)
    scan = query.first()
    if not scan:
        raise HTTPException(status_code=404, detail="Scan not found.")
    return scan
# report_router.py
# Generates and downloads damage reports
# Also handles the WebSocket progress endpoint
# pyright: reportGeneralTypeIssues=false, reportArgumentType=false, reportAttributeAccessIssue=false, reportOperatorIssue=false, reportCallIssue=false

from fastapi import APIRouter, Depends, HTTPException, WebSocket, WebSocketDisconnect
from fastapi.responses import FileResponse, PlainTextResponse
from schemas import ReportOut
from sqlalchemy.orm import Session
from pathlib import Path

from database import get_db
from models.db_models import User, Scan, DamageReport
from auth import get_current_active_user
from services.report_service import generate_report_text, save_report
from services.websocket_service import connect, disconnect, send_progress
from config import settings

router = APIRouter(prefix="/reports", tags=["Reports"])


def _build_scan_and_user_data(scan: Scan, current_user: User) -> tuple[dict, dict]:
    detections = []
    if scan.result_json:
        detections = scan.result_json.get("detections", [])

    scan_data = {
        "id"                : scan.id,
        "original_filename" : scan.original_filename,
        "file_type"         : scan.file_type,
        "created_at"        : str(scan.created_at),
        "severity"          : scan.severity,
        "total_detections"  : scan.total_detections,
        "confidence_avg"    : scan.confidence_avg,
        "processing_time_ms": scan.processing_time_ms,
        "damage_labels"     : scan.damage_labels,
        "detections"        : detections,
    }

    user_data = {
        "full_name": current_user.full_name,
        "email"    : current_user.email,
        "plan"     : current_user.plan,
    }

    return scan_data, user_data


def _upsert_damage_report(
    db: Session,
    scan_id: int,
    user_id: int,
    report_type: str,
    report_path: str,
) -> int:
    existing = db.query(DamageReport).filter(
        DamageReport.scan_id     == scan_id,
        DamageReport.user_id     == user_id,
        DamageReport.report_type == report_type,
    ).first()

    if existing:
        existing.pdf_path = report_path
        db.commit()
        return int(existing.id)

    new_report = DamageReport(
        scan_id     = scan_id,
        user_id     = user_id,
        report_type = report_type,
        pdf_path    = report_path,
    )
    db.add(new_report)
    db.commit()
    db.refresh(new_report)
    return int(new_report.id)


@router.post("/{scan_id}/generate")
def generate_report(
    scan_id     : int,
    report_type : str     = "summary",
    db          : Session = Depends(get_db),
    current_user: User    = Depends(get_current_active_user)
):
    """
    Generates a text report for a scan.
    report_type: "summary" | "detailed" | "insurance"
    Admins can generate reports for any scan.
    """
    # only summary for free plan (non-admin)
    if (
        not settings.ENABLE_ALL_PRO_FEATURES
        and current_user.plan == "free"
        and report_type != "summary"
        and not _is_admin(current_user)
    ):
        raise HTTPException(
            status_code=403,
            detail="Detailed and insurance reports require a Pro plan."
        )

    scan = _get_scan_for_report(db, scan_id, current_user)
    scan_data, user_data = _build_scan_and_user_data(scan, current_user)

    # generate the report text
    report_text = generate_report_text(scan_data, user_data, report_type)
    report_path = save_report(report_text, scan.id, current_user.id, report_type)
    report_id = _upsert_damage_report(db, scan_id, current_user.id, report_type, report_path)

    return {
        "report_id"  : report_id,
        "report_type": report_type,
        "download_url": f"/api/v1/reports/{report_id}/download",
    }


@router.post("/{scan_id}/generate-preview")
def generate_report_preview(
    scan_id     : int,
    report_type : str     = "summary",
    db          : Session = Depends(get_db),
    current_user: User    = Depends(get_current_active_user)
):
    """Generates report text + PDF and returns preview content with download link. Admins can preview any scan."""
    if (
        not settings.ENABLE_ALL_PRO_FEATURES
        and current_user.plan == "free"
        and report_type != "summary"
        and not _is_admin(current_user)
    ):
        raise HTTPException(
            status_code=403,
            detail="Detailed and insurance reports require a Pro plan."
        )

    scan = _get_scan_for_report(db, scan_id, current_user)
    scan_data, user_data = _build_scan_and_user_data(scan, current_user)
    report_text = generate_report_text(scan_data, user_data, report_type)
    report_path = save_report(report_text, scan.id, current_user.id, report_type)
    report_id = _upsert_damage_report(db, scan_id, current_user.id, report_type, report_path)

    return {
        "report_id": report_id,
        "scan_id": scan_id,
        "report_type": report_type,
        "report_text": report_text,
        "download_url": f"/api/v1/reports/{report_id}/download",
        "filename": f"damage_report_{scan_id}_{report_type}.pdf",
    }


@router.get("/{report_id}/download")
def download_report(
    report_id   : int,
    db          : Session = Depends(get_db),
    current_user: User    = Depends(get_current_active_user)
):
    """Downloads the generated report file"""
    report = db.query(DamageReport).filter(
        DamageReport.id      == report_id,
        DamageReport.user_id == current_user.id,
    ).first()

    if not report:
        raise HTTPException(status_code=404, detail="Report not found.")

    if not report.pdf_path or not Path(report.pdf_path).exists():
        raise HTTPException(status_code=404, detail="Report file not found on server.")

    return FileResponse(
        path         = report.pdf_path,
        media_type   = "application/pdf",
        filename     = f"damage_report_{report.scan_id}_{report.report_type}.pdf",
    )


@router.get("/my/all")
def get_my_reports(
    db          : Session = Depends(get_db),
    current_user: User    = Depends(get_current_active_user)
):
    """Lists all reports generated by current user"""
    reports = db.query(DamageReport).filter(
        DamageReport.user_id == current_user.id
    ).order_by(DamageReport.generated_at.desc()).all()
    return [
        {
            "id"          : r.id,
            "scan_id"     : r.scan_id,
            "report_type" : r.report_type,
            "generated_at": str(r.generated_at),
            "download_url": f"/api/v1/reports/{r.id}/download",
        }
        for r in reports
    ]


# ── WEBSOCKET — live scan progress ────────────────────────────

@router.websocket("/ws/{user_id}")
async def websocket_progress(user_id: int, websocket: WebSocket):
    """
    Frontend connects here to receive real-time scan progress.
    URL: ws://localhost:8000/api/v1/reports/ws/{user_id}

    Messages sent to frontend:
      {step: "uploading",  percent: 10, message: "Saving your file..."}
      {step: "analyzing",  percent: 40, message: "Running AI model..."}
      {step: "annotating", percent: 70, message: "Drawing bounding boxes..."}
      {step: "saving",     percent: 90, message: "Saving results..."}
      {step: "done",       percent: 100, message: "Complete!"}
      {step: "redirect",   scan_id: 42}
    """
    await connect(user_id, websocket)
    try:
        # keep connection alive — frontend sends "ping", we ignore it
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        disconnect(user_id, websocket)