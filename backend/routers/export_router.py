# export_router.py
# Lets users export their entire scan history as CSV or JSON

from fastapi import APIRouter, Depends
from fastapi.responses import PlainTextResponse, JSONResponse
from sqlalchemy.orm import Session

from database import get_db
from models.db_models import User, Scan
from auth import get_current_active_user
from services.export_service import export_scans_csv, export_scans_json

router = APIRouter(prefix="/export", tags=["Export"])


@router.get("/scans/csv")
def export_csv(
    db          : Session = Depends(get_db),
    current_user: User    = Depends(get_current_active_user)
):
    """Downloads all user scans as a CSV file"""
    scans = db.query(Scan).filter(
        Scan.user_id   == current_user.id,
        Scan.is_deleted == False
    ).order_by(Scan.created_at.desc()).all()

    csv_content = export_scans_csv(scans)

    return PlainTextResponse(
        content    = csv_content,
        media_type = "text/csv",
        headers    = {
            "Content-Disposition": "attachment; filename=my_scans.csv"
        }
    )


@router.get("/scans/json")
def export_json(
    db          : Session = Depends(get_db),
    current_user: User    = Depends(get_current_active_user)
):
    """Downloads all user scans as a JSON file"""
    scans = db.query(Scan).filter(
        Scan.user_id   == current_user.id,
        Scan.is_deleted == False
    ).order_by(Scan.created_at.desc()).all()

    json_content = export_scans_json(scans)

    return PlainTextResponse(
        content    = json_content,
        media_type = "application/json",
        headers    = {
            "Content-Disposition": "attachment; filename=my_scans.json"
        }
    )